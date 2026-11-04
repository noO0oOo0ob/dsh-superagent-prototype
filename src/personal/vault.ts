/** Immutable Markdown exports into an explicitly configured local Obsidian Vault. */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { ResultRecord } from '../app/results.ts'
import { StoredFileSchema, type StoredFile } from '../messaging/files.ts'
import type { Store } from '../app/store.ts'
import { family } from '../kv.ts'

const directory = z.string().min(1).refine(value => !isAbsolute(value) && !/[\\\x00-\x1f:]/.test(value)
  && value.split('/').every(part => part !== '' && part !== '.' && part !== '..'), 'Use a relative directory without parent segments')

/** Disabled by default; the root must already exist, while the export subdirectory may be created. */
export const VaultConfigSchema = z.object({
  enabled: z.boolean().default(false),
  root: z.string().refine(value => value === '' || isAbsolute(value) && !value.includes('\0'), 'Use an absolute Vault path').default(''),
  directory: directory.default('Personal Agent'),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !value.root) ctx.addIssue({ code: 'custom', path: ['root'], message: 'An enabled Vault needs an existing absolute root' })
})
export type VaultConfig = z.infer<typeof VaultConfigSchema>

const hex = z.string().regex(/^[a-f0-9]{64}$/)
const ExportSchema = z.object({
  version: z.literal(1), id: hex, resultId: z.string(), ticketId: z.string(), at: z.string(),
  root: z.string().refine(value => isAbsolute(value) && !value.includes('\0')), directory,
  content: z.string(), digest: hex, canonicalRoot: z.string().optional(),
  state: z.enum(['pending', 'written', 'unchanged', 'preserved']),
  files: z.array(z.object({ id: z.string(), file: StoredFileSchema }).strict()).optional(),
  path: z.string().optional(), uri: z.string().optional(), error: z.string().optional(),
}).strict()

/** A durable export intent. `preserved` means an existing file differs and was left untouched. */
export type VaultExport = z.infer<typeof ExportSchema>
export const vaultExports = family<VaultExport>('personal-vault-export:')

const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const exportId = (resultId: string, root: string, directory: string) => digest(JSON.stringify(['vault-v1', resultId, root, directory]))
const attachmentName = (file: StoredFile) => {
  let name = ''
  for (const point of file.fileName) { if (Buffer.byteLength(name + point) > 180) break; name += point }
  return `${file.digest}-${name}`
}
const fileName = (resultId: string) => `${digest(resultId)}.md`
const codeIs = (error: unknown, code: string) => error instanceof Error && 'code' in error && error.code === code

/** Render a result snapshot, with JSON-quoted YAML scalars and only stable context references. */
export function vaultMarkdown(result: ResultRecord, files: { id: string; file: StoredFile }[] = []): string {
  const fields = { schema: 1, result_id: result.id, ticket_id: result.ticketId, assignment_id: result.assignmentId,
    created_at: result.at, state: result.state, title: result.title, result_url: result.url,
    context_refs: result.contexts.map(({ id, traceId, triggerId }) => ({ id, trace_id: traceId, trigger_id: triggerId })) }
  return `---\npersonal_agent:\n${Object.entries(fields).map(([name, value]) => `  ${name}: ${JSON.stringify(value)}`).join('\n')}\n---\n\n# ${result.title.replace(/[\r\n]+/g, ' ')}\n\n${result.summary}\n${files.length ? '\n' + files.map(item => `[${item.file.fileName.replace(/[\[\]]/g, '_')}](<Attachments/${encodeURIComponent(attachmentName(item.file))}>)`).join('\n') + '\n' : ''}`
}

/**
 * Persists export intents separately from task execution and publishes files without replacing existing content.
 * Call `enqueue` in the result transaction, then retry `publish` through an independent durable effect.
 */
export class Vault {
  constructor(private readonly store: Pick<Store, 'get' | 'set' | 'keys' | 'atomic'>,
    private readonly config: () => VaultConfig, private readonly artifacts?: { get(id: string): ResultRecord | undefined; materialize(id: string): Promise<{ file: StoredFile; bytes: Buffer }> }) {}

  /** Return a validated export intent; malformed persisted paths never reach the filesystem. */
  get(id: string): VaultExport | undefined {
    const stored = this.store.get(vaultExports(id))
    if (!stored) return undefined
    const item = ExportSchema.parse(stored)
    if (item.id !== id || item.id !== exportId(item.resultId, item.root, item.directory) || item.digest !== digest(item.content))
      throw new Error('Vault export snapshot is inconsistent')
    return item
  }

  /** List export statuses for the panel, optionally restricted to one result. */
  list(resultId?: string): VaultExport[] {
    return this.store.keys(vaultExports).flatMap(name => this.get(name.slice(vaultExports.prefix.length)) ?? [])
      .filter(item => !resultId || item.resultId === resultId).sort((a, b) => b.at.localeCompare(a.at))
  }

  /** Freeze the result and destination; disabled exports do not create state or touch the filesystem. */
  enqueue(result: ResultRecord): VaultExport | undefined {
    const config = VaultConfigSchema.parse(this.config())
    if (!config.enabled) return undefined
    const files = [...(result.file ? [{ id: result.id, file: result.file }] : []), ...(result.artifacts ?? []).flatMap(ref => {
      const artifact = this.artifacts?.get(ref.id)
      return artifact?.file ? [{ id: ref.id, file: artifact.file }] : []
    })]
    const root = resolve(config.root), id = exportId(result.id, root, config.directory), content = vaultMarkdown(result, files)
    return this.store.atomic(() => {
      const previous = this.get(id)
      if (previous) {
        if (previous.digest !== digest(content)) throw new Error('An immutable Vault result changed; use a new result ID')
        return previous
      }
      const item: VaultExport = { version: 1, id, resultId: result.id, ticketId: result.ticketId, at: result.at,
        root, directory: config.directory, content, ...(files.length ? { files } : {}), digest: digest(content), state: 'pending' }
      this.store.set(vaultExports(id), item)
      return item
    })
  }

  /** Publish or inspect one export; disk errors remain retryable without rerunning its worker. */
  async publish(id: string): Promise<VaultExport> {
    let item = this.get(id)
    if (!item) throw new Error('Vault export intent is missing')
    try {
      this.authorize(item)
      const rootStat = await lstat(item.root)
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Vault root must be an existing directory, not a symlink')
      const canonicalRoot = await realpath(item.root)
      if (item.canonicalRoot && item.canonicalRoot !== canonicalRoot) throw new Error('Vault root changed since this export was bound')
      item = { ...item, canonicalRoot }
      this.store.set(vaultExports(id), item)
      let parent = canonicalRoot
      for (const segment of [...item.directory.split('/'), 'Results']) {
        await this.checkDirectory(item, parent)
        parent = join(parent, segment)
        try { await mkdir(parent, { mode: 0o700 }) }
        catch (error) { if (!codeIs(error, 'EEXIST')) throw error }
        await this.checkDirectory(item, parent)
      }
      if (item.files?.length) {
        const folder = join(parent, 'Attachments')
        try { await mkdir(folder, { mode: 0o700 }) } catch (error) { if (!codeIs(error, 'EEXIST')) throw error }
        await this.checkDirectory(item, folder)
        for (const attachment of item.files) {
          if (!this.artifacts) throw new Error('Vault attachment storage is unavailable')
          const actual = await this.artifacts.materialize(attachment.id)
          if (actual.file.digest !== attachment.file.digest || actual.bytes.length !== attachment.file.size
            || createHash('sha256').update(actual.bytes).digest('hex') !== attachment.file.digest) throw new Error('Vault attachment snapshot changed')
          const target = join(folder, attachmentName(attachment.file))
          const prior = await this.existing(target, actual.bytes)
          if (prior === 'preserved') throw new Error('Vault attachment was edited; existing bytes were preserved')
          if (!prior) {
            const temporary = join(folder, `.${attachment.file.digest}-${randomUUID()}.tmp`)
            const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
            try {
              try { await handle.writeFile(actual.bytes); await handle.sync() } finally { await handle.close() }
              this.authorize(item); await this.checkDirectory(item, folder)
              try { await link(temporary, target) }
              catch (error) { if (!codeIs(error, 'EEXIST')) throw error }
              if (await this.existing(target, actual.bytes) !== 'unchanged') throw new Error('Vault attachment collision; existing bytes were preserved')
            } finally { await unlink(temporary) }
          }
        }
        const directoryHandle = await open(folder, constants.O_RDONLY | constants.O_NOFOLLOW)
        try { await directoryHandle.sync() } finally { await directoryHandle.close() }
      }
      const target = join(parent, fileName(item.resultId))
      let state: 'written' | 'unchanged' | 'preserved' | undefined = await this.existing(target, item.content)
      if (!state) {
        const temporary = join(parent, `.${fileName(item.resultId)}.${randomUUID()}.tmp`)
        const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
        try {
          try { await handle.writeFile(item.content, 'utf8'); await handle.sync() }
          finally { await handle.close() }
          this.authorize(item)
          await this.checkDirectory(item, parent)
          try { await link(temporary, target); state = 'written' }
          catch (error) {
            if (!codeIs(error, 'EEXIST')) throw error
            state = await this.existing(target, item.content)
            if (!state) throw new Error('Vault result disappeared during publication; retry the export')
          }
        } finally { await unlink(temporary) }
      }
      await this.checkDirectory(item, parent)
      const parentHandle = await open(parent, constants.O_RDONLY | constants.O_NOFOLLOW)
      try { await parentHandle.sync() } finally { await parentHandle.close() }
      const done: VaultExport = { ...item, state, path: target, uri: `obsidian://open?path=${encodeURIComponent(target)}` }
      delete done.error
      this.store.set(vaultExports(id), done)
      return done
    } catch (error) {
      this.store.set(vaultExports(id), { ...item, error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  private authorize(item: VaultExport): void {
    const config = VaultConfigSchema.parse(this.config())
    if (!config.enabled) throw new Error('Vault export is disabled; re-enable it to resume pending exports')
    if (resolve(config.root) !== item.root || config.directory !== item.directory)
      throw new Error('Vault destination changed; restore the original destination to resume this export')
  }

  private async checkDirectory(item: VaultExport, path: string): Promise<void> {
    if (await realpath(item.root) !== item.canonicalRoot || (await lstat(item.root)).isSymbolicLink())
      throw new Error('Vault root changed during publication')
    let current = item.canonicalRoot!
    for (const segment of relative(current, path).split(sep).filter(Boolean)) {
      current = join(current, segment)
      const stat = await lstat(current)
      if (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(current) !== current)
        throw new Error('Vault export directories must not contain symlinks or non-directory entries')
    }
  }

  private async existing(path: string, content: string | Buffer): Promise<'unchanged' | 'preserved' | undefined> {
    try {
      const stat = await lstat(path)
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Vault result must be a regular file, not a symlink')
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const actual = await handle.stat()
        if (!actual.isFile()) throw new Error('Vault result must be a regular file')
        const expected = typeof content === 'string' ? Buffer.from(content) : content
        return actual.size === expected.length && (await handle.readFile()).equals(expected) ? 'unchanged' : 'preserved'
      } finally { await handle.close() }
    } catch (error) { if (codeIs(error, 'ENOENT')) return undefined; throw error }
  }
}
