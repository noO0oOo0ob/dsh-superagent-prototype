/** Versioned identity catalog; publication does not activate or protect a running Session. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, lstat, open, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import type { Store } from '../app/store.ts'
import { RoleModelSchema } from '../policy.ts'
import { family } from '../kv.ts'

const IdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
const CapabilitySchema = z.enum(['read', 'write', 'shell', 'web', 'delegate'])
const capabilities = CapabilitySchema.options
export const IdentityFilesSchema = z.object({ 'agent.yaml': z.string(), 'AGENTS.md': z.string(), 'SOUL.md': z.string() }).strict()
/** The complete editable source of one identity revision. */
export type IdentityFiles = z.infer<typeof IdentityFilesSchema>
const DefinitionSchema = z.object({ id: IdSchema, name: z.string().trim().min(1).max(200), parent: IdSchema.optional(),
  model: RoleModelSchema.nullable().optional(), preset: z.string().trim().min(1).max(200).nullable().optional(),
  capabilities: z.array(CapabilitySchema).optional() }).strict()
const SourceSchema = z.object({ id: IdSchema, revision: z.number().int().positive(), files: IdentityFilesSchema }).strict()
const EffectiveSchema = z.object({ model: RoleModelSchema.nullable().optional(), preset: z.string().nullable().optional(), capabilities: z.array(CapabilitySchema) }).strict()
const PreviewSchema = z.object({ id: IdSchema, revision: z.number().int().positive(), definition: DefinitionSchema, files: IdentityFilesSchema,
  sources: z.array(SourceSchema), effective: EffectiveSchema, text: z.string(), digest: z.string() }).strict()
const VersionSchema = PreviewSchema.extend({ version: z.literal(1), savedAt: z.string() }).strict()
/** Exact source revisions and resolved defaults shown before publication. */
export type IdentityPreview = z.infer<typeof PreviewSchema>
/** Immutable catalog publication, independent of any Session binding. */
export type IdentityVersion = z.infer<typeof VersionSchema>
const heads = family<number>('personal-identity-head:')
const versions = family<IdentityVersion, [string, number]>('personal-identity-version:')
const DraftExportSchema = z.object({ version: z.literal(1), revision: z.number().int().positive() }).strict()
const exports = family<z.infer<typeof DraftExportSchema>>('personal-identity-export:')
const names = Object.keys(IdentityFilesSchema.shape) as (keyof IdentityFiles)[]
/** Reload the identity and preview again before publishing a concurrent edit. */
export class IdentityConflict extends Error {}
/** Invalid identity files or draft locations supplied by the editor. */
export class IdentityInputError extends Error {}

/** Owns identity versions, deterministic inheritance previews and explicit local draft exchange. */
export class Identities {
  constructor(private readonly store: Pick<Store, 'get' | 'set' | 'keys' | 'atomic'>, readonly draftRoot: string, private readonly maxChars: () => number) {
    if (!this.get('common')) {
      const files: IdentityFiles = { 'agent.yaml': 'id: common\nname: Common\n', 'AGENTS.md': '', 'SOUL.md': '' }
      const preview = this.preview(files)
      this.publish(files, 0, preview.digest)
    }
  }
  /** Returns one immutable publication, or the current publication when revision is omitted. */
  get(id: string, revision?: number): IdentityVersion | undefined {
    IdSchema.parse(id)
    const current = revision ?? this.store.get(heads(id))
    if (current === undefined) return undefined
    z.number().int().positive().parse(current)
    const value = this.store.get(versions(id, current))
    if (value === undefined) {
      if (revision !== undefined) return undefined
      throw new Error(`Missing identity version ${id}@${current}`)
    }
    return VersionSchema.parse(value)
  }
  /** Lists current publications and parents with newer versions; this catalog has no runtime activation. */
  list() {
    return { activation: 'catalog-only' as const, draftRoot: this.draftRoot,
      identities: this.store.keys(heads).map(key => {
        const id = key.slice(heads.prefix.length), current = this.get(id)!
        return { id, name: current.definition.name, revision: current.revision, savedAt: current.savedAt,
          outdatedParents: current.sources.slice(0, -1).filter(source => this.get(source.id)?.revision !== source.revision).map(source => source.id) }
      }).sort((a, b) => a.id.localeCompare(b.id)) }
  }
  /** Resolves the parent's published snapshot and intersects capabilities without changing stored versions. */
  preview(input: IdentityFiles): IdentityPreview {
    const files = IdentityFilesSchema.parse(input)
    if (names.reduce((total, name) => total + files[name].length, 0) > this.maxChars()) throw new IdentityInputError('Identity files exceed the configured prompt budget')
    let yaml: unknown
    try { yaml = parse(files['agent.yaml'], { maxAliasCount: 0, uniqueKeys: true }) }
    catch (error) { throw new IdentityInputError('Invalid identity YAML', { cause: error }) }
    const definition = DefinitionSchema.parse(yaml)
    if (definition.id === 'common' ? !!definition.parent : !definition.parent) throw new IdentityInputError('Only the common identity may omit a parent')
    const parent = definition.parent ? this.get(definition.parent) : undefined
    if (definition.parent && !parent) throw new IdentityInputError(`Parent identity ${definition.parent} is not published`)
    if (parent?.sources.some(source => source.id === definition.id)) throw new IdentityInputError('Identity inheritance cycle')
    const revision = (this.get(definition.id)?.revision ?? 0) + 1
    const sources = [...parent?.sources ?? [], { id: definition.id, revision, files }]
    const effective = { ...parent?.effective,
      ...(definition.model !== undefined ? { model: definition.model } : {}), ...(definition.preset !== undefined ? { preset: definition.preset } : {}),
      capabilities: (parent?.effective.capabilities ?? capabilities).filter(value => definition.capabilities === undefined || definition.capabilities.includes(value)) }
    const text = sources.flatMap(source => (['AGENTS.md', 'SOUL.md'] as const).filter(name => source.files[name].trim()).map(name =>
      `## ${source.id}@${source.revision} / ${name}\n\n${source.files[name]}`)).join('\n\n')
    if (text.length > this.maxChars()) throw new IdentityInputError('Inherited identity text exceeds the configured prompt budget')
    const result = { id: definition.id, revision, definition, files, sources, effective, text }
    return { ...result, digest: createHash('sha256').update(JSON.stringify(result)).digest('hex') }
  }
  /** Atomically publishes exactly the previewed files and parent revisions; stale edits are rejected. */
  publish(files: IdentityFiles, baseRevision: number, previewDigest: string): IdentityVersion {
    z.number().int().nonnegative().parse(baseRevision)
    return this.store.atomic(() => {
      const preview = this.preview(files)
      if (preview.revision !== baseRevision + 1) throw new IdentityConflict('Identity changed; reload before publishing')
      if (preview.digest !== previewDigest) throw new IdentityConflict('Identity preview changed; preview the current parents and files again')
      const value: IdentityVersion = { ...preview, version: 1, savedAt: new Date().toISOString() }
      this.store.set(versions(value.id, value.revision), value)
      this.store.set(heads(value.id), value.revision)
      return value
    })
  }
  private async directory(id: string, revision: number, create: boolean): Promise<string> {
    IdSchema.parse(id)
    const configured = resolve(this.draftRoot)
    if (create) await mkdir(configured, { recursive: true, mode: 0o700 })
    if ((await lstat(configured)).isSymbolicLink()) throw new IdentityInputError('Identity draft root must not be a symbolic link')
    const root = await realpath(configured), directory = join(root, `${id}-v${revision}`)
    if (create) await mkdir(directory, { mode: 0o700 }).catch(error => { if (!isExists(error)) throw error })
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new IdentityInputError('Identity draft directory must be a real directory')
    return directory
  }
  private async readFile(path: string): Promise<string> {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > this.maxChars() * 4) throw new IdentityInputError('Identity draft file exceeds the configured budget or is not a regular file')
      const buffer = Buffer.alloc(this.maxChars() * 4 + 1)
      let size = 0
      while (size < buffer.length) {
        const { bytesRead } = await file.read(buffer, size, buffer.length - size, size)
        if (!bytesRead) break
        size += bytesRead
      }
      if (size === buffer.length) throw new IdentityInputError('Identity draft file exceeds the configured budget')
      return buffer.subarray(0, size).toString('utf8')
    } finally { await file.close() }
  }
  /** Exports current sources to a managed draft directory; existing edited files are never overwritten. */
  async exportDraft(id: string): Promise<string> {
    const current = this.get(id)
    if (!current) throw new Error(`Identity ${id} is not published`)
    const directory = await this.directory(id, current.revision, true), missing: (keyof IdentityFiles)[] = []
    for (const name of names) {
      let text: string
      try { text = await this.readFile(join(directory, name)) }
      catch (error) { if (isMissing(error)) { missing.push(name); continue }; throw error }
      if (text !== current.files[name]) throw new IdentityConflict(`Draft ${name} was edited; import it before exporting`)
    }
    for (const name of missing) {
      const file = await open(join(directory, name), 'wx', 0o600)
      try { await file.writeFile(current.files[name]) } finally { await file.close() }
    }
    this.store.atomic(() => {
      if (this.get(id)!.revision !== current.revision) throw new IdentityConflict('Identity changed during export; export the current version again')
      this.store.set(exports(id), { version: 1, revision: current.revision })
    })
    return directory
  }
  /** Reads local files into an unpublished editor draft; it never changes the published version. */
  async importDraft(id: string): Promise<{ files: IdentityFiles; baseRevision: number }> {
    const current = this.get(id)
    if (!current) throw new Error(`Identity ${id} is not published`)
    const exported = DraftExportSchema.parse(this.store.get(exports(id)))
    if (exported.revision !== current.revision) throw new IdentityConflict('The exported draft version changed; compare it with the current publication before importing')
    const directory = await this.directory(id, exported.revision, false)
    const files: IdentityFiles = { 'agent.yaml': await this.readFile(join(directory, 'agent.yaml')), 'AGENTS.md': await this.readFile(join(directory, 'AGENTS.md')), 'SOUL.md': await this.readFile(join(directory, 'SOUL.md')) }
    if (this.preview(files).id !== id) throw new IdentityInputError('Imported identity ID does not match its directory')
    return { files, baseRevision: current.revision }
  }
}
const isExists = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'EEXIST'
const isMissing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT'
