/** Immutable Hook facts publish to real directories without coupling retries to task execution. */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Store } from '../src/app/store.ts'
import { contextRef } from '../src/core/context.ts'
import { HookConfigSchema, HookEventSchema, Hooks, type HookConfig, type HookEvent } from '../src/personal/hooks.ts'

let directory: string, store: Store, hooks: Hooks, config: HookConfig, now: number, lifetime: AbortController
const event = (id = 'task-created'): HookEvent => ({ version: 1, id, kind: 'task.state', state: 'created', taskId: 'task-1',
  at: '2026-11-04T01:00:00.000Z', contexts: [contextRef('source-request')] })
function boot() {
  store = new Store(join(directory, 'state.sqlite'))
  hooks = new Hooks({ store, config: () => config, now: () => now, signal: lifetime.signal })
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'personal-hooks-'))
  config = HookConfigSchema.parse({ enabled: true, directory: join(directory, 'sink'), retryDelayMs: 10 })
  now = Date.parse('2026-11-04T01:00:00.000Z'); lifetime = new AbortController(); boot()
})
afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks() })

/** Simulates a crash window after publishing the file but before acknowledging it in SQLite. */
function failAcknowledgement() {
  const original = store.set.bind(store)
  return vi.spyOn(store, 'set').mockImplementation((name, value) => {
    if (value && typeof value === 'object' && 'state' in value && value.state === 'sent') throw new Error('Lost acknowledgement')
    original(name, value)
  })
}
const jsonFiles = (path = config.directory) => readdirSync(path).filter(name => name.endsWith('.json'))

it('publishes one immutable JSON event across duplicate records, concurrent passes and restarts', async () => {
  const input = event()
  hooks.record(input); hooks.record(input)
  await Promise.all([hooks.pass(), hooks.pass()])
  const delivery = hooks.deliveries(input.id)[0]!
  expect(delivery.state).toBe('sent')
  expect(jsonFiles()).toHaveLength(1)
  expect(JSON.parse(readFileSync(delivery.path!, 'utf8'))).toEqual(input)
  expect(readdirSync(config.directory).some(name => name.endsWith('.tmp'))).toBe(false)
  store.close(); boot()
  hooks.record(input); expect(await hooks.pass()).toBe(0)
  expect(hooks.list()).toHaveLength(1); expect(jsonFiles()).toHaveLength(1)
  expect(() => hooks.record({ ...input, state: 'completed' })).toThrow('different facts')
})

it('recovers a published file whose SQLite acknowledgement failed without duplicating it', async () => {
  hooks.record(event())
  const failure = failAcknowledgement()
  await hooks.pass(); failure.mockRestore()
  expect(hooks.deliveries()[0]?.state).toBe('failed')
  expect(jsonFiles()).toHaveLength(1)
  store.close(); boot(); now += 10
  expect(await hooks.pass()).toBe(1)
  expect(hooks.deliveries()[0]).toMatchObject({ state: 'sent', attempts: 2 })
  expect(jsonFiles()).toHaveLength(1)
})

it('preserves a conflicting user file and allows retry after the conflict is removed', async () => {
  hooks.record(event())
  const failure = failAcknowledgement(); await hooks.pass(); failure.mockRestore()
  const file = join(config.directory, jsonFiles()[0]!)
  writeFileSync(file, 'User content must remain')
  now += 10; await hooks.pass()
  expect(hooks.deliveries()[0]?.state).toBe('failed')
  expect(readFileSync(file, 'utf8')).toBe('User content must remain')
  unlinkSync(file); hooks.retry(hooks.deliveries()[0]!.id); await hooks.pass()
  expect(hooks.deliveries()[0]?.state).toBe('sent')
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(event())
})

it('does not follow a conflicting output symlink', async () => {
  hooks.record(event())
  const failure = failAcknowledgement(); await hooks.pass(); failure.mockRestore()
  const file = join(config.directory, jsonFiles()[0]!), target = join(directory, 'private-note')
  writeFileSync(target, 'Private original'); unlinkSync(file); symlinkSync(target, file)
  now += 10; await hooks.pass()
  expect(hooks.deliveries()[0]?.state).toBe('failed')
  expect(readFileSync(target, 'utf8')).toBe('Private original')
})

it('binds a queued delivery to its directory and requires explicit replay when configuration changes', async () => {
  const first = config.directory; hooks.record(event())
  config = { ...config, directory: join(directory, 'new-sink') }
  await hooks.pass()
  expect(hooks.deliveries()[0]?.state).toBe('blocked')
  expect(existsSync(first)).toBe(false); expect(existsSync(config.directory)).toBe(false)
  expect(() => hooks.retry(hooks.deliveries()[0]!.id)).toThrow('original hook directory')
  hooks.replay('task-created'); await hooks.pass()
  expect(jsonFiles()).toHaveLength(1)
  expect(hooks.deliveries().map(item => item.state).sort()).toEqual(['blocked', 'sent'])
  config = { ...config, directory: first }
  hooks.retry(hooks.deliveries().find(item => item.directory === first)!.id); await hooks.pass()
  expect(jsonFiles(first)).toHaveLength(1)
})

it('rejects a symlink directory rebound after an attempted publication', async () => {
  const first = join(directory, 'first'), second = join(directory, 'second'), alias = join(directory, 'alias')
  mkdirSync(first); mkdirSync(second); symlinkSync(first, alias)
  config = { ...config, directory: alias }; hooks.record(event())
  const failure = failAcknowledgement(); await hooks.pass(); failure.mockRestore()
  unlinkSync(alias); symlinkSync(second, alias)
  now += 10; await hooks.pass()
  expect(hooks.deliveries()[0]).toMatchObject({ state: 'failed', canonicalDirectory: realpathSync(first) })
  expect(jsonFiles(first)).toHaveLength(1); expect(jsonFiles(second)).toHaveLength(0)
})

it('records facts while disabled but only publishes historical facts after explicit replay', async () => {
  config = HookConfigSchema.parse({})
  hooks.record(event()); expect(await hooks.pass()).toBe(0)
  expect(hooks.deliveries()).toEqual([])
  config = HookConfigSchema.parse({ enabled: true, directory: join(directory, 'sink') })
  expect(await hooks.pass()).toBe(0)
  hooks.replay('task-created'); await hooks.pass(); expect(jsonFiles()).toHaveLength(1)
  hooks.replay('task-created'); expect(await hooks.pass()).toBe(0)
})

it('bounds publication and does not let disabled event kinds starve selected facts', async () => {
  config = { ...config, maxPerPass: 1 }
  for (const name of ['a', 'b', 'c']) hooks.record(event(name))
  hooks.record({ version: 1, id: 'result', kind: 'result.saved', at: event().at, contexts: event().contexts,
    taskId: 'task-1', resultId: 'result-1', artifactIds: [] })
  config = { ...config, kinds: ['result.saved'] }
  expect(await hooks.pass()).toBe(1)
  expect(hooks.deliveries('result')[0]?.state).toBe('sent')
  expect(hooks.deliveries('a')[0]?.state).toBe('pending')
  config = { ...config, kinds: ['task.state'] }; expect(await hooks.pass()).toBe(1)
  expect(hooks.deliveries().filter(item => item.state === 'sent')).toHaveLength(2)
})

it('rolls facts and queued delivery back with their producer transaction', () => {
  expect(() => store.atomic(() => { hooks.record(event()); throw new Error('Task transaction failed') })).toThrow('failed')
  expect(hooks.list()).toEqual([]); expect(hooks.deliveries()).toEqual([])
})

it('stops publication when the Host closes and rejects invalid hook configuration and facts', async () => {
  hooks.record(event())
  const pending = hooks.pass(); lifetime.abort(); await pending
  expect(hooks.deliveries()[0]?.state).toBe('pending')
  expect(existsSync(config.directory) ? jsonFiles().length : 0).toBe(0)
  expect(HookConfigSchema.safeParse({ enabled: true, directory: '../relative' }).success).toBe(false)
  expect(HookConfigSchema.safeParse({ kinds: ['task.state', 'task.state'] }).success).toBe(false)
  expect(HookEventSchema.safeParse({ ...event(), kind: 'shell.exec', command: 'untrusted' }).success).toBe(false)
  expect(HookEventSchema.safeParse({ ...event(), contexts: [{ traceId: 'trace-only' }] }).success).toBe(false)
})
