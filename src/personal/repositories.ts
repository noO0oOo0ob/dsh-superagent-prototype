/** Optional repository resources with owned task workspaces and provider-neutral Git remotes. */
import { cp, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { key } from '../core/index.ts'

const ResourceId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
const AbsolutePath = z.string().min(1).refine(path => isAbsolute(path) && !/[\0\r\n]/.test(path), 'An absolute local path is required')
const GitRef = z.string().min(1).default('HEAD').refine(ref => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)
  && !ref.includes('..') && !ref.includes('//') && !ref.endsWith('/') && !ref.endsWith('.')
  && ref.split('/').every(part => !part.startsWith('.') && !part.endsWith('.lock')), 'Use a branch, tag or full commit ID')

/** Git accepts many executable URL transports; resource configuration deliberately permits only ordinary Git transports. */
function remoteAllowed(value: string): boolean {
  if (/[\s\0]/.test(value) || value.startsWith('-')) return false
  if (/^[A-Za-z0-9_.-]+@[A-Za-z0-9.-]+:[A-Za-z0-9_./~-]+$/.test(value)) return true
  try {
    const url = new URL(value)
    if (url.search || url.hash || url.password) return false
    if (url.protocol === 'file:') return !url.hostname && !url.username && isAbsolute(decodeURIComponent(url.pathname))
    return ['https:', 'ssh:', 'git:'].includes(url.protocol) && !!url.hostname && !!url.pathname.replace(/^\//, '')
      && (url.protocol === 'ssh:' || !url.username)
  } catch { return false }
}

/** One configured resource: a local Git repository, a remote Git repository, or a plain directory copied per task. */
export const RepositoryConfigSchema = z.discriminatedUnion('kind', [
  z.object({ id: ResourceId, kind: z.literal('git'), path: AbsolutePath.optional(), remote: z.string().refine(remoteAllowed,
    'Use an HTTPS, SSH, Git or local file URL without credentials').optional(), ref: GitRef }).strict()
    .refine(value => !!value.path !== !!value.remote, 'A Git resource needs exactly one local path or remote'),
  z.object({ id: ResourceId, kind: z.literal('directory'), path: AbsolutePath }).strict(),
])
export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>
/** Registry entries have unique IDs; tasks select explicit IDs and never inherit every configured resource. */
export const RepositoryConfigsSchema = z.array(RepositoryConfigSchema).refine(entries => new Set(entries.map(entry => entry.id)).size === entries.length,
  'Duplicate repository resource IDs')
/** A task retains its selected configuration even if the registry changes later. */
export interface RepositorySelection { config: RepositoryConfig; fingerprint: string }
/** Paths and pinned revisions returned to the worker after preparation succeeds. */
export interface PreparedRepository {
  id: string; kind: RepositoryConfig['kind']; directory: string; fingerprint: string
  baseRevision?: string; branch?: string
}
interface PlannedRepository extends PreparedRepository { sourcePath: string; commonDirectory?: string; state: 'planned' | 'ready' }
interface Manifest { version: 1; ticketId: string; directory: string; selections: RepositorySelection[]; repositories: PlannedRepository[] }
interface CacheOwner { version: 1; remote: string; directory: string; stage: string }

const PreparedSchema = z.object({ id: ResourceId, kind: z.enum(['git', 'directory']), directory: AbsolutePath, fingerprint: z.string(),
  baseRevision: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).optional(), branch: z.string().optional(),
  sourcePath: AbsolutePath, commonDirectory: AbsolutePath.optional(), state: z.enum(['planned', 'ready']) }).strict()
const SelectionSchema = z.object({ config: RepositoryConfigSchema, fingerprint: z.string() }).strict()
const ManifestSchema = z.object({ version: z.literal(1), ticketId: z.string(), directory: AbsolutePath,
  selections: z.array(SelectionSchema), repositories: z.array(PreparedSchema) }).strict()
const CacheOwnerSchema = z.object({ version: z.literal(1), remote: z.string(), directory: AbsolutePath, stage: AbsolutePath }).strict()
const DIRECTORY_MARKER = '.super-personal-agent-resource.json'

/** Preparation rejects unknown ownership or changed revisions without resetting or deleting a worker's work. */
export class RepositoryError extends Error {
  constructor(readonly code: 'invalid-selection' | 'unowned-directory' | 'repository-changed' | 'revision-changed' | 'unsafe-path', message: string) {
    super(message)
  }
}

/** Inject the same scoped Git environment used by the executor; no shell command strings are evaluated here. */
export interface RepositoryHost {
  stateDir: string
  git(args: string[], cwd: string, signal: AbortSignal): Promise<string>
}
const fingerprint = (config: RepositoryConfig): string => key('repository-selection-v1', JSON.stringify(config))
const inside = (parent: string, child: string): boolean => { const path = relative(parent, child); return path === '' || !path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path) }
const missing = (error: unknown): boolean => error instanceof Error && 'code' in error && error.code === 'ENOENT'
async function exists(path: string): Promise<boolean> { try { await lstat(path); return true } catch (error) { if (missing(error)) return false; throw error } }
async function readJson(path: string): Promise<unknown | undefined> {
  try { const value: unknown = JSON.parse(await readFile(path, 'utf8')); return value } catch (error) { if (missing(error)) return undefined; throw error }
}
/** A marker is committed by rename before operations that may leave a recoverable worktree or clone behind. */
async function writeJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  try { await rename(temporary, path) } catch (error) { await rm(temporary, { force: true }); throw error }
}
/** Refuse symlinked managed paths, including a directory replaced after a previous run. */
async function checkedDirectory(path: string, create = false): Promise<void> {
  if (create && !await exists(path)) await mkdir(path)
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isDirectory()) throw new RepositoryError('unsafe-path', `Managed path is not a real directory: ${path}`)
}

/** Prepares selected resources independently; completed resources survive a later resource's failure and are checked on retry. */
export class RepositoryRegistry {
  private readonly pending = new Map<string, Promise<unknown>>()
  constructor(private readonly host: RepositoryHost) { AbsolutePath.parse(host.stateDir) }

  /** Resolve explicit resource IDs into snapshots suitable for persisting on a ticket; an empty selection performs no Git work. */
  select(configs: readonly RepositoryConfig[], ids: readonly string[]): RepositorySelection[] {
    const entries = RepositoryConfigsSchema.parse(configs)
    if (new Set(ids).size !== ids.length) throw new RepositoryError('invalid-selection', 'Select each repository resource only once')
    return ids.map(id => {
      const config = entries.find(entry => entry.id === id)
      if (!config) throw new RepositoryError('invalid-selection', `Unknown repository resource: ${id}`)
      return { config, fingerprint: fingerprint(config) }
    })
  }

  /**
   * Prepare or verify each owned task resource. Git revisions are pinned on first preparation; later calls preserve commits and dirty files.
   * @param ticketId - Durable task ID, independent of its current execution attempt.
   * @param directory - The task's existing or new root directory.
   * @param selections - Configuration snapshots returned by select and persisted with the task.
   * @param signal - Cancels before starting more filesystem or Git operations.
   * @returns Isolated worker directories and Git base revisions, in selection order.
   */
  async prepare(ticketId: string, directory: string, selections: readonly RepositorySelection[], signal: AbortSignal): Promise<PreparedRepository[]> {
    AbsolutePath.parse(directory)
    const parsed = z.array(SelectionSchema).parse(selections)
    if (!ticketId || parsed.some(item => item.fingerprint !== fingerprint(item.config)) || new Set(parsed.map(item => item.config.id)).size !== parsed.length)
      throw new RepositoryError('invalid-selection', 'The saved repository selection is invalid')
    if (!parsed.length) return []
    await mkdir(directory, { recursive: true })
    await checkedDirectory(directory)
    const root = await realpath(directory)
    return this.serial(`task:${root}`, async () => {
      signal.throwIfAborted()
      const metadata = join(root, '.super-personal-agent-resources'), manifestPath = join(metadata, 'manifest.json'), repos = join(root, 'repositories')
      if (!await exists(metadata)) await mkdir(metadata, { mode: 0o700 })
      await checkedDirectory(metadata)
      const saved = await readJson(manifestPath)
      let manifest: Manifest
      if (saved !== undefined) {
        manifest = ManifestSchema.parse(saved)
        if (manifest.ticketId !== ticketId || manifest.directory !== root || JSON.stringify(manifest.selections) !== JSON.stringify(parsed))
          throw new RepositoryError('unowned-directory', 'The task directory belongs to a different repository selection or task')
      } else {
        if (await exists(repos)) throw new RepositoryError('unowned-directory', 'The task already contains an unowned repositories directory')
        manifest = { version: 1, ticketId, directory: root, selections: parsed, repositories: [] }
        await writeJson(manifestPath, manifest)
      }
      await checkedDirectory(repos, true)
      for (const selection of parsed) {
        signal.throwIfAborted()
        const config = selection.config, target = join(repos, config.id)
        let plan = manifest.repositories.find(item => item.id === config.id)
        if (!plan) {
          if (await exists(target)) throw new RepositoryError('unowned-directory', `The resource directory is not owned: ${config.id}`)
          plan = await this.plan(ticketId, target, selection, signal)
          manifest.repositories.push(plan)
          await writeJson(manifestPath, manifest)
        }
        if (plan.directory !== target || plan.kind !== config.kind || plan.fingerprint !== selection.fingerprint)
          throw new RepositoryError('unowned-directory', `Saved resource ownership does not match: ${config.id}`)
        if (config.kind === 'git') await this.gitWorkspace(plan, config.remote, signal)
        else await this.directoryWorkspace(plan, metadata, root, signal)
        signal.throwIfAborted()
        plan.state = 'ready'
        await writeJson(manifestPath, manifest)
      }
      return manifest.repositories.map(({ id, kind, directory: path, fingerprint: hash, baseRevision, branch }) =>
        ({ id, kind, directory: path, fingerprint: hash, ...(baseRevision ? { baseRevision, branch } : {}) }))
    })
  }

  private async serial<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(id)
    const result = (async () => { if (previous) await previous.catch(error => { void error /* This operation rechecks durable ownership after the prior failure. */ }); return work() })()
    this.pending.set(id, result)
    try { return await result } finally { if (this.pending.get(id) === result) this.pending.delete(id) }
  }
  private async git(args: string[], cwd: string, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    return (await this.host.git(args, cwd, signal)).trim()
  }
  private async plan(ticketId: string, target: string, selection: RepositorySelection, signal: AbortSignal): Promise<PlannedRepository> {
    const { config } = selection
    if (config.kind === 'directory') {
      const sourcePath = await realpath(config.path)
      await checkedDirectory(sourcePath)
      if (await exists(join(sourcePath, '.git'))) throw new RepositoryError('invalid-selection', `Use kind git for repository resource ${config.id}`)
      return { id: config.id, kind: config.kind, directory: target, fingerprint: selection.fingerprint, sourcePath, state: 'planned' }
    }
    const source = config.remote ? await this.remoteRevision(config.remote, config.ref, signal) : await this.localRevision(config.path!, config.ref, signal)
    const branch = `personal-agent/${key('task-repositories', ticketId)}/${config.id}`
    if (await this.git(['branch', '--list', '--format=%(refname)', branch], source.directory, signal))
      throw new RepositoryError('unowned-directory', `The task branch already exists without an ownership record: ${config.id}`)
    return { id: config.id, kind: config.kind, directory: target, fingerprint: selection.fingerprint, sourcePath: source.directory,
      commonDirectory: source.commonDirectory, baseRevision: source.revision, branch, state: 'planned' }
  }
  private async localRevision(path: string, ref: string, signal: AbortSignal) {
    const directory = await realpath(path)
    await checkedDirectory(directory)
    if (await this.git(['rev-parse', '--is-bare-repository'], directory, signal) !== 'true'
      && await realpath(await this.git(['rev-parse', '--show-toplevel'], directory, signal)) !== directory)
      throw new RepositoryError('invalid-selection', 'A local Git resource must name its repository root')
    const commonDirectory = await realpath(resolve(directory, await this.git(['rev-parse', '--git-common-dir'], directory, signal)))
    const revision = await this.git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], directory, signal)
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) throw new RepositoryError('revision-changed', 'Git returned an invalid commit ID')
    return { directory, commonDirectory, revision }
  }
  private async remoteRevision(remote: string, ref: string, signal: AbortSignal) {
    const state = await realpath(this.host.stateDir), caches = join(state, 'repository-cache')
    await checkedDirectory(caches, true)
    const id = key('remote-repository-v1', remote), directory = join(caches, `${id}.git`), ownerPath = join(caches, `${id}.json`), stage = join(caches, `${id}.clone`)
    return this.serial(`remote:${id}`, async () => {
      signal.throwIfAborted()
      const saved = await readJson(ownerPath)
      const owner: CacheOwner = { version: 1, remote, directory, stage }
      if (saved === undefined) {
        if (await exists(directory) || await exists(stage)) throw new RepositoryError('unowned-directory', 'A remote cache exists without its ownership record')
        await writeJson(ownerPath, owner)
      } else if (JSON.stringify(CacheOwnerSchema.parse(saved)) !== JSON.stringify(owner)) {
        throw new RepositoryError('repository-changed', 'Remote cache ownership changed')
      }
      if (!await exists(directory)) {
        if (await exists(stage)) { await checkedDirectory(stage); await rm(stage, { recursive: true }) }
        await this.git(['clone', '--bare', '--no-local', '--', remote, stage], caches, signal)
        signal.throwIfAborted()
        await rename(stage, directory)
      }
      await checkedDirectory(directory)
      if (await this.git(['rev-parse', '--is-bare-repository'], directory, signal) !== 'true'
        || await this.git(['remote', 'get-url', 'origin'], directory, signal) !== remote)
        throw new RepositoryError('repository-changed', 'The remote cache no longer belongs to this resource')
      // Explicit FETCH_HEAD resolution never prunes or resets task branches in this shared bare cache.
      await this.git(['fetch', '--no-tags', 'origin', ref], directory, signal)
      return this.localRevision(directory, 'FETCH_HEAD', signal)
    })
  }
  private async gitWorkspace(plan: PlannedRepository, remote: string | undefined, signal: AbortSignal): Promise<void> {
    if (!plan.branch || !plan.baseRevision || !plan.commonDirectory) throw new RepositoryError('unowned-directory', 'Git preparation record is incomplete')
    const source = await realpath(plan.sourcePath)
    const common = await realpath(resolve(source, await this.git(['rev-parse', '--git-common-dir'], source, signal)))
    if (common !== plan.commonDirectory) throw new RepositoryError('repository-changed', `The source repository changed: ${plan.id}`)
    if (remote && await this.git(['remote', 'get-url', 'origin'], source, signal) !== remote)
      throw new RepositoryError('repository-changed', `The resource remote changed: ${plan.id}`)
    if (!await exists(plan.directory)) {
      if (plan.state === 'ready') throw new RepositoryError('unowned-directory', `The prepared worktree was removed: ${plan.id}`)
      const branchExists = await this.git(['branch', '--list', '--format=%(refname)', plan.branch], source, signal)
      if (branchExists) {
        const revision = await this.git(['rev-parse', '--verify', '--end-of-options', `refs/heads/${plan.branch}`], source, signal)
        if (revision !== plan.baseRevision) throw new RepositoryError('revision-changed', `The unfinished task branch moved: ${plan.id}`)
        await this.git(['worktree', 'add', '--', plan.directory, plan.branch], source, signal)
      } else await this.git(['worktree', 'add', '-b', plan.branch, '--', plan.directory, plan.baseRevision], source, signal)
    }
    await checkedDirectory(plan.directory)
    const actualCommon = await realpath(resolve(plan.directory, await this.git(['rev-parse', '--git-common-dir'], plan.directory, signal)))
    const actualBranch = await this.git(['symbolic-ref', '--quiet', '--short', 'HEAD'], plan.directory, signal)
    const actualRoot = await realpath(await this.git(['rev-parse', '--show-toplevel'], plan.directory, signal))
    if (actualCommon !== plan.commonDirectory || actualBranch !== plan.branch || actualRoot !== plan.directory)
      throw new RepositoryError('repository-changed', `The worktree or branch changed: ${plan.id}`)
    try { await this.git(['merge-base', '--is-ancestor', plan.baseRevision, 'HEAD'], plan.directory, signal) }
    catch (error) { signal.throwIfAborted(); throw new RepositoryError('revision-changed', `The worktree no longer descends from its pinned revision: ${plan.id}`) }
  }
  private async directoryWorkspace(plan: PlannedRepository, metadata: string, root: string, signal: AbortSignal): Promise<void> {
    if (inside(plan.sourcePath, root)) throw new RepositoryError('unsafe-path', `The task directory is inside its source resource: ${plan.id}`)
    const owner = { version: 1, fingerprint: plan.fingerprint, sourcePath: plan.sourcePath, directory: plan.directory }
    if (await exists(plan.directory)) {
      await checkedDirectory(plan.directory)
      if (JSON.stringify(await readJson(join(plan.directory, DIRECTORY_MARKER))) !== JSON.stringify(owner))
        throw new RepositoryError('unowned-directory', `The copied directory ownership changed: ${plan.id}`)
      // Atomic rename publishes only a complete copied directory, including recovery after a crash before the manifest update.
      return
    }
    if (plan.state === 'ready') throw new RepositoryError('unowned-directory', `The prepared directory was removed: ${plan.id}`)
    const stage = join(metadata, `copy-${plan.id}`)
    if (await exists(stage)) { await checkedDirectory(stage); await rm(stage, { recursive: true }) }
    await cp(plan.sourcePath, stage, { recursive: true, dereference: false, errorOnExist: true, force: false,
      filter: async path => {
        signal.throwIfAborted()
        const info = await lstat(path)
        if (basename(path) === '.git' || basename(path) === DIRECTORY_MARKER)
          throw new RepositoryError('unsafe-path', `Directory resource contains reserved repository metadata: ${plan.id}`)
        if (info.isSymbolicLink() || !info.isFile() && !info.isDirectory())
          throw new RepositoryError('unsafe-path', `Directory resource contains a symlink or special file: ${plan.id}`)
        return true
      } })
    await writeJson(join(stage, DIRECTORY_MARKER), owner)
    signal.throwIfAborted()
    await rename(stage, plan.directory)
  }
}
