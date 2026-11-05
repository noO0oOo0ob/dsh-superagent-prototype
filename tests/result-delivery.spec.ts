/** Automatic publications and Main replies share one receipt per result and destination. */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import { key } from '../src/core/index.ts'
import { ImEventSchema, type ConnectorService } from '../src/connectors/protocol.ts'
import { Runtime } from '../src/app/runtime.ts'
import { resultRecords } from '../src/app/results.ts'
import { startRuntime, type Host } from './fixtures/host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const stop of cleanups.splice(0).reverse()) await stop() })

async function imTask() {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  cleanups.push(() => h.stop())
  const fingerprint = 'a'.repeat(64)
  const consumers = new Map<string, Parameters<ConnectorService['consumeInbound']>[1]>()
  const replyChecked = vi.fn<ConnectorService['replyChecked']>(async () => ({ sent: true }))
  const service: ConnectorService = {
    contractVersion: 1, inboundVersion: 1, listBots: async () => [{ botId: 'bot', channel: 'feishu' }],
    describeBot: async () => ({ version: 1, botId: 'bot', channel: 'feishu', connected: true,
      account: { fingerprint }, capabilities: ['exclusive-text-consumer', 'reply-text-checked'] }),
    consumeInbound: async (id, options) => {
      if (consumers.has(id)) throw Object.assign(new Error('consumer-conflict'), { code: 'consumer-conflict' })
      consumers.set(id, options)
      return () => { if (consumers.get(id) === options) consumers.delete(id) }
    }, replyChecked,
  }
  const view = h.runtime.personal.view()
  h.runtime.personal.save({ ...view.config, connectors: [{ id: 'test', enabled: true, botId: 'bot', fingerprint, intake: 'account' }] }, view.revision)
  h.runtime.connectors.bind(service)
  await h.runtime.connectors.refresh()
  await vi.waitFor(() => expect(Object.values(h.runtime.connectors.status()).some(value => value.state === 'connecting')).toBe(false))
  const event = ImEventSchema.parse({ version: 1, channel: 'feishu', botId: 'bot', fingerprint, eventId: 'event', messageId: 'message',
    actor: { kind: 'user', id: 'alice' }, conversation: { kind: 'dm', id: 'chat' }, mentionedAccount: false,
    at: '2026-11-04T01:00:00Z', text: 'Prepare a plan', reply: { messageId: 'message', conversationId: 'chat', actorId: 'alice' } })
  const receive = (input = event) => consumers.get('bot')!.onEvent(input, { signal: new AbortController().signal })
  await receive()
  const triggerId = key('dsh-im', 'test', fingerprint, 'chat', 'message')
  const accepted = h.runtime.engine.decide(triggerId, { kind: 'accept', title: 'Plan', scope: 'Plan', name: 'plan', reason: 'Requested' })
  await h.runtime.idle()
  return { h, ticketId: accepted.ticketId!, triggerId, service, receive, consumers, replyChecked, event }
}

function report(h: Host, ticketId: string, summary = 'Visit the museum.') {
  h.runtime.engine.report(ticketId, { state: 'ready', summary })
}

it.each(['automatic', 'main'] as const)('publishes once when %s delivery runs first, even if Main rewrites the text', async first => {
  const { h, ticketId, replyChecked } = await imTask()
  report(h, ticketId)
  if (first === 'automatic') await h.runtime.idle()
  const reply = h.runtime.engine.reply({ purpose: 'result', ticketId, text: 'Here is your museum itinerary.' })
  await h.runtime.idle()
  const repeated = h.runtime.engine.reply({ purpose: 'result', ticketId, text: 'The itinerary is ready.' })
  await h.runtime.idle()
  expect(replyChecked).toHaveBeenCalledTimes(1)
  expect(repeated.id).toBe(reply.id)
  expect(repeated).toMatchObject({ reused: true, status: 'sent' })
  expect(replyChecked.mock.calls[0]![2]).toContain('Visit the museum.')
})

it('does not bypass an uncertain automatic send through the Main reply tool', async () => {
  const { h, ticketId, replyChecked } = await imTask()
  replyChecked.mockRejectedValueOnce(Object.assign(new Error('reply-result-unknown'), { code: 'reply-result-unknown' }))
  report(h, ticketId)
  await h.runtime.idle()
  const pending = h.runtime.connectors.pending()[0]!
  expect(pending.state).toBe('uncertain')
  const reply = h.runtime.engine.reply({ purpose: 'result', ticketId, text: 'A differently worded result.' })
  await h.runtime.idle()
  expect(reply.id).toBe(pending.id)
  expect(reply.reused).toBe(true)
  expect(replyChecked).toHaveBeenCalledTimes(1)
  expect((await h.api('POST', `personal/deliveries/${pending.id}`, { action: 'confirm_sent', note: 'The original message is visible' })).status).toBe(200)
  await h.runtime.pump()
  expect(h.runtime.store.replyStatus(reply.id)).toBe('sent')
  expect(replyChecked).toHaveBeenCalledTimes(1)
})

it('keeps reported answers deduplicated after their answer authorization is consumed', async () => {
  const { h, ticketId, triggerId, replyChecked } = await imTask()
  h.runtime.engine.report(ticketId, { state: 'progress', summary: 'The museum opens at ten.', answers: triggerId })
  await h.runtime.idle()
  const first = h.runtime.engine.reply({ purpose: 'answer', ticketId, triggerId, text: 'It opens at 10:00.' })
  const again = h.runtime.engine.reply({ purpose: 'answer', ticketId, triggerId, text: 'Ten in the morning.' })
  await h.runtime.idle()
  expect(h.runtime.store.tickets.get(ticketId)?.answers).toEqual([])
  expect(first.id).toBe(again.id)
  expect(again.reused).toBe(true)
  expect(replyChecked).toHaveBeenCalledTimes(1)
})

it('does not suppress a new result when a task resumes for another request', async () => {
  const { h, ticketId, replyChecked } = await imTask()
  report(h, ticketId)
  await h.runtime.idle()
  const first = h.runtime.engine.reply({ purpose: 'result', ticketId, text: 'First plan' })
  const next = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Include a second day' }], source: { kind: 'user' } }))!
  h.runtime.engine.attach(ticketId, next.id)
  await h.runtime.idle()
  report(h, ticketId, 'Visit the park on day two.')
  const second = h.runtime.engine.reply({ purpose: 'result', ticketId, text: 'Second plan' })
  await h.runtime.idle()
  expect(second.id).not.toBe(first.id)
  expect(replyChecked).toHaveBeenCalledTimes(2)
  expect(replyChecked.mock.calls[1]![2]).toContain('Visit the park on day two.')
})

it.each(['sent', 'uncertain'] as const)('reuses a persisted %s receipt after reopening the runtime and replaying a legacy publication effect', async outcome => {
  const { h, ticketId, service, replyChecked } = await imTask()
  if (outcome === 'uncertain') replyChecked.mockRejectedValueOnce(Object.assign(new Error('reply-result-unknown'), { code: 'reply-result-unknown' }))
  report(h, ticketId)
  await h.runtime.idle()
  const receipt = h.runtime.engine.reply({ purpose: 'result', ticketId, text: 'Plan' })
  const result = h.runtime.results.list(ticketId)[0]!
  // Existing result snapshots and receipts without the additive metadata remain readable.
  h.runtime.store.set(resultRecords(result.id), { ...result, replyTo: undefined })
  h.runtime.store.db.prepare("UPDATE outbox SET value = json_remove(value, '$.resultId', '$.attentionId') WHERE id = ?").run(receipt.id)
  await h.runtime.stop()
  const ctx = new Context()
  for (const name of ['agents', 'llm', 'sessionController', 'sessionPersistence', 'workspaceRegistry', 'permissionPresets', 'subprocess', 'webServer', 'jobs', 'subagents'] as const)
    ctx.reflect.provide(name, h.ctx.get(name))
  const restarted = new Runtime(ctx, h.runtime.machine, vi.fn())
  cleanups.push(() => restarted.stop())
  await restarted.ready
  restarted.connectors.bind(service)
  await restarted.connectors.refresh()
  await vi.waitFor(() => expect(restarted.connectors.status().test?.state).toBe('ready'))
  restarted.effects.enqueue('result', result.id, { id: result.id })
  const again = restarted.engine.reply({ purpose: 'result', ticketId, text: 'Reworded after restart' })
  await restarted.idle()
  expect(again).toMatchObject({ id: receipt.id, status: outcome === 'sent' ? 'sent' : 'pending', reused: true })
  expect(replyChecked).toHaveBeenCalledTimes(1)
})

it('deduplicates provider redelivery after a Connector rebind and rejects the old callback', async () => {
  const { h, ticketId, triggerId, service, receive, consumers, event } = await imTask()
  const old = consumers.get('bot')!
  const before = h.runtime.store.tickets.get(ticketId)!
  h.runtime.connectors.bind(service)
  await h.runtime.connectors.refresh()
  await vi.waitFor(() => expect(Object.values(h.runtime.connectors.status()).some(value => value.state === 'connecting')).toBe(false))
  expect(old.signal.aborted).toBe(true)
  await expect(old.onEvent(event, { signal: new AbortController().signal })).rejects.toThrow()
  await receive({ ...event, eventId: 'redelivered-event' })
  expect(h.runtime.store.tickets.list()).toHaveLength(1)
  expect(h.runtime.store.tickets.get(ticketId)?.inputs).toEqual(before.inputs)
  expect(h.runtime.engine.receive(h.runtime.store.triggers.get(triggerId)!)).toBe('duplicate')
})

it('keeps input deduplication when the same Connector is disabled and enabled again', async () => {
  const { h, ticketId, receive, consumers, event } = await imTask()
  const previous = consumers.get('bot')!, before = h.runtime.store.tickets.get(ticketId)!
  const configure = (enabled: boolean) => {
    const view = h.runtime.personal.view()
    h.runtime.personal.save({ ...view.config, connectors: view.config.connectors.map(config => ({ ...config, enabled })) }, view.revision)
  }
  configure(false)
  await h.runtime.connectors.refresh()
  await vi.waitFor(() => expect(Object.values(h.runtime.connectors.status()).some(value => value.state === 'connecting')).toBe(false))
  expect(consumers.size).toBe(0)
  await expect(previous.onEvent(event, { signal: new AbortController().signal })).rejects.toThrow()
  configure(true)
  await h.runtime.connectors.refresh()
  await vi.waitFor(() => expect(Object.values(h.runtime.connectors.status()).some(value => value.state === 'connecting')).toBe(false))
  await receive()
  expect(h.runtime.store.tickets.list()).toHaveLength(1)
  expect(h.runtime.store.tickets.get(ticketId)?.inputs.filter(input => input.kind === 'trigger')).toEqual(before.inputs.filter(input => input.kind === 'trigger'))
  expect(h.controller.prompt).not.toHaveBeenCalled()
})

it('leaves intake unavailable on a consumer conflict instead of submitting to an ordinary Session', async () => {
  const { h, service, receive, consumers, event } = await imTask()
  service.consumeInbound = async () => { throw Object.assign(new Error('consumer-conflict'), { code: 'consumer-conflict' }) }
  h.runtime.connectors.bind(service)
  await h.runtime.connectors.refresh()
  await vi.waitFor(() => expect(Object.values(h.runtime.connectors.status()).some(value => value.state === 'connecting')).toBe(false))
  expect(h.runtime.connectors.status().test).toMatchObject({ state: 'error', detail: 'Connector unavailable: consumer-conflict' })
  expect(consumers.size).toBe(0)
  expect(h.controller.prompt).not.toHaveBeenCalled()
  expect(h.runtime.store.tickets.list()).toHaveLength(1)
  expect(() => receive(event)).toThrow()
})

it('uses the same Main Session publication for an automatic result and a manual reply', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  cleanups.push(() => h.stop())
  const request = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Prepare a plan' }], source: { kind: 'user' } }))!
  const delegated = await h.runTool(h.runtime.masterId, 'personal_agent_submit', { trigger_id: request.id, title: 'Plan', worktree_name: 'plan' })
  const ticketId = (delegated.ticket as { ticket_id: string }).ticket_id
  await h.runtime.idle()
  const main = h.agents.get(h.runtime.masterId)!
  main.inject.mockClear()
  report(h, ticketId)
  await h.runtime.idle()
  const before = main.inject.mock.calls.length
  await h.runTool(h.runtime.masterId, 'personal_agent_reply', { purpose: 'result', ticket_id: ticketId, text: 'Another copy of the plan' })
  await h.runtime.idle()
  expect(main.inject.mock.calls).toHaveLength(before)
  expect(JSON.stringify(main.inject.mock.calls)).toContain(h.runtime.results.list(ticketId)[0]!.url)
})
