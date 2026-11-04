// @vitest-environment jsdom
/** Personal configuration drafts and explicit recovery actions through the management page. */
import { beforeEach, expect, it, vi } from 'vitest'
import type { ApiResponse } from '../src/app/api.ts'
import { PersonalConfigSchema } from '../src/personal/config.ts'
import { ScheduleSpecSchema } from '../src/personal/schedules.ts'
import { en, zh } from '../src/client/locales.ts'
import { all, at, click, field, mount, text, type, usePanel } from './fixtures/panel.tsx'

usePanel()
type View = ApiResponse<'GET personal'>
let current: View
let requests: { path: string; method: string; body: Record<string, unknown> }[]
let bots: unknown[]
let events: ApiResponse<'GET personal/hooks'>
let error: string | undefined
const atTime = '2026-11-04T06:00:00Z'
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const schedule = (): View['schedules'][number] => ({ version: 1, revision: 1, state: 'active', createdAt: atTime, updatedAt: atTime,
  nextAt: atTime, spec: { id: 'daily', title: 'Daily review', text: 'Review work', originTriggerId: 'message-1', when: { kind: 'once', at: atTime } } })

beforeEach(() => {
  current = { revision: 0, config: PersonalConfigSchema.parse({}), connectors: {}, deliveries: [], vault: [], routeDecisions: [], schedules: [], runs: [], hooks: [] }
  requests = []; bots = []; events = []; error = undefined
  const fallback = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/super-personal-agent/api/', ''), method = init?.method ?? 'GET'
    if (!path.startsWith('personal')) return fallback(input, init)
    const body: Record<string, unknown> = init?.body ? JSON.parse(String(init.body)) : {}
    requests.push({ path, method, body })
    if (path === 'personal' && method === 'GET') return error ? response({ error }, 503) : response(current)
    if (path === 'personal' && method === 'PUT') {
      if (body.revision !== current.revision) return response({ error: 'Revision conflict' }, 409)
      const parsed = PersonalConfigSchema.safeParse(body.config)
      if (!parsed.success) return response({ error: 'Invalid configuration' }, 400)
      current = { ...current, revision: current.revision + 1, config: parsed.data }
      return response({ revision: current.revision, config: current.config })
    }
    if (path === 'personal/bots') return response({ bots })
    if (path.startsWith('personal/deliveries/')) { current.deliveries = []; return response({ recorded: true }) }
    if (path === 'personal/hooks') return response(events)
    if (path.startsWith('personal/hooks/')) return response(current.hooks[0])
    if (path.startsWith('personal/vault/')) return response({ queued: true })
    if (path === 'personal/schedules' && method === 'POST') {
      const item = { ...schedule(), spec: ScheduleSpecSchema.parse(body.spec) }
      current.schedules.push(item); return response(item)
    }
    if (path.startsWith('personal/schedules/')) {
      const item = current.schedules[0]!
      if (method === 'PUT') {
        if (body.revision !== item.revision) return response({ error: 'Schedule revision conflict' }, 409)
        item.spec = ScheduleSpecSchema.parse(body.spec); item.revision++; return response(item)
      }
      item.state = body.action === 'pause' ? 'paused' : body.action === 'stop' ? 'stopped' : 'active'
      return response(item)
    }
    if (path.startsWith('personal/runs/')) return response(current.runs[0])
    return response({ error: 'Unknown test operation' }, 404)
  })
  at({ page: 'settings', query: { group: 'personal' } })
})

it('edits independent configuration sections, retains invalid JSON, and sends the saved revision', async () => {
  await mount()
  await type(field<HTMLTextAreaElement>(zh['personal.config.repositories']), '[invalid')
  await click(zh.save)
  expect(text()).toContain(zh['personal.invalidJson'].replace('{label}', zh['personal.config.repositories']))
  expect(requests.filter(item => item.method === 'PUT')).toHaveLength(0)
  await type(field<HTMLTextAreaElement>(zh['personal.config.repositories']), JSON.stringify([{ id: 'project', kind: 'git', path: '/tmp/project' }]))
  await click(zh.save)
  expect(current.config.repositories).toEqual([{ id: 'project', kind: 'git', path: '/tmp/project', ref: 'HEAD' }])
  expect(requests.find(item => item.method === 'PUT')?.body.revision).toBe(0)
  expect(all('.spa-savebar')).toHaveLength(0)
})

it('keeps a conflicting local value until the person explicitly saves against the new revision', async () => {
  await mount()
  await type(field<HTMLTextAreaElement>(zh['personal.config.vault']), JSON.stringify({ enabled: false, root: '/tmp/mine', directory: 'Personal Agent' }))
  current = { ...current, revision: 1, config: { ...current.config, vault: { ...current.config.vault, root: '/tmp/theirs' } } }
  await click(zh.save)
  expect(text()).toContain(zh.saveConflict)
  expect(field<HTMLTextAreaElement>(zh['personal.config.vault']).value).toContain('/tmp/mine')
  expect(current.config.vault.root).toBe('/tmp/theirs')
  await click(zh.save)
  expect(current.config.vault.root).toBe('/tmp/mine')
  expect(current.revision).toBe(2)
})

it('discovers only account diagnostics and requires a note before reconciling uncertain delivery', async () => {
  bots = [{ botId: 'bot-1', channel: 'feishu', connected: true, account: { fingerprint: 'a'.repeat(64), name: 'Test' }, capabilities: ['inbound.consume'], token: 'not-for-display' }]
  current.connectors = { personal: { state: 'ready', detail: 'Listening' } }
  current.deliveries = [{ id: 'delivery-1', connectorId: 'personal', state: 'uncertain', at: atTime, fingerprint: 'a'.repeat(64), routeHash: 'route', textHash: 'text', attempts: 1 }]
  await mount()
  expect(requests.some(item => item.path === 'personal/bots')).toBe(false)
  await click(zh['personal.discover'])
  expect(text()).toContain('bot-1')
  expect(text()).not.toContain('not-for-display')
  const button = all('button').find(item => item.textContent === zh['personal.confirmSent']) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  await type(field<HTMLInputElement>(zh['personal.checkNote']), 'Confirmed in the original conversation')
  await click(zh['personal.confirmSent'])
  expect(requests.find(item => item.path === 'personal/deliveries/delivery-1')?.body).toEqual({ action: 'confirm_sent', note: 'Confirmed in the original conversation' })
  expect(text()).not.toContain(zh['personal.checkNote'])
})

it('pauses a schedule and hides intake retry until that schedule is active at the recorded revision', async () => {
  current.schedules = [schedule()]
  current.runs = [{ version: 1, id: 'run-1', scheduleId: 'daily', revision: 1, scheduledAt: atTime, originTriggerId: 'message-1', state: 'failed', attempts: 1, failures: 1,
    createdAt: atTime, updatedAt: atTime, routeAttempt: 0, trigger: { id: 'scheduled', source: 'schedule', human: true, actor: { source: 'schedule', id: 'daily' }, at: atTime, text: 'Review work', threads: [], meta: {} } }]
  await mount()
  expect(text()).toContain(zh['personal.retryIntake'])
  await click(zh['personal.pause'])
  expect(requests.find(item => item.path === 'personal/schedules/daily')?.body).toEqual({ action: 'pause' })
  expect(text()).not.toContain(zh['personal.retryIntake'])
  await click(zh['personal.resume'])
  await click(zh['personal.retryIntake'])
  expect(requests.some(item => item.path === 'personal/runs/run-1/retry')).toBe(true)
})

it('creates an approved schedule and edits future instructions against its own revision', async () => {
  await mount()
  const definition = schedule().spec
  await type(field<HTMLTextAreaElement>(zh['personal.scheduleSpec']), JSON.stringify(definition))
  await click(zh['personal.createSchedule'])
  expect(current.schedules[0]?.spec).toEqual(definition)
  expect(JSON.parse(field<HTMLTextAreaElement>(zh['personal.scheduleSpec']).value).originTriggerId).toBe('')
  await type(field<HTMLTextAreaElement>(zh['personal.scheduleFor'].replace('{title}', definition.title)), JSON.stringify({ ...definition, text: 'Review updated scope' }))
  await click(zh.save)
  expect(current.schedules[0]?.spec.text).toBe('Review updated scope')
  expect(requests.find(item => item.path === 'personal/schedules/daily' && item.method === 'PUT')?.body.revision).toBe(1)
  expect(current.schedules[0]?.revision).toBe(2)
})

it('uses result IDs for Vault retries and requires confirmation before replaying a hook event', async () => {
  current.vault = [{ version: 1, id: 'vault-1', resultId: 'result-1', ticketId: 'task-1', at: atTime, root: '/tmp/vault', directory: 'Personal Agent', content: 'Report', digest: 'x', state: 'preserved', error: 'User file retained' }]
  events = [{ version: 1, id: 'event-1', at: atTime, contexts: [], taskId: 'task-1', kind: 'task.state', state: 'ready' }]
  await mount(en)
  await click(en['personal.retryExport'])
  expect(requests.some(item => item.path === 'personal/vault/result-1')).toBe(true)
  await click(en['personal.hookEvents'])
  await click(en['personal.replayHook'])
  expect(requests.some(item => item.path === 'personal/hooks/event-1')).toBe(false)
  await click(en.confirm)
  expect(requests.find(item => item.path === 'personal/hooks/event-1')?.body).toEqual({ action: 'replay' })
})

it('retains the form when a refresh fails after an action', async () => {
  current.schedules = [schedule()]
  await mount()
  error = 'Temporarily unavailable'
  await click(zh['personal.pause'])
  expect(text()).toContain(error)
  expect(field<HTMLTextAreaElement>(zh['personal.config.connectors']).value).toBe('[]')
})
