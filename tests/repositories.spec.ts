/** Real local Git and filesystem acceptance of optional task resources; no remote service or user repository is used. */
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RepositoryConfigSchema, RepositoryRegistry, type RepositoryConfig, type RepositoryHost } from '../src/personal/repositories.ts'

const exec = promisify(execFile)
let directory: string, stateDir: string, git: RepositoryHost['git'], registry: RepositoryRegistry
const signal = () => new AbortController().signal
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'personal-repositories-'))
  stateDir = join(directory, 'state'); await mkdir(stateDir)
  const globalConfig = join(directory, 'empty.gitconfig'); await writeFile(globalConfig, '')
  git = async (args, cwd, signal) => (await exec('git', args, { cwd, signal, timeout: 20_000,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfig, GIT_TERMINAL_PROMPT: '0' } })).stdout
  registry = new RepositoryRegistry({ stateDir, git })
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })
async function repository(name: string): Promise<string> {
  const path = join(directory, name); await mkdir(path)
  await git(['init', '-b', 'main'], path, signal())
  await git(['config', 'user.name', 'Repository test'], path, signal())
  await git(['config', 'user.email', 'repository-test@example.invalid'], path, signal())
  await writeFile(join(path, 'file.txt'), `${name} initial\n`)
  await git(['add', 'file.txt'], path, signal()); await git(['commit', '-m', 'initial'], path, signal())
  return path
}
const selected = (id: string, path: string): RepositoryConfig => ({ id, kind: 'git', path, ref: 'HEAD' })

it('does no filesystem or Git work when a task selects no resources', async () => {
  const run = vi.fn(git), empty = new RepositoryRegistry({ stateDir, git: run })
  expect(await empty.prepare('travel', join(directory, 'no-directory'), empty.select([], []), signal())).toEqual([])
  expect(run).not.toHaveBeenCalled()
  expect(await readdir(directory)).not.toContain('no-directory')
})

it('prepares two isolated repositories without changing source branches or dirty work', async () => {
  const one = await repository('one'), two = await repository('two')
  const base = (await git(['rev-parse', 'HEAD'], one, signal())).trim()
  await writeFile(join(one, 'file.txt'), 'uncommitted user work\n')
  const selections = registry.select([selected('one', one), selected('two', two)], ['one', 'two'])
  const prepared = await registry.prepare('code-task', join(directory, 'task'), selections, signal())
  expect(prepared.map(item => item.id)).toEqual(['one', 'two'])
  expect(prepared[0]!.baseRevision).toBe(base)
  expect(await readFile(join(prepared[0]!.directory, 'file.txt'), 'utf8')).toBe('one initial\n')
  await writeFile(join(prepared[0]!.directory, 'file.txt'), 'task changes\n')
  await git(['add', 'file.txt'], prepared[0]!.directory, signal()); await git(['commit', '-m', 'task change'], prepared[0]!.directory, signal())
  await writeFile(join(prepared[1]!.directory, 'draft.txt'), 'task draft')
  expect(await registry.prepare('code-task', join(directory, 'task'), selections, signal())).toEqual(prepared)
  expect(await readFile(join(prepared[1]!.directory, 'draft.txt'), 'utf8')).toBe('task draft')
  expect((await git(['symbolic-ref', '--short', 'HEAD'], one, signal())).trim()).toBe('main')
  expect((await git(['rev-parse', 'HEAD'], one, signal())).trim()).toBe(base)
  expect(await readFile(join(one, 'file.txt'), 'utf8')).toBe('uncommitted user work\n')
})

it('copies a plain directory once, preserves task edits and verifies the copy marker on reuse', async () => {
  const source = join(directory, 'notes'); await mkdir(source); await writeFile(join(source, 'plan.md'), 'original')
  const selections = registry.select([{ id: 'notes', kind: 'directory', path: source }], ['notes'])
  const [prepared] = await registry.prepare('writing', join(directory, 'task'), selections, signal())
  await writeFile(join(prepared!.directory, 'plan.md'), 'task edit')
  await writeFile(join(source, 'plan.md'), 'source edit')
  await registry.prepare('writing', join(directory, 'task'), selections, signal())
  expect(await readFile(join(prepared!.directory, 'plan.md'), 'utf8')).toBe('task edit')
  expect(await readFile(join(source, 'plan.md'), 'utf8')).toBe('source edit')
  await rm(join(prepared!.directory, '.super-personal-agent-resource.json'))
  await expect(registry.prepare('writing', join(directory, 'task'), selections, signal())).rejects.toThrow('ownership changed')
})

it('uses a provider-neutral remote cache without replacing earlier task branches when fetching another task', async () => {
  const source = await repository('server'), remote = pathToFileURL(source).href
  const configs: RepositoryConfig[] = [{ id: 'remote', kind: 'git', remote, ref: 'main' }]
  const selections = registry.select(configs, ['remote'])
  const [first] = await registry.prepare('first', join(directory, 'first'), selections, signal())
  await writeFile(join(source, 'next.txt'), 'next revision')
  await git(['add', 'next.txt'], source, signal()); await git(['commit', '-m', 'next'], source, signal())
  const [second] = await registry.prepare('second', join(directory, 'second'), selections, signal())
  expect(second!.baseRevision).not.toBe(first!.baseRevision)
  expect(await registry.prepare('first', join(directory, 'first'), selections, signal())).toEqual([first])
  expect((await git(['rev-parse', 'HEAD'], first!.directory, signal())).trim()).toBe(first!.baseRevision)
  const common = (await git(['rev-parse', '--git-common-dir'], first!.directory, signal())).trim()
  await git(['remote', 'set-url', 'origin', 'https://example.invalid/other/repository.git'], common, signal())
  await expect(registry.prepare('first', join(directory, 'first'), selections, signal())).rejects.toThrow('remote changed')
})

it('recovers an interrupted worktree command and keeps completed resources when a later preparation fails', async () => {
  const source = await repository('source'), missing = join(directory, 'later')
  let interrupted = true
  const unreliable = new RepositoryRegistry({ stateDir, git: async (args, cwd, signal) => {
    const result = await git(args, cwd, signal)
    if (interrupted && args[0] === 'worktree' && args[1] === 'add') { interrupted = false; throw new Error('lost completion after worktree creation') }
    return result
  } })
  const selections = unreliable.select([selected('source', source), { id: 'later', kind: 'directory', path: missing }], ['source', 'later'])
  await expect(unreliable.prepare('recovery', join(directory, 'task'), selections, signal())).rejects.toThrow('lost completion')
  await expect(unreliable.prepare('recovery', join(directory, 'task'), selections, signal())).rejects.toThrow()
  const target = join(directory, 'task', 'repositories', 'source')
  await writeFile(join(target, 'uncommitted.txt'), 'keep me')
  await mkdir(missing); await writeFile(join(missing, 'note.md'), 'later resource')
  const prepared = await unreliable.prepare('recovery', join(directory, 'task'), selections, signal())
  expect(prepared).toHaveLength(2)
  expect(await readFile(join(target, 'uncommitted.txt'), 'utf8')).toBe('keep me')
  expect((await git(['worktree', 'list', '--porcelain'], source, signal())).match(/^worktree /gm)).toHaveLength(2)
})

it('rejects changed worktree branches, unowned directories and selection changes without cleaning files', async () => {
  const source = await repository('source'), selections = registry.select([selected('source', source)], ['source'])
  const [prepared] = await registry.prepare('task', join(directory, 'task'), selections, signal())
  await git(['checkout', '--detach', prepared!.baseRevision!], prepared!.directory, signal())
  await expect(registry.prepare('task', join(directory, 'task'), selections, signal())).rejects.toThrow()
  await expect(registry.prepare('other-task', join(directory, 'task'), selections, signal())).rejects.toThrow('different')
  const unowned = join(directory, 'unowned'); await mkdir(join(unowned, 'repositories'), { recursive: true })
  await writeFile(join(unowned, 'repositories', 'keep.txt'), 'keep')
  await expect(registry.prepare('unowned', unowned, selections, signal())).rejects.toThrow('unowned')
  expect(await readFile(join(unowned, 'repositories', 'keep.txt'), 'utf8')).toBe('keep')
})

it('rejects option injection, executable transports, embedded credentials and invalid selected IDs', () => {
  for (const remote of ['ext::sh -c command', '-upload-pack=command', 'https://user:secret@example.invalid/repo.git'])
    expect(RepositoryConfigSchema.safeParse({ id: 'bad', kind: 'git', remote }).success).toBe(false)
  for (const ref of ['--upload-pack=command', 'main^{tree}', 'refs/heads/../main', 'main@{1}'])
    expect(RepositoryConfigSchema.safeParse({ id: 'bad', kind: 'git', path: directory, ref }).success).toBe(false)
  expect(RepositoryConfigSchema.safeParse({ id: 'bad', kind: 'directory', path: '../outside' }).success).toBe(false)
  expect(() => registry.select([], ['missing'])).toThrow('Unknown')
  expect(() => registry.select([selected('same', directory)], ['same', 'same'])).toThrow('once')
  expect(RepositoryConfigSchema.safeParse({ id: 'gitlab', kind: 'git', remote: 'git@gitlab.com:group/project.git' }).success).toBe(true)
})

it('refuses symlink escapes and nested Git metadata in copied resources', async () => {
  const source = join(directory, 'notes'); await mkdir(source)
  await symlink(stateDir, join(source, 'outside'))
  const selections = registry.select([{ id: 'notes', kind: 'directory', path: source }], ['notes'])
  await expect(registry.prepare('copy', join(directory, 'copy'), selections, signal())).rejects.toThrow('symlink')
  await rm(join(source, 'outside'))
  await mkdir(join(source, 'nested')); await writeFile(join(source, 'nested', '.git'), `gitdir: ${stateDir}`)
  await expect(registry.prepare('copy', join(directory, 'copy'), selections, signal())).rejects.toThrow('reserved')
  await rm(join(source, 'nested'), { recursive: true })
  await registry.prepare('copy', join(directory, 'copy'), selections, signal())
})

it('serializes repeated preparation of the same ticket and creates only one worktree', async () => {
  const source = await repository('source'), selections = registry.select([selected('source', source)], ['source'])
  const both = await Promise.all([registry.prepare('same', join(directory, 'same'), selections, signal()), registry.prepare('same', join(directory, 'same'), selections, signal())])
  expect(both[0]).toEqual(both[1])
  expect((await git(['worktree', 'list', '--porcelain'], source, signal())).match(/^worktree /gm)).toHaveLength(2)
})
