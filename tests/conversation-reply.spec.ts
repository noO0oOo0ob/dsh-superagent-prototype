/** Addressed IM conversation receives a checked reply without creating background work. */
import { join } from 'node:path'
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
  await vi.waitFor(() => expect(Object.values(h.runtime.connectors.status()).some(value => value.state === 'connecting')).toBe(false))
  const event = ImEventSchema.parse({ version: 1, channel: 'feishu', botId: 'bot', fingerprint, eventId: 'greeting', messageId: 'greeting',
    actor: { kind: 'user', id: 'alice' }, conversation: { kind, id: 'chat' }, mentionedAccount: mentioned,
    at: '2026-11-04T09:35:15Z', text, reply: { messageId: 'greeting', conversationId: 'chat', actorId: 'alice' } })
  const receive = async (next = event) => { await consumer!.onEvent(next, { signal: new AbortController().signal }); await h.runtime.idle() }
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


it('keeps one DM Thread and Main router while assigning distinct tasks without subscription fanout', async () => {
  const { h, event, receive, triggerId, route } = await conversation('dm', false, '调研旅行')
  const first = h.runtime.store.triggers.get(triggerId)!
  const dialogueId = String(first.meta.dialogueSessionId)
  expect(h.agents.has(dialogueId)).toBe(false)
  expect(h.relays(h.runtime.masterId)).toContainEqual(expect.objectContaining({ kind: 'candidate', messages: [expect.objectContaining({ trigger_id: triggerId })] }))
  expect(await route({ kind: 'accept', title: 'Travel', worktree_name: 'travel', acknowledgement: '开始调研。' })).toHaveProperty('ticket')
  await receive({ ...event, messageId: 'second', eventId: 'second', text: '另外帮我修复一个开源项目。', reply: { ...event.reply, messageId: 'second' } })
  const secondId = key('dsh-im', 'chat', event.fingerprint, 'chat', 'second'), second = h.runtime.store.triggers.get(secondId)!
  expect(second.threads).toEqual(first.threads)
  expect(second.meta.dialogueSessionId).toBe(dialogueId)
  expect(h.runtime.store.triggers.disposition(secondId)?.fanout).toEqual([])
  await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [{ trigger_id: secondId, kind: 'accept', title: 'Fix project', worktree_name: 'fix-project', acknowledgement: '开始检查。' }] })
  await h.runtime.idle()
  expect(h.runtime.store.tickets.list()).toHaveLength(2)
  expect(h.runtime.store.tickets.list().map(ticket => ticket.origin.triggerId).sort()).toEqual([triggerId, secondId].sort())
  expect(h.runtime.store.tickets.list().every(ticket => ticket.inputs.every(input => input.kind !== 'trigger' || input.triggerId === ticket.origin.triggerId))).toBe(true)
  expect(h.agents.size).toBe(3)
})

it('intercepts /new once, refuses old generation requests, and keeps Workers and Main history', async () => {
  const { h, event, receive, triggerId, route, replyChecked } = await conversation('dm', false, '准备旅行计划')
  await route({ kind: 'accept', title: 'Travel', worktree_name: 'travel', acknowledgement: '开始准备。' })
  await h.runtime.idle()
  const ticket = h.runtime.store.tickets.list()[0]!, oldId = String(h.runtime.store.triggers.get(triggerId)!.meta.dialogueSessionId)
  const command = { ...event, messageId: 'new', eventId: 'new', text: '/new', reply: { ...event.reply, messageId: 'new' } }
  await receive(command)
  await receive(command)
  expect(replyChecked.mock.calls.filter(call => call[2].includes('已开启当前 IM'))).toHaveLength(1)
  expect(h.agents.get(h.runtime.masterId)!.cancel).not.toHaveBeenCalled()
  expect(h.agents.get(`spa-worker-${ticket.id}`)!.cancel).not.toHaveBeenCalled()
  expect(h.runtime.store.tickets.get(ticket.id)?.ended).toBeUndefined()
  expect(await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [{ trigger_id: triggerId, kind: 'respond', text: 'stale' }] })).toMatchObject({ results: [{ refused: expect.stringContaining('changed') }] })
  await receive({ ...event, messageId: 'next', eventId: 'next', text: '你好', reply: { ...event.reply, messageId: 'next' } })
  const nextId = key('dsh-im', 'chat', event.fingerprint, 'chat', 'next'), next = h.runtime.store.triggers.get(nextId)!
  expect(next.meta.dialogueSessionId).not.toBe(oldId)
  expect(next.threads).toEqual(h.runtime.store.triggers.get(triggerId)!.threads)
  expect(h.runtime.conversations.history(String(next.meta.dialogueSessionId)).map(item => item.id)).toEqual([nextId])
  expect(h.runtime.store.triggers.disposition(nextId)?.fanout).toEqual([])
})

it('aggregates group topics but prevents another member from changing an existing task', async () => {
  const { h, event, receive, triggerId, route, replyChecked } = await conversation('group', true, '调研机票')
  await route({ kind: 'accept', title: 'Flights', worktree_name: 'flights', acknowledgement: '开始调研。' })
  await h.runtime.idle()
  const ticket = h.runtime.store.tickets.list()[0]!
  await receive({ ...event, messageId: 'bob', eventId: 'bob', actor: { kind: 'user', id: 'bob' }, text: `/stop ${ticket.id}`,
    reply: { ...event.reply, messageId: 'bob', actorId: 'bob', threadId: 'topic-two' } })
  expect(h.runtime.store.tickets.get(ticket.id)?.ended).toBeUndefined()
  expect(replyChecked.mock.calls.at(-1)?.[2]).toContain('只能修改自己发起')
  const second = h.runtime.store.triggers.get(key('dsh-im', 'chat', event.fingerprint, 'chat', 'bob'))!
  expect(second.threads).toEqual(h.runtime.store.triggers.get(triggerId)!.threads)
  expect(h.runtime.store.triggers.disposition(second.id)?.fanout).toEqual([])
})

it('routes multiple conversations through Main while retaining original reply destinations', async () => {
  const { h, event, receive, route } = await conversation()
  await receive({ ...event, messageId: 'other', eventId: 'other', conversation: { kind: 'dm', id: 'other' },
    reply: { ...event.reply, messageId: 'other', conversationId: 'other' } })
  const otherId = key('dsh-im', 'chat', event.fingerprint, 'other', 'other')
  expect(await route({ kind: 'respond', text: 'First chat' })).toMatchObject({ decision: 'respond' })
  expect(await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [{ trigger_id: otherId, kind: 'respond', text: 'Second chat' }] }))
    .toMatchObject({ results: [{ decision: 'respond' }] })
  expect(h.agents.size).toBe(1)
  expect(h.deliveries.mock.calls.every(([call]) => call.sessionId === h.runtime.masterId)).toBe(true)
})


it('records a stable model-visible conversation envelope with typed attachment references', async () => {
  const { h, triggerId } = await conversation()
  const trigger = h.runtime.store.triggers.get(triggerId)!
  const { dialogueMessage } = await import('../src/messaging/dialogue.ts')
  const rendered = dialogueMessage({ ...trigger, id: 'stable-input', meta: { ...trigger.meta,
    resources: [{ kind: 'image', key: 'img_a' }, { kind: 'file', key: 'file_b', fileName: 'plan.pdf' }],
    settings: { contextEnhancement: { direct: { enabled: true, fields: ['channel', 'senderName'], guidance: 'Use the supplied source fields.' },
      group: { enabled: false, fields: [], guidance: '' } } }, senderName: 'Alice' } }, [])
  expect(rendered).toMatchInlineSnapshot(`
    {
      "origin": {
        "actor": {
          "id": "alice",
          "source": "im-chat",
        },
        "conversation": "c37bc7c354e4a0db232c236e067494e1",
        "generation": 0,
        "source": "im-chat",
      },
      "resources": [
        {
          "key": "img_a",
          "kind": "image",
        },
        {
          "fileName": "plan.pdf",
          "key": "file_b",
          "kind": "file",
        },
      ],
      "source": {
        "channel": "feishu",
        "senderName": "Alice",
      },
      "source_guidance": "Use the supplied source fields.",
      "tasks": [],
      "text": "你好啊",
      "trigger_id": "stable-input",
    }
  `)
})


it('keeps normal conversation replies available after a task subscribes to the stable Thread', async () => {
  const { h, event, receive, route } = await conversation('dm', false, '调研旅行')
  await route({ kind: 'accept', title: 'Travel', worktree_name: 'travel', acknowledgement: '开始。' })
  await receive({ ...event, messageId: 'greet-again', eventId: 'greet-again', text: '你好呀', reply: { ...event.reply, messageId: 'greet-again' } })
  const id = key('dsh-im', 'chat', event.fingerprint, 'chat', 'greet-again'), trigger = h.runtime.store.triggers.get(id)!
  const result = await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [{ trigger_id: id, kind: 'respond', text: '你好！' }] })
  expect(result.results).toEqual([expect.objectContaining({ decision: 'respond' })])
  expect(h.runtime.store.tickets.list()).toHaveLength(1)
})

it('separates simultaneous group requests into decisions owned by their actual senders', async () => {
  const { h, event, receive, route } = await conversation('group', true)
  await route({ kind: 'respond', text: '你好。' })
  h.runtime.store.saveSettings({ ...h.runtime.store.settings(), paused: true })
  for (const actor of ['alice', 'bob']) await receive({ ...event, messageId: actor, eventId: actor, actor: { kind: 'user', id: actor }, text: `Do work for ${actor}`,
    reply: { ...event.reply, messageId: actor, actorId: actor } })
  h.runtime.store.saveSettings({ ...h.runtime.store.settings(), paused: false })
  await h.runtime.pump(); await h.runtime.idle()
  const ids = ['alice', 'bob'].map(actor => key('dsh-im', 'chat', event.fingerprint, 'chat', actor))
  expect(h.runtime.engine.candidate(ids[0]!)?.triggers.map(item => item.id)).toEqual([ids[0]])
  expect(h.runtime.engine.candidate(ids[1]!)).toBeUndefined()
  for (const [index, actor] of ['alice', 'bob'].entries()) {
    const id = ids[index]!, trigger = h.runtime.store.triggers.get(id)!
    await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [{ trigger_id: id, kind: 'accept', title: actor,
      worktree_name: actor, acknowledgement: '开始。' }] })
    await h.runtime.idle()
  }
  expect(h.runtime.store.tickets.list().map(item => [item.title, item.mandate.actor.id]).sort()).toEqual([['alice', 'alice'], ['bob', 'bob']])
})

it('refuses historical owner requests and cross-conversation stops even through Main tools', async () => {
  const { h, event, receive, route, triggerId } = await conversation('group', true, '做一个旅行计划')
  await route({ kind: 'accept', title: 'Travel', worktree_name: 'travel', acknowledgement: '开始。' })
  const ticket = h.runtime.store.tickets.list()[0]!, first = h.runtime.store.triggers.get(triggerId)!
  await receive({ ...event, messageId: 'other-stop', eventId: 'other-stop', conversation: { kind: 'dm', id: 'other' }, text: '停止任务',
    reply: { ...event.reply, messageId: 'other-stop', conversationId: 'other' } })
  const otherId = key('dsh-im', 'chat', event.fingerprint, 'other', 'other-stop')
  const result = await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [{ trigger_id: otherId, kind: 'stop', ticket_id: ticket.id }] })
  expect(result.results).toEqual([expect.objectContaining({ refused: expect.stringContaining('outside this conversation') })])
  expect(await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [{ trigger_id: triggerId, kind: 'stop', ticket_id: ticket.id }] })).toMatchObject({ results: [{ refused: expect.stringContaining('already been handled') }] })
  expect(h.runtime.store.tickets.get(ticket.id)?.ended).toBeUndefined()
})


it('scopes the IM expert catalog and enforces source restrictions at acceptance', async () => {
  const { h, triggerId } = await conversation('dm', false, '准备七天旅行计划')
  const input = { directory: join(process.cwd(), 'skills/create-expert/assets/travel-planner'), format: 'codex' as const }
  const snapshot = h.runtime.experts.preview(input)
  h.runtime.experts.save(input, snapshot.digest, 0); h.runtime.experts.enable(snapshot.id, 1, true)
  const trigger = h.runtime.store.triggers.get(triggerId)!, dialogueId = String(trigger.meta.dialogueSessionId)
  const persona = { agents: 'Coordinate trips', soul: 'Be warm' }
  const prefs = h.runtime.expertPreferences
  prefs.save({ accounts: [{ source: trigger.source, persona, allowed: [] }] }, 0)
  expect(await h.runTool(h.runtime.masterId, 'personal_agent_experts', { trigger_id: triggerId })).toMatchObject({ experts: [] })
  await expect(h.runTool(h.runtime.masterId, 'personal_agent_experts', { trigger_id: 'foreign' })).rejects.toThrow()
  const decision = { kind: 'accept', trigger_id: triggerId, title: 'Trip', worktree_name: 'trip', acknowledgement: '开始规划。',
    expert: { id: snapshot.id, digest: snapshot.digest, reason: 'Seven-day itinerary requested' } }
  expect(await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [decision] })).toMatchObject({ results: [{ refused: expect.stringContaining('not allowed') }] })
  expect(h.runtime.store.tickets.list()).toEqual([])
  prefs.save({ accounts: [{ source: trigger.source, persona, allowed: [snapshot.id] }] }, 1)
  expect(await h.runTool(h.runtime.masterId, 'personal_agent_experts', { trigger_id: triggerId })).toMatchObject({ experts: [{ id: snapshot.id }] })
  await h.runTool(h.runtime.masterId, 'personal_agent_route', { decisions: [decision] })
  await h.runtime.idle()
  expect(h.runtime.store.tickets.list()[0]?.expert?.snapshot.digest).toBe(snapshot.digest)
})

it('delivers a verified reply directly to its Worker but routes unbound follow-ups through Main', async () => {
  const { h, event, receive, route, triggerId } = await conversation('dm', false, '研究杭州旅行')
  await route({ kind: 'accept', title: 'Travel', worktree_name: 'travel', acknowledgement: '开始。' })
  await h.runtime.idle()
  const ticket = h.runtime.store.tickets.list()[0]!
  h.deliveries.mockClear()
  await receive({ ...event, messageId: 'reply', eventId: 'reply', text: '增加一天',
    reply: { ...event.reply, messageId: 'reply', parentId: 'greeting' } })
  const id = key('dsh-im', 'chat', event.fingerprint, 'chat', 'reply')
  expect(h.runtime.store.triggers.disposition(id)?.fanout).toEqual([ticket.id])
  expect(h.runtime.engine.candidate(id)).toBeUndefined()
  expect(h.relays(`spa-worker-${ticket.id}`)).toContainEqual(expect.objectContaining({ trigger_id: id }))
  expect(h.relays(h.runtime.masterId).filter(item => item.kind === 'candidate')).toEqual([])
  await receive({ ...event, messageId: 'vague', eventId: 'vague', text: '再改一下', reply: { ...event.reply, messageId: 'vague' } })
  const vague = key('dsh-im', 'chat', event.fingerprint, 'chat', 'vague')
  expect(h.runtime.store.triggers.disposition(vague)?.fanout).toEqual([])
  expect(h.runtime.engine.candidate(vague)).toBeDefined()
  expect(h.runtime.store.tickets.get(ticket.id)?.origin.triggerId).toBe(triggerId)
})

it('does not give another sender a Worker through a quoted task message', async () => {
  const { h, event, receive, route } = await conversation('group', true, '研究旅行')
  await route({ kind: 'accept', title: 'Travel', worktree_name: 'travel', acknowledgement: '开始。' })
  await receive({ ...event, messageId: 'stranger', eventId: 'stranger', actor: { kind: 'user', id: 'bob' }, text: '改变计划',
    reply: { ...event.reply, messageId: 'stranger', parentId: 'greeting', actorId: 'bob' } })
  const id = key('dsh-im', 'chat', event.fingerprint, 'chat', 'stranger')
  expect(h.runtime.store.triggers.disposition(id)?.fanout).toEqual([])
  expect(h.runtime.engine.candidate(id)?.triggers[0]?.actor.id).toBe('bob')
})

it('atomically transfers an undecided legacy evaluation and does not duplicate Main delivery on restart', async () => {
  const { migrateMainCandidates } = await import('../src/messaging/main-routing.ts')
  const { h, triggerId } = await conversation()
  h.runtime.store.delete('personal-main-routing-v1')
  const thread = h.runtime.store.threads.active().find(item => item.evaluating?.triggerIds.includes(triggerId))!
  expect(thread.evaluating?.delivered).toBeDefined()
  const enqueue = vi.spyOn(h.runtime.effects, 'enqueue').mockImplementationOnce(() => { throw new Error('queue unavailable') })
  expect(() => migrateMainCandidates(h.runtime.store, h.runtime.effects)).toThrow('queue unavailable')
  expect(h.runtime.store.get('personal-main-routing-v1')).toBeUndefined()
  expect(h.runtime.store.threads.get(thread.key)?.evaluating?.delivered).toBeDefined()
  enqueue.mockRestore()
  h.deliveries.mockClear()
  migrateMainCandidates(h.runtime.store, h.runtime.effects)
  migrateMainCandidates(h.runtime.store, h.runtime.effects)
  await h.runtime.idle()
  expect(h.runtime.store.get('personal-main-routing-v1')).toBe(true)
  expect(h.runtime.engine.candidate(triggerId)).toBeDefined()
  expect(h.deliveries).not.toHaveBeenCalled()
  expect(h.agents.size).toBe(1)
})

it('rechecks the IM generation when model preflight finishes after /new', async () => {
  const { h, event, receive, route } = await conversation('dm', false, '准备旅行计划')
  const original = h.controller.modelCatalog.getMockImplementation()!
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  h.controller.modelCatalog.mockImplementationOnce(async (...args) => { await waiting; return original(...args) })
  const pending = route({ kind: 'accept', title: 'Travel', worktree_name: 'travel', acknowledgement: '开始。' })
  await receive({ ...event, messageId: 'reset', eventId: 'reset', text: '/new', reply: { ...event.reply, messageId: 'reset' } })
  release()
  expect(await pending).toMatchObject({ refused: expect.stringContaining('changed') })
  expect(h.runtime.store.tickets.list()).toEqual([])
})
