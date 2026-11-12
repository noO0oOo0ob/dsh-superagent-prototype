// @vitest-environment jsdom
/** Personal configuration drafts and explicit recovery actions through the management page. */
import { act } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ApiResponse } from '../src/app/api.ts'
import { PersonalConfigSchema } from '../src/personal/config.ts'
import { ScheduleSpecSchema } from '../src/personal/schedules.ts'
import { en, zh } from '../src/client/locales.ts'
import { all, at, click, field, mount, remount, text, type, usePanel } from './fixtures/panel.tsx'

usePanel()
type View = ApiResponse<'GET personal'>
let current: View
let requests: { path: string; method: string; body: Record<string, unknown> }[]
let bots: unknown[]
let events: ApiResponse<'GET personal/hooks'>
let nativeBots: Record<string, unknown>[]
let documents: ApiResponse<'GET personal/documents'>
let parts: ApiResponse<'GET personal/messages'>
let groupView: ApiResponse<'GET personal/groups'>
let error: string | undefined
const atTime = '2026-11-04T06:00:00Z'
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const schedule = (): View['schedules'][number] => ({ version: 1, revision: 1, state: 'active', createdAt: atTime, updatedAt: atTime,
  nextAt: atTime, spec: { id: 'daily', title: 'Daily review', text: 'Review work', originTriggerId: 'message-1', when: { kind: 'once', at: atTime } } })

beforeEach(() => {
  current = { revision: 0, config: PersonalConfigSchema.parse({}), connectors: {}, deliveries: [], vault: [], routeDecisions: [], schedules: [], runs: [], hooks: [] }
  groupView = { groups: [], decisions: [] }; requests = []; bots = []; events = []; nativeBots = []; parts = []; documents = { documents: [], comments: [] }; error = undefined
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
    if (path === 'personal/feishu') {
      if (body.endpoint === 'bot.bind-credentials') nativeBots = [{ botId: 'native_test', bot: { name: 'Native test' }, connected: true, state: 'connected', workspace: '/tmp/native', accessPolicy: { direct: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } }, group: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } } } }]
      const payload = body.payload as Record<string, unknown>
      if (body.endpoint === 'bot.access-policy.set' || body.endpoint === 'bot.slash-panel.set') {
        const name = body.endpoint === 'bot.access-policy.set' ? 'accessPolicy' : 'slashPanel'
        nativeBots = nativeBots.map(bot => bot.botId === payload.botId ? { ...bot, [name]: payload.policy ?? payload.slashPanel } : bot)
      }
      return response({ ok: true, value: { bots: nativeBots, totals: { configured: nativeBots.length, connected: nativeBots.length } } })
    }
    if (path === 'personal/groups') return response(groupView)
    if (path.startsWith('personal/groups/')) {
      const group = groupView.groups.find(group => path.endsWith(group.id))!
      if (body.revision !== group.revision) return response({ error: 'Group revision conflict' }, 409)
      group.defaultAccount = group.accounts.find(account => account.connectorId === body.connectorId) ?? null
      group.defaultAvailable = !!group.defaultAccount; group.revision++; return response(group)
    }
    if (path === 'personal/documents') return response(documents)
    if (path.startsWith('personal/documents/')) return response({ recorded: true })
    if (path === 'personal/messages') return response(parts)
    if (path.startsWith('personal/messages/')) return response({ recorded: true })
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
  expect(requests.some(item => item.path === 'personal/bots')).toBe(true)
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

it('selects a discovered account without manual IDs and activates it only on save', async () => {
  bots = [{ botId: 'bot-1', channel: 'feishu', connected: true, account: { fingerprint: 'a'.repeat(64), name: 'Assistant' },
    capabilities: ['exclusive-text-consumer', 'reply-text-checked'] }]
  await mount()
  expect(text()).toContain('Assistant')
  expect(current.config.connectors).toEqual([])
  await click(zh['personal.selectAccount'].replace('{name}', 'Assistant'))
  expect(current.config.connectors).toEqual([])
  expect(requests.filter(item => item.method === 'PUT')).toHaveLength(0)
  await click(zh.save)
  expect(current.config.connectors).toEqual([{ id: 'account-1', enabled: true, intake: 'account', botId: 'bot-1', fingerprint: 'a'.repeat(64), conversations: [], allowedSenders: [] }])
  await click(zh['personal.unselectAccount'].replace('{name}', 'Assistant'))
  await click(zh.save)
  expect(current.config.connectors[0]?.enabled).toBe(false)
})

it('does not select an unsupported account or silently replace a changed fingerprint', async () => {
  bots = [{ botId: 'bot-1', channel: 'feishu', connected: true, account: { fingerprint: 'b'.repeat(64), name: 'Assistant' },
    capabilities: ['exclusive-text-consumer', 'reply-text-checked'] },
    { botId: 'bot-2', channel: 'weixin', connected: true, account: { fingerprint: 'c'.repeat(64), name: 'Weixin' }, capabilities: [] }]
  current.config = PersonalConfigSchema.parse({ connectors: [{ id: 'existing', intake: 'account', enabled: true, botId: 'bot-1', fingerprint: 'a'.repeat(64) }] })
  await mount()
  expect(text()).toContain(zh['personal.accountChanged'])
  const unsupported = all('button').find(item => item.textContent === zh['personal.selectAccount'].replace('{name}', 'Weixin')) as HTMLButtonElement
  expect(unsupported.disabled).toBe(true)
  expect(current.config.connectors[0]?.fingerprint).toBe('a'.repeat(64))
  await click(zh['personal.selectAccount'].replace('{name}', 'Assistant'))
  await click(zh.save)
  expect(current.config.connectors[0]).toMatchObject({ id: 'existing', fingerprint: 'b'.repeat(64) })
})

it('can disable an unavailable configured account without editing IDs', async () => {
  current.config = PersonalConfigSchema.parse({ connectors: [{ id: 'existing', intake: 'account', enabled: true, botId: 'missing', fingerprint: 'a'.repeat(64) }] })
  await mount()
  await click(zh['personal.unselectAccount'].replace('{name}', 'missing'))
  await click(zh.save)
  expect(current.config.connectors[0]?.enabled).toBe(false)
})

it('retains existing restrictions when selecting the same saved account again', async () => {
  bots = [{ botId: 'bot-1', channel: 'feishu', connected: true, account: { fingerprint: 'a'.repeat(64), name: 'Assistant' },
    capabilities: ['exclusive-text-consumer', 'reply-text-checked'] }]
  current.config = PersonalConfigSchema.parse({ connectors: [{ id: 'existing', enabled: false, botId: 'bot-1', fingerprint: 'a'.repeat(64),
    conversations: [{ id: 'chat-1', kind: 'dm' }], allowedSenders: ['alice'] }] })
  await mount()
  await click(zh['personal.selectAccount'].replace('{name}', 'Assistant'))
  await click(zh.save)
  expect(current.config.connectors[0]).toMatchObject({ enabled: true, intake: 'restricted', conversations: [{ id: 'chat-1', kind: 'dm' }], allowedSenders: ['alice'] })
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

it('binds native Feishu in its own page and opens account settings without the original plugin', async () => {
  at({ page: 'messaging' })
  await mount()
  expect(text()).toContain('扫码接入机器人')
  await click('手动接入')
  await type(document.querySelector<HTMLInputElement>('input[placeholder="填写飞书开放平台 App ID"]')!, 'cli_native')
  await type(document.querySelector<HTMLInputElement>('input[placeholder="填写飞书开放平台 App Secret"]')!, 'private-local-fixture')
  await click('绑定并连接')
  expect(requests.find(item => item.body.endpoint === 'bot.bind-credentials')?.body.payload).toEqual({ appId: 'cli_native', appSecret: 'private-local-fixture', domain: 'feishu' })
  expect(text()).toContain('Native test')
  expect(text()).not.toContain('private-local-fixture')
  await click('更多机器人设置')
  expect(text()).toContain(zh['messaging.tab.access'])
  await click(zh['messaging.tab.access'])
  expect(text()).toContain('访问权限')
  await click('保存访问设置')
  expect(text()).toContain('访问设置已保存')
  await click('保存访问设置')
  expect(requests.filter(item => item.body.endpoint === 'bot.access-policy.set').map(item => (item.body.payload as Record<string, unknown>).botId)).toEqual(['native_test', 'native_test'])
  await click(zh['messaging.tab.commands'])
  await type(field<HTMLSelectElement>('指令面板模式'), 'custom')
  await click('保存')
  expect(requests.find(item => item.body.endpoint === 'bot.slash-panel.set')?.body.payload).toMatchObject({ botId: 'native_test' })
  await click(zh['messaging.tab.access'])
  await click('保存访问设置')
  expect(requests.filter(item => item.body.endpoint === 'bot.access-policy.set').at(-1)?.body.payload).toMatchObject({ botId: 'native_test' })
  await click(zh['messaging.back'])
  expect(text()).toContain('Native test')
  expect(document.querySelector('style[data-plugin-css="xmanrui-dsh-im-settings"]')).toBeNull()
  expect(document.querySelector('style[data-plugin-css="spa-native-im-settings"]')).not.toBeNull()
})

it('shows mixed result parts and reconciles only the selected failed file', async () => {
  parts = [{ version: 1, id: 'delivery-rich', signature: 'sig', source: 'native', thread: 'chat', at: atTime, updatedAt: atTime, resolutions: [],
    parts: [{ id: 'text', block: { type: 'text', text: 'Report ready', format: 'plain' }, state: 'sent', attempts: 1, providerMessageIds: ['om_1'] },
      { id: 'file', block: { type: 'file', artifactId: 'report' }, state: 'failed', attempts: 1, providerMessageIds: [], error: 'permission-required' }] }]
  at({ page: 'messaging', query: { view: 'deliveries' } })
  await mount()
  expect(text()).toContain(zh['messaging.state.partial'])
  const retry = all('button').find(item => item.textContent === zh['messaging.retry']) as HTMLButtonElement
  expect(retry.disabled).toBe(true)
  await type(field<HTMLInputElement>(zh['messaging.note']), 'Permissions repaired')
  await click(retry)
  expect(requests.find(item => item.path === 'personal/messages/delivery-rich')?.body).toEqual({ partId: 'file', action: 'retry', note: 'Permissions repaired' })
  expect(all('a').some(item => item.getAttribute('href') === '/super-personal-agent/artifact/report')).toBe(true)
})

it('keeps every unresolved delivery visible after more than thirty records', async () => {
  parts = Array.from({ length: 35 }, (_, i) => ({ version: 1, id: `receipt-${i}`, signature: 'sig', source: 'native', thread: 'chat', at: atTime, updatedAt: atTime, resolutions: [],
    parts: [{ id: `part-${i}`, block: { type: 'text', text: `Unresolved ${i}`, format: 'plain' }, state: 'unknown', attempts: 1, providerMessageIds: [] }] }));
  at({ page: 'messaging', query: { view: 'deliveries' } });
  await mount();
  expect(document.querySelectorAll('.spa-message-record')).toHaveLength(35);
  expect(text()).toContain('Unresolved 0');
  expect(text()).toContain('Unresolved 34');
});


it('opens account management from the main navigation and hides unsupported channels and voice', async () => {
  await mount()
  expect(text()).not.toContain('扫码接入机器人')
  await click(zh['tab.messaging'])
  expect(text()).toContain('扫码接入机器人')
  expect(document.querySelector('[aria-label="' + zh['messaging.channels'] + '"]')?.textContent).toContain('飞书')
  for (const unsupported of ['微信', 'Slack', 'Telegram', '语音']) expect(text()).not.toContain(unsupported)
  await click(zh['messaging.deliveries'])
  expect(text()).toContain(zh['messaging.empty'])
  await click(zh['messaging.accounts'])
  expect(text()).toContain('扫码接入机器人')
})


it('keeps account settings, return focus and scroll isolated for two Feishu bots', async () => {
  const policy = { direct: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } }, group: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } } }
  nativeBots = ['Research', 'Travel'].map((name, i) => ({ botId: `bot_${i}`, bot: { name }, connected: true, state: 'connected', workspace: `/tmp/${name}`, accessPolicy: policy }))
  at({ page: 'messaging' })
  await mount()
  const pane = document.getElementById('spa-im-panel-feishu')!
  for (const i of [1, 0]) {
    const card = document.querySelector(`[data-bot-id="bot_${i}"]`)!
    await click(card.querySelector<HTMLElement>('[aria-label="展开该账号的设置"]')!)
    const more = card.querySelector<HTMLElement>('[aria-label="更多机器人设置"]')!
    more.focus(); pane.scrollTop = 150 + i
    await click(more)
    expect(document.activeElement?.textContent).toBe(zh['messaging.back'])
    expect(pane.scrollTop).toBe(0)
    const group = document.getElementById('spa-im-bot-settings-group-tab')!
    group.focus()
    await act(async () => { group.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    expect(document.activeElement?.id).toBe('spa-im-bot-settings-access-tab')
    await type(field<HTMLSelectElement>('私聊 访问模式'), 'allowlist')
    await click('保存访问设置')
    expect(requests.filter(item => item.body.endpoint === 'bot.access-policy.set').at(-1)?.body.payload).toMatchObject({ botId: `bot_${i}` })
    await click(zh['messaging.back'])
    expect(document.activeElement).toBe(more)
    expect(pane.scrollTop).toBe(150 + i)
    expect(card.querySelector('[aria-label="收起该账号的设置"]')).not.toBeNull()
    await click(more)
    await click(zh['messaging.tab.access'])
    expect(field<HTMLSelectElement>('私聊 访问模式').value).toBe('allowlist')
    await click(zh['messaging.back'])
  }
  expect(nativeBots.map(bot => bot.workspace)).toEqual(['/tmp/Research', '/tmp/Travel'])
  await click(zh['messaging.deliveries'])
  await remount()
  expect(document.querySelector('#spa-messaging-deliveries')?.getAttribute('aria-selected')).toBe('true')
  expect(text()).toContain(zh['messaging.empty'])
})

it('sets a verified group default in the original bot settings without a competing all-message switch', async () => {
  nativeBots = [{ botId: 'bot_0', bot: { name: 'Research' }, connected: true, state: 'connected', workspace: '/tmp/Research' }]
  groupView.groups = [{ version: 1, id: 'group', provider: 'feishu', channel: 'feishu', tenantId: 'tenant', groupId: 'chat', revision: 3,
    defaultAccount: null, defaultAvailable: false, accounts: [{ available: true, connectorId: 'one', botId: 'bot_0', fingerprint: 'a'.repeat(64) }, { available: true, connectorId: 'two', botId: 'bot_1', fingerprint: 'b'.repeat(64) }] }]
  at({ page: 'messaging' }); await mount()
  await click(document.querySelector<HTMLElement>('[aria-label="展开该账号的设置"]')!)
  await click(document.querySelector<HTMLElement>('[aria-label="更多机器人设置"]')!)
  expect(document.querySelector('[aria-label="群聊响应方式"]')).toBeNull()
  expect(text()).toContain('群消息接收权限')
  const label = `${zh['messaging.groups.default']} · chat`
  await type(field<HTMLSelectElement>(label), 'two')
  expect(requests.find(item => item.path === 'personal/groups/group')?.body).toEqual({ revision: 3, connectorId: 'two' })
  expect(field<HTMLSelectElement>(label).value).toBe('two')
  await click(zh['messaging.back'])
  await click(document.querySelector<HTMLElement>('[aria-label="更多机器人设置"]')!)
  expect(field<HTMLSelectElement>(label).value).toBe('two')
})

it('requires a verification note and existing document ID to reconcile an applied creation', async () => {
  documents.documents = [{ id: 'binding', botId: 'bot', fingerprint: 'fp', artifactId: 'artifact', actorId: 'owner', completed: [], recovery: [], inFlight: 'create', error: 'Response lost' }]
  at({ page: 'messaging', query: { view: 'deliveries' } }); await mount()
  const confirm = () => all('button').find(item => item.textContent === zh['messaging.documentApplied']) as HTMLButtonElement
  expect(confirm().disabled).toBe(true)
  await type(field<HTMLInputElement>(zh['messaging.note']), 'Verified existing document in Feishu')
  expect(confirm().disabled).toBe(true)
  await type(field<HTMLInputElement>(zh['messaging.documentId']), 'existingDoc')
  await click(zh['messaging.documentApplied'])
  expect(requests.find(item => item.path === 'personal/documents/binding')?.body).toEqual({ stage: 'create', note: 'Verified existing document in Feishu', action: 'confirm_applied', documentId: 'existingDoc' })
})
