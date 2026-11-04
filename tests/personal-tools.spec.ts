/** Main schedule tools bind saved local requests and preserve explicit control scope. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Store } from '../src/app/store.ts'
import { personalTools } from '../src/app/personal-tools.ts'
import type { Tool } from '../src/app/tools/tool.ts'
import type { Trigger } from '../src/core/index.ts'
import { Schedules } from '../src/personal/schedules.ts'

let directory: string, store: Store, schedules: Schedules, tools: Tool[], current: Trigger | undefined
const requestPass = vi.fn()
const request = (id: string, source = 'main'): Trigger => ({ id, source, actor: { source, id: 'owner' }, human: true, addressed: 'direct',
  at: '2026-11-04T01:00:00.000Z', text: 'Every day, summarize my project.', threads: [{ source, id }], meta: {} })
const spec = { id: 'daily', title: 'Daily summary', text: 'Summarize my project.',
  when: { kind: 'interval', firstAt: '2026-11-04T02:00:00.000Z', everyMs: 86_400_000 } }
async function call(name: string, input: unknown, signal = new AbortController().signal) {
  const tool = tools.find(tool => tool.name === `personal_agent_${name}`)!
  return tool.execute(tool.schema.parse(input), signal)
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'personal-schedule-tools-')); store = new Store(join(directory, 'state.sqlite'))
  current = request('original'); store.triggers.save(current); requestPass.mockClear()
  schedules = new Schedules({ store, authorize: origin => origin.human, now: () => Date.parse('2026-11-04T01:00:00.000Z'),
    receive: trigger => { if (store.triggers.get(trigger.id)) return 'duplicate'; store.triggers.save(trigger); return 'stored' } })
  tools = personalTools({ store, schedules, currentRequest: () => current, requestPass })
})
afterEach(() => { store.close(); rmSync(directory, { recursive: true, force: true }) })

it('exposes model-representable schemas and binds new schedules to the actual local request', async () => {
  for (const tool of tools) expect(() => z.toJSONSchema(tool.schema)).not.toThrow()
  expect(schedules.list()).toEqual([])
  await call('schedule_create', { ...spec, trigger_id: 'original' })
  expect(schedules.get('daily')?.spec.originTriggerId).toBe('original')
  expect(requestPass).toHaveBeenCalledOnce()
  expect(await call('schedules', {})).toMatchObject({ items: [{ id: 'daily', state: 'active', origin_trigger_id: 'original' }], next_offset: null })
  await expect(call('schedule_create', { ...spec, id: 'other', trigger_id: 'original', originTriggerId: 'foreign' })).rejects.toThrow()
})

it('refuses stale, external, non-human and invented approving requests', async () => {
  for (const value of [request('external', 'connector-work'), { ...request('system'), human: false }]) {
    current = value; store.triggers.save(value)
    await expect(call('schedule_create', { ...spec, trigger_id: value.id })).rejects.toThrow('local human request')
  }
  current = request('newer'); store.triggers.save(current)
  await expect(call('schedule_create', { ...spec, trigger_id: 'original' })).rejects.toThrow('latest')
  await expect(call('schedule_create', { ...spec, trigger_id: 'invented' })).rejects.toThrow('latest')
  expect(schedules.list()).toEqual([])
})

it('requires current human intent for updates and controls and preserves cross-source isolation', async () => {
  await call('schedule_create', { ...spec, trigger_id: 'original' })
  current = request('change'); store.triggers.save(current)
  await call('schedule_update', { ...spec, text: 'Summarize only open work.', revision: 1, trigger_id: current.id })
  expect(schedules.get('daily')).toMatchObject({ revision: 2, spec: { originTriggerId: 'change', text: 'Summarize only open work.' } })
  await call('schedule_control', { trigger_id: current.id, action: 'pause', id: 'daily' })
  expect(schedules.get('daily')?.state).toBe('paused')
  await call('schedule_control', { trigger_id: current.id, action: 'resume', id: 'daily' })
  expect(schedules.get('daily')?.state).toBe('active')
  const other = request('external', 'connector-work'); store.triggers.save(other)
  schedules.create({ ...spec, id: 'work', originTriggerId: other.id })
  await expect(call('schedule_control', { trigger_id: current.id, action: 'stop', id: 'work' })).rejects.toThrow('another source')
  await call('schedule_control', { trigger_id: current.id, action: 'stop', id: 'daily' })
  expect(schedules.get('daily')?.state).toBe('stopped')
})

it('does not mutate schedules after cancellation', async () => {
  const cancelled = new AbortController(); cancelled.abort()
  await expect(call('schedule_create', { ...spec, trigger_id: 'original' }, cancelled.signal)).rejects.toThrow()
  expect(schedules.list()).toEqual([]); expect(requestPass).not.toHaveBeenCalled()
})
