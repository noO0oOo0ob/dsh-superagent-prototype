/** Native conversation, explicit delegation and automatic result visibility. */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { expect, it, vi } from 'vitest'
import { resultHtml } from '../src/app/results.ts'
import { resultNavigationAllowed } from '../src/app/http.ts'
import { key } from '../src/core/index.ts'
import { feishu } from './fixtures/host.ts'
import { deferred } from './fixtures/async.ts'
import { startRuntime } from './fixtures/host.ts'

it('accepts local requests before the first message on a fresh installation', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {}, policy: { ...store.settings().policy, sources: {} } }))
  try {
    expect(h.runtime.store.settings().policy.sources.main?.allowed).toEqual([{ id: 'owner' }])
    const response = await h.api('GET', 'overview')
    expect(response.status).toBe(200)
    expect(response.body.problems).not.toContainEqual({ kind: 'no-allowed' })
    expect(h.runtime.main.currentRequest()).toBeUndefined()
    expect(h.runtime.store.tickets.list()).toHaveLength(0)
  } finally { await h.stop() }
})

it.each([false, true])('preserves Main enabled=%s and an explicitly empty owner policy on startup', async enabled => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: { main: { enabled, config: {} } },
    policy: { ...store.settings().policy, sources: { main: { allowed: [] } } } }))
  try {
    expect(h.runtime.store.settings().sources.main?.enabled).toBe(enabled)
    expect(h.runtime.store.settings().policy.sources.main?.allowed).toEqual([])
    const request = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Plan a trip' }], source: { kind: 'user' } }))!
    await expect(h.runTool(h.runtime.masterId, 'personal_agent_submit', { trigger_id: request.id, title: 'Trip', worktree_name: 'trip' })).rejects.toThrow(enabled ? 'not_a_member' : 'source_disabled')
    expect(h.runtime.store.settings().policy.sources.main?.allowed).toEqual([])
    expect(h.runtime.store.tickets.list()).toHaveLength(0)
  } finally { await h.stop() }
})

it('keeps conversation inline, delegates once and publishes a result without another model call', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  try {
    const incoming = createUserMessage({ content: [{ type: 'text', text: 'Plan a quiet weekend trip.' }], source: { kind: 'user' } })
    h.ctx.emit('session/event', h.agents.get(h.runtime.masterId)!.session, { type: 'user/message', data: incoming, seq: SessionSeq(1), time: Date.now(), surfaceOp: 'append' })
    const trigger = h.runtime.main.capture(incoming)!
    expect(h.runtime.store.tickets.list()).toHaveLength(0)
    expect(h.runtime.main.capture(incoming)?.id).toBe(trigger.id)
    const request = await h.runTool(h.runtime.masterId, 'personal_agent_current_request', {})
    expect(request.trigger_id).toBe(trigger.id)
    const args = { trigger_id: trigger.id, title: 'Weekend trip', worktree_name: 'weekend-trip' }
    const delegated = await h.runTool(h.runtime.masterId, 'personal_agent_submit', args)
    await h.runTool(h.runtime.masterId, 'personal_agent_submit', args)
    await h.runtime.idle()
    const id = (delegated.ticket as { ticket_id: string }).ticket_id
    expect(h.runtime.store.tickets.list()).toHaveLength(1)
    const main = h.agents.get(h.runtime.masterId)!
    await h.runTool(`spa-worker-${id}`, 'personal_agent_report', { publication: { mode: 'publish', blocks: [{ type: 'text', text: 'Day one: park. Day two: museum.' }] }, state: 'ready', summary: 'Day one: park. Day two: museum.' })
    await h.runtime.idle()
    const results = h.runtime.results.list(id)
    expect(results).toHaveLength(1)
    expect(JSON.stringify(vi.mocked(main.inject).mock.calls)).toContain('Day one: park.')
    expect(JSON.stringify(vi.mocked(main.inject).mock.calls)).toContain(results[0]!.url)
    h.runtime.results.record(h.runtime.store.tickets.get(id)!)
    await h.runtime.idle()
    expect(h.runtime.results.list(id)).toHaveLength(1)
    const injected = vi.mocked(main.inject).mock.calls.at(-1)![0]!
    expect(h.runtime.main.capture(injected)).toBeUndefined()
    expect(resultHtml({ ...results[0]!, summary: '<script>bad()</script>' })).not.toContain('<script>')
  } finally { await h.stop() }
})

it('does not turn another plugin notice into a local request', async () => {
  const h = await startRuntime()
  try {
    await expect(h.runTool(h.runtime.masterId, 'personal_agent_current_request', {})).rejects.toThrow('No local user request')
    expect(h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Plugin result' }], source: { kind: 'dsh-super-personal-agent', form: 'notice', summary: 'Result' } }))).toBeUndefined()
    for (const channel of ['feishu', 'weixin']) for (const mode of ['', 'steer-']) {
      const rpcId = `${channel}-${mode}12345678-1234-1234-1234-123456789abc` as SessionRequestId
      expect(h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'IM request' }], source: { kind: 'user', rpcId } }))).toBeUndefined()
    }
  } finally { await h.stop() }
})

it('deduplicates a question across progress reports and withdraws it when cleared offline', async () => {
  const h = await startRuntime()
  try {
    const { ticket, sessionId } = await h.acceptedTicket(feishu('7', '@bot Plan a trip'))
    h.runtime.store.saveSettings({ ...h.runtime.store.settings(), paused: true })
    await h.runTool(sessionId, 'personal_agent_report', { publication: { mode: 'publish', blocks: [{ type: 'text', text: 'Which dates?' }] }, state: 'progress', summary: 'Planning', human_action: 'Which dates?' })
    await h.runtime.idle()
    const attentionId = h.runtime.store.tickets.get(ticket.id)!.attention!.id
    await h.runTool(sessionId, 'personal_agent_report', { publication: { mode: 'internal' }, state: 'progress', summary: 'Checking destinations' })
    await h.runtime.idle()
    expect(h.runtime.results.list(ticket.id)).toHaveLength(2)
    expect(h.runtime.store.replyStatus(key('attention-reply', attentionId))).toBe('pending')
    await h.runTool(sessionId, 'personal_agent_report', { publication: { mode: 'internal' }, state: 'ready', summary: 'Plan completed', human_action: null })
    await h.runtime.idle()
    expect(h.runtime.store.replyStatus(key('attention-reply', attentionId))).toBeUndefined()
  } finally { await h.stop() }
})

it('opens local results from either loopback UI and refuses unrelated origins and frames', () => {
  const headers = { host: '127.0.0.1:3082', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document', referer: 'http://localhost:3082/' }
  expect(resultNavigationAllowed(headers, 3082)).toBe(true)
  expect(resultNavigationAllowed({ ...headers, referer: 'https://example.com/' }, 3082)).toBe(false)
  expect(resultNavigationAllowed({ ...headers, 'sec-fetch-dest': 'iframe' }, 3082)).toBe(false)
})

it('does not inject a question cleared while its Main Session is being resolved', async () => {
  const h = await startRuntime()
  const hold = deferred()
  try {
    const { ticket, sessionId } = await h.acceptedTicket(feishu('8', '@bot Prepare a plan'))
    h.controller.resolveAgent.mockImplementation(async id => {
      if (id === h.runtime.masterId) await hold.promise
      return h.resolveDefault(id)
    })
    await h.runTool(sessionId, 'personal_agent_report', { publication: { mode: 'internal' }, state: 'progress', summary: 'Drafting', human_action: 'Obsolete question?' })
    h.runtime.engine.report(ticket.id, { state: 'progress', summary: 'Proceeding', question: null })
    hold.resolve()
    await h.runtime.idle()
    expect(JSON.stringify(h.agents.get(h.runtime.masterId)!.inject.mock.calls)).not.toContain('Obsolete question?')
  } finally { hold.resolve(); await h.stop() }
})

it('selects a local task expert, loads its Worker instructions and preserves the binding on retries and continuation', async () => {
  const h = await startRuntime()
  try {
    const capture = (text: string) => h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))!
    const request = capture('Plan a quiet weekend trip.')
    const catalog = h.runtime.experts.choices().find(item => item.id === 'builtin-planning')!
    const expert = { id: catalog.id, digest: catalog.digest, reason: 'A weekend itinerary is requested.' }
    const args = { trigger_id: request.id, title: 'Trip', worktree_name: 'trip', expert }
    const result = await h.runTool(h.runtime.masterId, 'personal_agent_submit', args)
    const id = (result.ticket as { ticket_id: string }).ticket_id
    await h.runtime.idle()
    const ticket = h.runtime.store.tickets.get(id)!
    expect(ticket.expert?.snapshot.id).toBe(expert.id)
    expect(h.promptSections.get(`spa-worker-${id}`)!({})).toContain(ticket.expert!.snapshot.agents)
    await h.runTool(h.runtime.masterId, 'personal_agent_submit', { ...args, expert: { ...expert, digest: 'f'.repeat(64) } })
    expect(h.runtime.store.tickets.list()).toHaveLength(1)
    const follow = { ...args, trigger_id: capture('Make day two easier.').id, ticket_id: id }
    await expect(h.runTool(h.runtime.masterId, 'personal_agent_submit', follow)).rejects.toThrow('original expert')
    await h.runTool(h.runtime.masterId, 'personal_agent_submit', { ...follow, expert: null })
    expect(h.runtime.store.tickets.get(id)?.expert).toEqual(ticket.expert)
  } finally { await h.stop() }
})

it('rejects stale local expert selections and applies the same fixed-source expert policy', async () => {
  const h = await startRuntime()
  try {
    const request = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Plan a trip' }], source: { kind: 'user' } }))!
    const args = { trigger_id: request.id, title: 'Trip', worktree_name: 'trip' }
    await expect(h.runTool(h.runtime.masterId, 'personal_agent_submit', { ...args,
      expert: { id: 'builtin-planning', digest: 'f'.repeat(64), reason: 'Travel' } })).rejects.toThrow('changed')
    expect(h.runtime.store.tickets.list()).toEqual([])
    const prefs = h.runtime.expertPreferences.view()
    h.runtime.expertPreferences.save({ ...prefs.config, accounts: [{ source: 'main', persona: prefs.config.main,
      allowed: ['builtin-planning'], defaultExpert: 'builtin-planning', mode: 'fixed' }] }, prefs.revision)
    await h.runTool(h.runtime.masterId, 'personal_agent_submit', args)
    expect(h.runtime.store.tickets.list()[0]?.expert?.snapshot.id).toBe('builtin-planning')
  } finally { await h.stop() }
})

it('rejects an expert policy change during local model preflight without creating work', async () => {
  const h = await startRuntime(), hold = deferred(), started = deferred()
  try {
    const original = h.controller.modelCatalog.getMockImplementation()!
    h.controller.modelCatalog.mockImplementationOnce(async (...args) => { started.resolve(); await hold.promise; return original(...args) })
    const request = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Plan a trip' }], source: { kind: 'user' } }))!
    const pending = h.runTool(h.runtime.masterId, 'personal_agent_submit', { trigger_id: request.id, title: 'Trip', worktree_name: 'trip' })
    const refused = expect(pending).rejects.toThrow('Expert selection changed')
    await started.promise
    const prefs = h.runtime.expertPreferences.view()
    h.runtime.expertPreferences.save({ ...prefs.config, accounts: [{ source: 'main', persona: prefs.config.main,
      allowed: ['builtin-planning'], defaultExpert: 'builtin-planning', mode: 'fixed' }] }, prefs.revision)
    hold.resolve()
    await refused
    expect(h.runtime.store.tickets.list()).toEqual([])
  } finally { hold.resolve(); await h.stop() }
})
