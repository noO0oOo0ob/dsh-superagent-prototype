/** Durable local expert catalog; accepted tasks carry immutable package snapshots. */
import { mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { family } from '../kv.ts'
import type { Store } from '../app/store.ts'
import { ExpertBindingSchema, ExpertId, ExpertSnapshotSchema, type ExpertBinding, type ExpertSelection } from './model.ts'
import { readExpertPackage, type PackageInput, type PackageLimits } from './package.ts'
export const ExpertImportSchema = z.object({ directory: z.string().min(1), format: z.enum(['claude', 'codex', 'portable']).optional(), agents: z.string().optional(), soul: z.string().optional() }).strict()
const entrySchema = z.object({ revision: z.number().int().positive(), enabled: z.boolean(), directory: z.string(), snapshot: ExpertSnapshotSchema })
export type ExpertEntry = z.infer<typeof entrySchema>
const entries = family<ExpertEntry>('expert-package:')
/** A source or catalog changed after the user previewed it. */
export class ExpertConflict extends Error {}
/** Owns package import, preview validation, enablement and exact task selection. */
export class Experts {
  constructor(private readonly store: Pick<Store, 'get' | 'set' | 'keys' | 'atomic'>, private readonly root: string, private readonly limits: () => PackageLimits) {}
  /** Install missing bundled packages without replacing user-owned catalog entries. */
  installBundled(packages: readonly { id: string; directory: string }[]): void {
    const additions = packages.filter(item => !this.store.get(entries(item.id))).map(item => {
      const snapshot = this.preview({ directory: item.directory, format: 'portable' })
      if (snapshot.id !== item.id || snapshot.issues.length) throw new Error(`Invalid bundled expert: ${item.id}`)
      return { revision: 1, enabled: true, directory: item.directory, snapshot }
    })
    this.store.atomic(() => {
      for (const entry of additions) if (!this.store.get(entries(entry.snapshot.id))) this.store.set(entries(entry.snapshot.id), entry)
    })
  }
  list(): ExpertEntry[] { return this.store.keys(entries).map(key => entrySchema.parse(this.store.get(key))) }
  preview(input: PackageInput) { return readExpertPackage(ExpertImportSchema.parse(input), this.limits()) }
  save(input: PackageInput, digest: string, revision: number): ExpertEntry {
    const snapshot = this.preview(input)
    if (snapshot.digest !== digest) throw new ExpertConflict('Package changed; preview again')
    return this.store.atomic(() => {
      const old = this.store.get(entries(snapshot.id))
      if ((old?.revision ?? 0) !== revision) throw new ExpertConflict('Expert revision changed; reload')
      const value = { revision: revision + 1, enabled: false, directory: input.directory, snapshot }
      this.store.set(entries(snapshot.id), value); return value
    })
  }
  enable(id: string, revision: number, enabled: boolean): ExpertEntry {
    ExpertId.parse(id)
    return this.store.atomic(() => {
      const value = entrySchema.parse(this.store.get(entries(id)))
      if (value.revision !== revision) throw new ExpertConflict('Expert revision changed; reload')
      if (enabled && value.snapshot.issues.length) throw new Error(`Resolve compatibility issues before enabling: ${value.snapshot.issues.join('; ')}`)
      const updated = { ...value, enabled, revision: revision + 1 }; this.store.set(entries(id), updated); return updated
    })
  }
  choices() {
    return this.list().filter(entry => entry.enabled).map(({ snapshot }) => ({ id: snapshot.id, digest: snapshot.digest,
      description: snapshot.description, examples: snapshot.examples, exclusions: snapshot.exclusions }))
  }
  select(selection?: ExpertSelection | null): ExpertBinding | undefined {
    if (!selection) return undefined
    const entry = this.store.get(entries(selection.id))
    if (!entry?.enabled) throw new Error('Requested expert is unavailable; use the catalog or explain this to the user')
    if (entry.snapshot.digest !== selection.digest) throw new ExpertConflict('Expert changed since discovery; read the catalog again')
    return ExpertBindingSchema.parse({ snapshot: entry.snapshot, reason: selection.reason })
  }
  /** Materialize captured resources; never reread a mutable source directory on task resume. */
  materialize(binding: ExpertBinding): string {
    const { snapshot } = ExpertBindingSchema.parse(binding), root = join(this.root, snapshot.digest)
    if (!/^[a-f0-9]{64}$/.test(snapshot.digest)) throw new Error('Invalid expert snapshot digest')
    if (existsSync(root) && (lstatSync(root).isSymbolicLink() || !lstatSync(root).isDirectory())) throw new Error('Expert snapshot root was modified')
    mkdirSync(root, { recursive: true, mode: 0o700 })
    for (const [name, content] of Object.entries(snapshot.files)) {
      if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw new Error('Invalid snapshot resource path')
      const path = join(root, name), data = Buffer.from(content, 'base64')
      let directory = root
      for (const part of name.split('/').slice(0, -1)) {
        directory = join(directory, part)
        if (existsSync(directory) && (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory())) throw new Error('Expert snapshot directory was modified')
        mkdirSync(directory, { recursive: true, mode: 0o700 })
      }
      if (existsSync(path)) {
        if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isFile() || !readFileSync(path).equals(data) || !!(lstatSync(path).mode & 0o111) !== snapshot.executables.includes(name)) throw new Error('Expert snapshot resource was modified')
      } else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data, { flag: 'wx', mode: snapshot.executables.includes(name) ? 0o700 : 0o600 }) }
    }
    return root
  }
}
