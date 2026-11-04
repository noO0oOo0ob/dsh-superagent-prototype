/** Addressed IM conversation receives a checked reply without creating background work. */
import { afterEach, expect, it, vi } from 'vitest'
import { key, UserError } from '../src/core/index.ts'
import { ImEventSchema, type ConnectorService } from '../src/connectors/protocol.ts'
import { decisionCard } from '../src/app/cards.ts'
import { decisionView, snapshot, triggerView } from '../src/app/views/records.ts'
import { startRuntime } from './fixtures/host.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const stop of cleanups.splice(0).reverse()) await stop() })
async function conversation(kind: 'dm' | 'group' = 'dm', mentioned = false, text = '你好啊') {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  cleanups.push(() => h.stop())
  const fingerprint = 'b'.repeat(64)
  let consumer: Parameters<ConnectorService['consumeInbound']>[1] | undefined
  const replyChecked = vi.fn<ConnectorService['replyChecked']>(async () => ({ sent: true }))
  const service: ConnectorService = {
    contractVersion: 1, inboundVersion: 1,
    listBots: async () => [{ botId: 'bot', channel: 'feishu' }],
    describeBot: async () => ({ version: 1, botId: 'bot', channel: 'feishu', connected: true, account: { fingerprint },
      capabilities: ['exclusive-text-consumer', 'reply-text-checked'] }),
    consumeInbound: async (_id, options) => { consumer = options; return () => { consumer = undefined } }, replyChecked,
  }
  const view = h.runtime.personal.view()
  h.runtime.personal.save({ ...view.config, connectors: [{ id: 'chat', enabled: true, botId: 'bot', fingerprint, intake: 'account' }] }, view.revision)
  h.runtime.connectors.bind(service)
  await h.runtime.connectors.refresh()
  const event = ImEventSchema.parse({ version: 1, channel: 'feishu', botId: 'bot', fingerprint, eventId: 'greeting', messageId: 'greeting',
    actor: { kind: 'user', id: 'alice' }, conversation: { kind, id: 'chat' }, mentionedAccount: mentioned,
    at: '2026-11-04T09:35:15Z', text, reply: { messageId: 'greeting', conversationId: 'chat', actorId: 'alice' } })
  const receive = async () => { await consumer!.onEvent(event, { signal: new AbortController().signal }); await h.runtime.idle() }
  await receive()
  const triggerId = key('dsh-im', 'chat', fingerprint, 'chat', 'greeting')
  const route = async (decision: Record<string, unknown>) =>
    ((await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [{ trigger_id: triggerId, ...decision }] })).results as Record<string, unknown>[])[0]!
  return { h, event, receive, triggerId, route, replyChecked }
}

it.each([['dm', false], ['group', true]] as const)('replies to a %s greeting without a worker and refuses silent no-task ignore', async (kind, mention) => {
  const { h, route, replyChecked, triggerId, receive } = await conversation(kind, mention)
  expect(await route({ kind: 'ignore', reason: 'No task is needed.' })).toMatchObject({ refused: expect.stringContaining('needs a response') })
  expect(h.runtime.engine.candidate(triggerId)).toBeDefined()
  expect(replyChecked).not.toHaveBeenCalled()
  expect(await route({ kind: 'respond', text: '你好！今天想聊点什么？' })).toMatchObject({ kind: 'respond', decision: 'respond', reply: { status: 'sent' } })
  expect(replyChecked).toHaveBeenCalledOnce()
  expect(replyChecked.mock.calls[0]!.slice(0, 3)).toEqual(['bot', expect.objectContaining({ messageId: 'greeting', conversationId: 'chat' }), '你好！今天想聊点什么？'])
  expect(h.runtime.store.tickets.list()).toHaveLength(0)
  expect(h.agents.size).toBe(1)
  expect(h.runtime.engine.candidate(triggerId)).toBeUndefined()
  const decision = h.runtime.store.decisions.get(h.runtime.store.triggers.disposition(triggerId)!.decisionId!)!
  const view = snapshot({ store: h.runtime.store, sources: h.runtime.sources, links: () => ({ url: 'https://example.invalid/chat', label: { zh: '对话', en: 'Chat' } }) })
  expect(decisionCard(decision)).toMatchObject({ kind: 'respond' })
  expect(decisionView(view, decision)).toMatchObject({ outcome: 'respond' })
  expect(triggerView(view, h.runtime.store.triggers.get(triggerId)!)).toMatchObject({ disposition: { decision: { outcome: 'respond' } } })
  await receive()
  expect(await route({ kind: 'respond', text: '换一种措辞也不能再发一次。' })).toHaveProperty('refused')
  expect(replyChecked).toHaveBeenCalledOnce()
})

it('leaves the candidate pending when the response cannot be queued', async () => {
  const { h, route, triggerId, replyChecked } = await conversation()
  expect(await route({ kind: 'respond', text: ' ' })).toHaveProperty('refused', 'respond needs text')
  const fail = vi.spyOn(h.runtime.engine, 'reply').mockImplementationOnce(() => { throw new UserError('noChannel') })
  expect(await route({ kind: 'respond', text: '你好！' })).toHaveProperty('refused')
  fail.mockRestore()
  expect(h.runtime.engine.candidate(triggerId)).toBeDefined()
  expect(h.runtime.store.triggers.disposition(triggerId)?.decisionId).toBeUndefined()
  expect(replyChecked).not.toHaveBeenCalled()
})

it('does not resend an uncertain conversation delivery through a repeated respond', async () => {
  const { h, route, replyChecked } = await conversation()
  replyChecked.mockRejectedValueOnce(Object.assign(new Error('reply-result-unknown'), { code: 'reply-result-unknown' }))
  expect(await route({ kind: 'respond', text: '你好！' })).toMatchObject({ reply: { status: 'pending' } })
  expect(h.runtime.connectors.pending()).toHaveLength(1)
  expect(await route({ kind: 'respond', text: '你好呀！' })).toHaveProperty('refused')
  expect(replyChecked).toHaveBeenCalledOnce()
})

it('keeps unaddressed group chatter quiet and allows an explicit request for silence', async () => {
  const group = await conversation('group')
  expect(await group.route({ kind: 'respond', text: 'Unsolicited' })).toHaveProperty('refused')
  expect(group.replyChecked).not.toHaveBeenCalled()
  const dm = await conversation('dm', false, '这条仅作记录，不用回复。')
  expect(await dm.route({ kind: 'ignore', reason: 'The person explicitly requested no reply.', silence_requested: true })).toMatchObject({ decision: 'ignore' })
  expect(dm.replyChecked).not.toHaveBeenCalled()
})

it('retains task delegation for requests that need background execution', async () => {
  const { h, route, replyChecked } = await conversation('dm', false, '请帮我准备一份杭州两天的旅行计划。')
  expect(await route({ kind: 'accept', title: 'Plan a trip', worktree_name: 'trip', acknowledgement: '开始准备旅行计划。' })).toHaveProperty('ticket')
  await h.runtime.idle()
  expect(h.runtime.store.tickets.list()).toHaveLength(1)
  expect(h.agents.size).toBe(2)
  expect(replyChecked).toHaveBeenCalledOnce()
})
