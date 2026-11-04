/** Scheduled instructions preserve authorization, occurrence identity and restart ordering. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Store } from '../src/app/store.ts'
import { Engine, type Trigger } from '../src/core/index.ts'
import { ScheduleSpecSchema, SchedulerOptionsSchema, Schedules } from '../src/personal/schedules.ts'

let directory: string, store: Store, schedules: Schedules, engine: Engine
let now: number, allowed: boolean, fail: boolean, filtered: boolean
let options = SchedulerOptionsSchema.parse({})
const text = 'Prepare the daily project summary.'
const origin: Trigger = { id: 'request-1', source: 'main', actor: { source: 'main', id: 'owner' }, human: true, addressed: 'direct',
  threads: [{ source: 'main', id: 'conversation' }], at: '2026-11-04T00:00:00.000Z', text: 'Run a daily project summary at 09:00.',
  channel: { source: 'main', thread: 'conversation', address: { sessionId: 'main-session' } }, meta: {} }
const iso = (time = now) => new Date(time).toISOString()
const once = (id = 'daily') => ({ id, title: 'Project summary', text, originTriggerId: origin.id, when: { kind: 'once' as const, at: iso() } })
const receive = vi.fn((trigger: Trigger) => {
  const outcome = engine.receive(trigger)
  if (fail) throw new Error('Intake failed after writing')
  return outcome
})
function boot() {
  store = new Store(join(directory, 'state.sqlite'))
  engine = new Engine({ repo: store, now: () => iso(),
    scope: { scope: () => filtered ? { listened: false, reason: 'not_selected' } : { listened: true, observed: false } },
    policy: () => ({ version: 'v1', paused: false, evalTimeoutMs: 1000, admitsInferred: () => false,
      revalidate: () => allowed, gate: trigger => schedules.authorizedTrigger(trigger)
        ? { admissible: true, strength: 'explicit', basis: { via: 'addressed', addressed: 'direct' } }
        : { admissible: false, reason: 'invalid_schedule' } }),
    assessor: { request: vi.fn() }, executor: { start: vi.fn(), deliver: vi.fn(), stop: vi.fn() },
    outbox: { send: vi.fn(), status: () => undefined, withdraw: vi.fn() } })
  schedules = new Schedules({ store, receive, authorize: request => allowed && request.id === origin.id && request.human,
    now: () => now, options: () => options })
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'personal-schedules-'))
  now = Date.parse('2026-11-04T01:00:00.000Z'); allowed = true; fail = false; filtered = false
  options = SchedulerOptionsSchema.parse({ retryDelayMs: 100, maxAttempts: 2 })
  receive.mockClear(); boot(); store.triggers.save(origin)
})
afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks() })

it('dispatches a one-shot instruction once across restarts and keeps its original context and reply target', () => {
  schedules.create(once())
  expect(schedules.pass()).toBe(1)
  const run = schedules.runs()[0]!
  expect(run.state).toBe('accepted')
  expect(run.trigger.channel).toEqual(origin.channel)
  expect(run.trigger.threads).not.toEqual(origin.threads)
  expect(run.trigger.meta).toMatchObject({ originalSource: 'main', originalTriggerId: origin.id, executionId: run.id })
  const accepted = engine.decide(run.trigger.id, { kind: 'accept', title: 'Daily summary', scope: text, reason: 'Scheduled by owner' })
  expect(accepted.ticketId).toBeTruthy()
  expect(schedules.get('daily')?.state).toBe('completed')
  store.close(); boot()
  expect(schedules.pass()).toBe(0)
  expect(receive).toHaveBeenCalledTimes(1)
  expect(schedules.originFor(run.trigger)?.id).toBe(origin.id)
  expect(() => schedules.retry(run.id)).toThrow()
})

it('rolls intake writes back, persists retry intent, and retries the same occurrence after restart', () => {
  fail = true; schedules.create(once()); schedules.pass()
  const before = schedules.runs()[0]!
  expect(before).toMatchObject({ state: 'pending', attempts: 1, failures: 1 })
  expect(store.triggers.get(before.trigger.id)).toBeUndefined()
  store.close(); boot(); fail = false
  expect(schedules.pass()).toBe(0)
  now += 100
  expect(schedules.pass()).toBe(1)
  expect(schedules.runs()).toHaveLength(1)
  expect(schedules.runs()[0]).toMatchObject({ id: before.id, state: 'accepted', attempts: 2 })
  expect(receive.mock.calls.map(([trigger]) => trigger.id)).toEqual([before.trigger.id, before.trigger.id])
})

it('exhausts automatic intake retries before an explicit retry and never retries accepted tasks', () => {
  fail = true; schedules.create(once()); schedules.pass(); now += 100; schedules.pass()
  const run = schedules.runs()[0]!
  expect(run.state).toBe('failed')
  now += 1000; expect(schedules.pass()).toBe(0)
  fail = false; schedules.retry(run.id); schedules.pass()
  expect(schedules.run(run.id)?.state).toBe('accepted')
  expect(() => schedules.retry(run.id)).toThrow()
})

it('coalesces interval downtime and preserves pause, resume and terminal stop', () => {
  schedules.create({ ...once(), when: { kind: 'interval', firstAt: iso(now - 10_000), everyMs: 1000 } })
  schedules.pause('daily'); expect(schedules.pass()).toBe(0)
  schedules.resume('daily'); expect(schedules.pass()).toBe(1)
  expect(schedules.get('daily')?.nextAt).toBe(iso(now + 1000))
  expect(schedules.runs()).toHaveLength(1)
  now += 1000; schedules.pass(); expect(schedules.runs()).toHaveLength(2)
  schedules.stop('daily'); now += 20_000; expect(schedules.pass()).toBe(0)
  expect(() => schedules.resume('daily')).toThrow('ended')
})

it('revalidates authorization, rejects forged triggers and cancels stopped pending executions', () => {
  allowed = false
  expect(() => schedules.create(once())).toThrow('authorized')
  allowed = true; schedules.create(once()); allowed = false; schedules.pass()
  const run = schedules.runs()[0]!
  expect(run.state).toBe('blocked'); expect(receive).not.toHaveBeenCalled()
  allowed = true; schedules.retry(run.id)
  expect(schedules.authorizedTrigger({ ...run.trigger, text: 'Different work' })).toBe(false)
  expect(schedules.authorizedTrigger({ ...run.trigger, actor: { source: 'main', id: 'owner' } })).toBe(false)
  schedules.stop('daily')
  expect(schedules.run(run.id)?.state).toBe('cancelled')
  expect(schedules.authorizedTrigger(run.trigger)).toBe(false)
  expect(() => schedules.retry(run.id)).toThrow()
  expect(schedules.pass()).toBe(0)
})

it('uses a new message only for explicit retry after confirmed filtering', () => {
  filtered = true; schedules.create(once()); schedules.pass()
  const rejected = schedules.runs()[0]!
  expect(rejected.state).toBe('blocked')
  expect(store.triggers.disposition(rejected.trigger.id)?.filtered).toBeTruthy()
  filtered = false; schedules.retry(rejected.id); schedules.pass()
  const accepted = schedules.run(rejected.id)!
  expect(accepted.state).toBe('accepted')
  expect(accepted.id).toBe(rejected.id)
  expect(accepted.trigger.id).not.toBe(rejected.trigger.id)
  expect(schedules.authorizedTrigger(rejected.trigger)).toBe(false)
})

it('bounds a due pass and retains distinct logical schedules and executions', () => {
  options = SchedulerOptionsSchema.parse({ maxDuePerPass: 2 })
  for (const id of ['first', 'second', 'third']) schedules.create(once(id))
  expect(schedules.pass()).toBe(2)
  expect(receive).toHaveBeenCalledTimes(2)
  expect(schedules.pass()).toBe(1)
  expect(new Set(schedules.runs().map(run => run.trigger.id)).size).toBe(3)
})

it('replaces future instructions under a new revision and rejects stale edits and invalid dates', () => {
  fail = true; schedules.create(once()); schedules.pass()
  const old = schedules.runs()[0]!
  const changed = schedules.update('daily', { ...once(), text: 'Prepare a weekly summary.' }, 1)
  expect(changed.revision).toBe(2)
  expect(schedules.run(old.id)?.state).toBe('cancelled')
  expect(() => schedules.update('daily', once(), 1)).toThrow('changed')
  fail = false; schedules.pass()
  expect(schedules.runs().find(run => run.revision === 2)?.trigger.text).toBe('Prepare a weekly summary.')
  expect(ScheduleSpecSchema.safeParse({ ...once(), when: { kind: 'once', at: 'tomorrow' } }).success).toBe(false)
  expect(ScheduleSpecSchema.safeParse({ ...once(), when: { kind: 'interval', firstAt: iso(), everyMs: 0 } }).success).toBe(false)
  expect(SchedulerOptionsSchema.safeParse({ maxDuePerPass: 0 }).success).toBe(false)
})
