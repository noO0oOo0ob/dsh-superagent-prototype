/** Account-bound intake, durable send reconciliation, and Connector lifecycle behavior. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Connectors } from '../src/app/connectors.ts'
import { Store } from '../src/app/store.ts'
import type { OutboundMessage, Trigger } from '../src/core/index.ts'
import { FEISHU_PROVIDER, ImEventSchema, type ConnectorService, type ImEvent } from '../src/connectors/protocol.ts'
import { ConnectorConfigSchema, PersonalSettings, type ConnectorConfig } from '../src/personal/config.ts'
import { settingsPolicy, type Settings } from '../src/policy.ts'
import { nativeConnectorConfigs } from '../src/connectors/native-accounts.ts'
import { SourceRegistry } from '../src/sources/registry.ts'

const fingerprint = 'a'.repeat(64), otherFingerprint = 'b'.repeat(64)
type ConsumerOptions = Parameters<ConnectorService['consumeInbound']>[1]
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.restoreAllMocks() })

function config(fields: Partial<ConnectorConfig> = {}): ConnectorConfig {
  return ConnectorConfigSchema.parse({ id: 'work', enabled: true, botId: 'bot-1', fingerprint,
    conversations: [{ id: 'chat-1', kind: 'group', listen: 'mentions' }], allowedSenders: ['alice'], ...fields })
}

function event(fields: { botId?: string; fingerprint?: string; chat?: string; actor?: string; message?: string; thread?: string; mentioned?: boolean } = {}): ImEvent {
  const messageId = fields.message ?? 'message-1', conversationId = fields.chat ?? 'chat-1', actorId = fields.actor ?? 'alice'
  return ImEventSchema.parse({ version: 1, channel: 'feishu', botId: fields.botId ?? 'bot-1', fingerprint: fields.fingerprint ?? fingerprint,
    eventId: `event-${messageId}`, messageId, actor: { kind: 'user', id: actorId }, conversation: { kind: 'group', id: conversationId },
    mentionedAccount: fields.mentioned ?? true, at: '2026-11-04T01:02:03Z', text: 'Plan a trip',
    reply: { messageId, conversationId, actorId, threadId: fields.thread ?? 'thread-1' } })
}

function fakeService() {
  const consumers = new Map<string, ConsumerOptions>(), releases: ReturnType<typeof vi.fn>[] = []
  const describeBot = vi.fn<ConnectorService['describeBot']>(async botId => ({ version: 1, botId, channel: 'feishu', connected: true,
    account: { fingerprint: botId === 'bot-2' ? otherFingerprint : fingerprint }, capabilities: ['exclusive-text-consumer', 'reply-text-checked'] }))
  const consumeInbound = vi.fn<ConnectorService['consumeInbound']>(async (botId, options) => {
    consumers.set(botId, options)
    const release = vi.fn(() => { if (consumers.get(botId) === options) consumers.delete(botId) })
    releases.push(release)
    return release
  })
  const replyChecked = vi.fn<ConnectorService['replyChecked']>(async () => ({ sent: true }))
  const historyChecked = vi.fn<NonNullable<ConnectorService['historyChecked']>>(async () => ({ events: [event()], hasMore: false }))
  const service: ConnectorService = { contractVersion: 1, inboundVersion: 1, listBots: async () => [{ botId: 'bot-1', channel: 'feishu' }],
    describeBot, consumeInbound, replyChecked, historyChecked }
  return { service, consumers, releases, describeBot, consumeInbound, replyChecked, historyChecked }
}

function host(configs = [config()]) {
  const root = mkdtempSync(join(tmpdir(), 'personal-connectors-')), store = new Store(join(root, 'state.sqlite'))
  const personal = new PersonalSettings(store), sources = new SourceRegistry(() => store.settings()), lifetime = new AbortController()
  personal.save({ connectors: configs }, 0)
  const receive = vi.fn(async (trigger: Trigger) => { store.triggers.save(trigger) })
  const policyChanged = vi.fn<(before: Settings, after: Settings) => void>()
  const connectorHost = { store, sources, personal, lifetime: lifetime.signal, receive, policyChanged }
  const connectors = new Connectors(connectorHost), fake = fakeService()
  cleanups.push(async () => { lifetime.abort(); await connectors.stop(); store.close(); rmSync(root, { recursive: true, force: true }) })
  const configure = (values: ConnectorConfig[]) => { const current = personal.view(); personal.save({ ...current.config, connectors: values }, current.revision) }
  const refresh = async () => { await connectors.refresh(); await vi.waitFor(() => expect(Object.values(connectors.status()).some(value => value.state === 'connecting')).toBe(false)) }
  const start = async () => { connectors.bind(fake.service); await refresh() }
  const deliver = async (value = event()) => {
    const consumer = fake.consumers.get(value.botId)
    if (!consumer) throw new Error('Test consumer is missing')
    return consumer.onEvent(value, { signal: new AbortController().signal })
  }
  const outgoing = async (id = 'out-1'): Promise<OutboundMessage> => {
    await deliver()
    return { id, channel: receive.mock.calls.at(-1)![0].channel!, kind: 'notice', text: 'Your plan is ready' }
  }
  return { ...connectorHost, connectorHost, connectors, fake, configure, refresh, start, deliver, outgoing }
}

const failure = (code: string) => Object.assign(new Error(code), { code })

describe('dsh-im Connector', () => {
  it('accepts account intake without local lists and retains account checks and revocation', async () => {
    const h = host([config({ intake: 'account', conversations: [], allowedSenders: [] })])
    await h.start()
    await h.deliver(event({ actor: 'new-user', chat: 'new-conversation' }))
    const trigger = h.receive.mock.calls[0]![0]
    expect(h.sources.scope(trigger)).toEqual({ listened: true, observed: false, row: 'group' })
    const policy = settingsPolicy(h.store.settings(), h.sources)
    const thread = { key: 'test', ref: trigger.threads[0]!, createdAt: '', subscriptions: [], correlated: [], pending: [], meta: {} }
    const gate = policy.gate(trigger, thread, [])
    expect(gate).toMatchObject({ admissible: true, strength: 'explicit', basis: { via: 'admission', cell: 'unlistedAddressed' } })
    if (!gate.admissible) throw new Error('Expected an admitted request')
    const mandate = { actor: trigger.actor, strength: gate.strength, basis: gate.basis, policyVersion: policy.version, scope: 'Plan a trip' }
    expect(policy.revalidate(mandate)).toBe(true)
    const message = { id: 'account-reply', channel: trigger.channel!, kind: 'notice' as const, text: 'Ready' }
    expect(h.sources.channelAllowed(message.channel)).toBe(true)
    await expect(h.deliver(event({ fingerprint: otherFingerprint }))).rejects.toThrow('Untrusted source account')
    h.configure([config({ intake: 'account', enabled: false, conversations: [], allowedSenders: [] })])
    await h.refresh()
    expect(settingsPolicy(h.store.settings(), h.sources).revalidate(mandate)).toBe(false)
    expect(h.sources.scope(trigger)).toMatchObject({ listened: false })
  })

  it('keeps legacy scope restrictions and rejects ambiguous account lists', () => {
    expect(config().intake).toBe('restricted')
    expect(() => config({ intake: 'account' })).toThrow('does not use local')
    expect(() => config({ conversations: [], allowedSenders: [] })).toThrow('Restricted intake')
  })

  it('discovers account identifiers without activating consumers or exposing provider extras', async () => {
    const h = host([config({ enabled: false })])
    await h.start()
    h.fake.describeBot.mockResolvedValue({ version: 1, botId: 'bot-1', channel: 'feishu', connected: true,
      account: { fingerprint, name: 'Assistant' }, capabilities: ['exclusive-text-consumer', 'reply-text-checked'], token: 'private-provider-value' })
    expect(await h.connectors.discover()).toEqual([{ provider: 'feishu', version: 1, botId: 'bot-1', channel: 'feishu', connected: true,
      account: { fingerprint, name: 'Assistant' }, capabilities: ['exclusive-text-consumer', 'reply-text-checked'] }])
    expect(h.fake.consumeInbound).not.toHaveBeenCalled()
    h.fake.describeBot.mockResolvedValue({ version: 1, botId: 'another', channel: 'feishu', connected: true,
      account: { fingerprint }, capabilities: [] })
    expect(await h.connectors.discover()).toMatchObject([{ available: false, error: 'account-changed' }])
  })

  it('requires explicit enabled account bindings and reports a missing service', async () => {
    const h = host([config({ enabled: false })])
    await h.start()
    expect(h.fake.consumeInbound).not.toHaveBeenCalled()
    expect(h.connectors.status().work).toMatchObject({ state: 'disabled' })
    h.configure([config()])
    await h.connectors.stop()
    const separate = new Connectors(h.connectorHost)
    await separate.refresh()
    expect(separate.status().work).toMatchObject({ state: 'waiting' })
    await separate.stop()
  })

  it('acknowledges intake only after persistence and preserves scoped metadata', async () => {
    const h = host(), barrier = Promise.withResolvers<void>()
    await h.start()
    h.receive.mockImplementationOnce(async trigger => { await barrier.promise; h.store.triggers.save(trigger) })
    let acknowledged = false
    const handling = h.deliver().then(value => { acknowledged = true; return value })
    await Promise.resolve()
    expect(acknowledged).toBe(false)
    const trigger = h.receive.mock.calls[0]![0]
    expect(h.store.triggers.get(trigger.id)).toBeUndefined()
    barrier.resolve()
    await expect(handling).resolves.toEqual({ accepted: true })
    expect(h.store.triggers.get(trigger.id)).toMatchObject({ source: 'im-work', meta: { connectorId: 'work', fingerprint, messageId: 'message-1', conversationId: 'chat-1', actorId: 'alice' } })
    expect(h.sources.scope(trigger)).toEqual({ listened: true, observed: false, row: 'group' })
    h.receive.mockRejectedValueOnce(new Error('disk unavailable'))
    await expect(h.deliver(event({ message: 'next' }))).rejects.toThrow('disk unavailable')
  })

  it('rejects mismatched accounts and malformed reply routes, and ignores excluded senders and conversations', async () => {
    const h = host()
    await h.start()
    await expect(h.deliver(event({ fingerprint: otherFingerprint }))).rejects.toThrow('Untrusted source account')
    const value = event()
    await expect(h.fake.consumers.get('bot-1')!.onEvent({ ...value, reply: { ...value.reply, actorId: 'mallory' } }, { signal: new AbortController().signal })).rejects.toThrow()
    await expect(h.deliver(event({ actor: 'mallory' }))).resolves.toEqual({ accepted: true })
    await expect(h.deliver(event({ chat: 'other-chat' }))).resolves.toEqual({ accepted: true })
    expect(h.receive).not.toHaveBeenCalled()
  })

  it('retains provided sender and conversation labels without inventing missing labels', async () => {
    const h = host(), named = event()
    await h.start()
    named.actor.name = 'Alice'
    named.conversation.title = 'Trip discussion'
    named.mentions = [{ id: 'bot-open-id', key: '@bot' }]
    await h.deliver(named)
    expect(h.receive.mock.calls[0]![0].meta).toMatchObject({ senderName: 'Alice', conversationTitle: 'Trip discussion',
      sentAt: named.at, threadId: 'thread-1', mentions: named.mentions })
    await h.deliver(event({ message: 'unnamed' }))
    expect(h.receive.mock.calls[1]![0].meta).not.toHaveProperty('senderName')
    expect(h.receive.mock.calls[1]![0].meta).not.toHaveProperty('conversationTitle')
  })

  it('does not activate a bot whose verified fingerprint changed', async () => {
    const h = host([config({ fingerprint: otherFingerprint })])
    await h.start()
    expect(h.fake.consumeInbound).not.toHaveBeenCalled()
    expect(h.connectors.status().work).toEqual({ state: 'error', detail: 'Connector unavailable: account-changed' })
  })

  it('processes configuration saved while activation was in flight and releases superseded consumers', async () => {
    const h = host(), describe = Promise.withResolvers<unknown>()
    h.fake.describeBot.mockImplementationOnce(() => describe.promise)
    const starting = h.start()
    await vi.waitFor(() => expect(h.fake.describeBot).toHaveBeenCalled())
    h.configure([config({ botId: 'bot-2', fingerprint: otherFingerprint })])
    const refreshing = h.refresh()
    describe.resolve({ version: 1, botId: 'bot-1', channel: 'feishu', connected: true, account: { fingerprint }, capabilities: ['exclusive-text-consumer', 'reply-text-checked'] })
    await Promise.all([starting, refreshing])
    expect(h.fake.consumeInbound.mock.calls.map(([id]) => id)).toEqual(['bot-2'])
    expect(h.connectors.status().work).toMatchObject({ state: 'ready' })
    const previous = h.fake.consumers.get('bot-2')!
    h.configure([config()]); await h.refresh()
    expect(previous.signal.aborted).toBe(true)
    await expect(previous.onEvent(event({ botId: 'bot-2', fingerprint: otherFingerprint }), { signal: new AbortController().signal })).rejects.toThrow()
    expect(h.fake.releases[0]).toHaveBeenCalledOnce()
  })

  it('preserves before and after scope snapshots for mandate revocation and disables a removed Source', async () => {
    const h = host()
    await h.start(); await h.deliver()
    const trigger = h.receive.mock.calls[0]![0]
    h.policyChanged.mockImplementation((before, after) => {
      expect(h.sources.scope(trigger, before).listened).toBe(true)
      expect(h.sources.scope(trigger, after).listened).toBe(false)
    })
    h.configure([])
    await h.refresh()
    expect(h.store.settings().sources['im-work']?.enabled).toBe(false)
    expect(h.sources.kind('im-work')).toBeUndefined()
    expect(h.policyChanged).toHaveBeenCalledTimes(2)
    expect(h.fake.releases[0]).toHaveBeenCalledOnce()
  })

  it('isolates conversation and account thread identities even when providers reuse message IDs', async () => {
    const h = host([config({ conversations: [{ id: 'chat-1', kind: 'group', listen: 'mentions' }, { id: 'chat-2', kind: 'group', listen: 'mentions' }] })])
    await h.start(); await h.deliver(); await h.deliver(event({ chat: 'chat-2' }))
    const first = h.receive.mock.calls[0]![0], second = h.receive.mock.calls[1]![0]
    expect(first.id).not.toBe(second.id)
    expect(first.threads[0]).not.toEqual(second.threads[0])
    h.configure([config({ botId: 'bot-2', fingerprint: otherFingerprint })]); await h.refresh()
    await h.deliver(event({ botId: 'bot-2', fingerprint: otherFingerprint }))
    expect(h.receive.mock.calls[2]![0].threads[0]).not.toEqual(first.threads[0])
  })

  it('denies invalid route JSON and cross-account outbound channels without calling the provider', async () => {
    const h = host()
    await h.start()
    const message = await h.outgoing(), channel = message.channel
    expect(h.sources.channelAllowed({ ...channel, address: { ...channel.address, route: '{' } })).toBe(false)
    expect(h.sources.channelAllowed({ ...channel, address: { ...channel.address, fingerprint: otherFingerprint } })).toBe(false)
    await expect(h.sources.send({ ...message, channel: { ...channel, address: { ...channel.address, route: '{' } } }, {} as never)).rejects.toThrow('no longer allowed')
    expect(h.fake.replyChecked).not.toHaveBeenCalled()
  })

  it('holds ambiguous deliveries across restart until a person confirms or explicitly retries', async () => {
    const h = host()
    await h.start()
    const message = await h.outgoing()
    h.fake.replyChecked.mockRejectedValueOnce(failure('reply-result-unknown'))
    await expect(h.sources.send(message, {} as never)).rejects.toThrow('reply-result-unknown')
    expect(h.connectors.pending()).toMatchObject([{ id: message.id, state: 'uncertain', attempts: 1 }])
    await h.connectors.stop()
    const restarted = new Connectors(h.connectorHost)
    cleanups.push(() => restarted.stop())
    restarted.bind(h.fake.service)
    await restarted.refresh()
    await vi.waitFor(() => expect(restarted.status().work?.state).toBe('ready'))
    await expect(h.sources.send(message, {} as never)).rejects.toThrow('outcome is unknown')
    expect(h.fake.replyChecked).toHaveBeenCalledTimes(1)
    restarted.reconcile(message.id, 'confirm_sent', 'Visible in the original thread')
    await expect(h.sources.send(message, {} as never)).resolves.toBe('sent')
    expect(h.fake.replyChecked).toHaveBeenCalledTimes(1)
    const second = await h.outgoing('out-2')
    h.fake.replyChecked.mockRejectedValueOnce(failure('reply-result-unknown'))
    await expect(h.sources.send(second, {} as never)).rejects.toThrow()
    restarted.reconcile(second.id, 'retry', 'Checked conversation; no reply present')
    await expect(h.sources.send(second, {} as never)).resolves.toBe('sent')
    expect(h.connectors.pending()).toEqual([])
  })

  it('does not permit manual reconciliation while the original send is still in flight', async () => {
    const h = host(), response = Promise.withResolvers<unknown>()
    await h.start()
    const message = await h.outgoing()
    h.fake.replyChecked.mockImplementationOnce(() => response.promise)
    const sending = h.sources.send(message, {} as never)
    expect(() => h.connectors.reconcile(message.id, 'retry', 'checked')).toThrow('still in flight')
    response.resolve({ sent: true })
    await expect(sending).resolves.toBe('sent')
    await expect(h.sources.send({ ...message, text: 'Different payload' }, {} as never)).rejects.toThrow('identity changed')
  })

  it('automatically retries only guaranteed pre-send failures and settles stale routes as gone', async () => {
    const h = host()
    await h.start()
    const message = await h.outgoing()
    h.fake.replyChecked.mockRejectedValueOnce(failure('bot-not-connected'))
    await expect(h.sources.send(message, {} as never)).rejects.toThrow('bot-not-connected')
    expect(h.connectors.pending()).toMatchObject([{ state: 'retryable' }])
    await expect(h.sources.send(message, {} as never)).resolves.toBe('sent')
    const stale = await h.outgoing('stale')
    h.fake.replyChecked.mockRejectedValueOnce(failure('stale-route'))
    await expect(h.sources.send(stale, {} as never)).resolves.toBe('gone')
    await expect(h.sources.send(stale, {} as never)).resolves.toBe('gone')
    expect(h.connectors.pending()).toEqual([])
  })

  it('rejects history from another account, conversation or thread and drops results after configuration changes', async () => {
    const h = host()
    await h.start(); await h.deliver()
    const trigger = h.receive.mock.calls[0]![0], context = h.sources.threadContext(trigger)!
    for (const other of [ImEventSchema.parse({ ...event(), provider: 'mail' }), event({ fingerprint: otherFingerprint }), event({ chat: 'other' }), event({ thread: 'other' })]) {
      h.fake.historyChecked.mockResolvedValueOnce({ events: [other], hasMore: false })
      await expect(context.read({} as never, 'thread')).rejects.toThrow('another account, conversation or thread')
    }
    const page = Promise.withResolvers<unknown>()
    h.fake.historyChecked.mockImplementationOnce(() => page.promise)
    const reading = context.read({} as never, 'thread')
    h.configure([config({ allowedSenders: ['bob'] })])
    page.resolve({ events: [event()], hasMore: false })
    await expect(reading).rejects.toThrow('configuration changed')
  })

  it('cleans up activation that completes after stop', async () => {
    const h = host(), acquired = Promise.withResolvers<() => void>(), release = vi.fn()
    h.fake.consumeInbound.mockImplementationOnce(() => acquired.promise)
    const starting = h.start()
    await vi.waitFor(() => expect(h.fake.consumeInbound).toHaveBeenCalled())
    const stopping = h.connectors.stop()
    await stopping
    expect(release).not.toHaveBeenCalled()
    acquired.resolve(release)
    await Promise.all([starting, stopping])
    expect(release).toHaveBeenCalledOnce()
    expect(h.sources.kind('im-work')).toBeUndefined()
  })

  it('stops waiting for a pending account description and never acquires its consumer afterward', async () => {
    const h = host(), description = Promise.withResolvers<unknown>()
    h.fake.describeBot.mockImplementationOnce(() => description.promise)
    const starting = h.start()
    await vi.waitFor(() => expect(h.fake.describeBot).toHaveBeenCalled())
    await h.connectors.stop()
    description.reject(new Error('late description failure'))
    await starting
    expect(h.fake.consumeInbound).not.toHaveBeenCalled()
  })

  it('does not let an old disposer unbind a newer binding of the same service', async () => {
    const h = host(), old = h.connectors.bind(h.fake.service)
    await h.refresh()
    h.connectors.bind(h.fake.service)
    old()
    await h.refresh()
    expect(h.connectors.status().work).toMatchObject({ state: 'ready' })
    await expect(h.deliver()).resolves.toEqual({ accepted: true })
  })

  it('records a background bind failure without leaving an unhandled rejection', async () => {
    const h = host()
    h.policyChanged.mockImplementationOnce(() => { throw new Error('policy unavailable') })
    h.connectors.bind(h.fake.service)
    await vi.waitFor(() => expect(h.connectors.status()._runtime).toMatchObject({ state: 'error' }))
    expect(h.store.settings().sources['im-work']).toBeUndefined()
    await h.refresh()
    expect(h.connectors.status().work).toMatchObject({ state: 'ready' })
  })
})

it('uses the native per-part ledger without leaving a second whole-message recovery lock', async () => {
  const h = host()
  const native = vi.fn<NonNullable<ConnectorService['deliverChecked']>>()
  h.fake.service.deliverChecked = native
  native.mockRejectedValueOnce(failure('delivery-incomplete')).mockResolvedValue({ sent: true })
  await h.start()
  const message = await h.outgoing()
  const kind = h.sources.kind('im-work')!
  await expect(kind.channel!.send!(undefined as never, message)).rejects.toThrow('delivery-incomplete')
  expect(h.connectors.pending()).toEqual([])
  await expect(kind.channel!.send!(undefined as never, message)).resolves.toBe('sent')
  expect(native).toHaveBeenCalledTimes(2)
  expect(h.fake.replyChecked).not.toHaveBeenCalled()
})


describe('provider isolation', () => {
  const mail = { ...FEISHU_PROVIDER, id: 'mail', channels: ['email'] }
  function secondService() {
    const fake = fakeService()
    fake.describeBot.mockImplementation(async botId => ({ version: 1, botId, channel: 'email', connected: true,
      account: { fingerprint }, capabilities: ['exclusive-text-consumer', 'reply-text-checked'] }))
    fake.service.listBots = async () => [{ botId: 'bot-1', channel: 'email' }]
    return fake
  }
  it('keeps equal native IDs in separate providers and routes replies to the captured provider', async () => {
    const h = host([config(), config({ id: 'mailbox', provider: 'mail', channel: 'email' })]), second = secondService()
    await h.start()
    const release = h.connectors.register(mail, second.service)
    await h.refresh()
    expect(h.fake.releases[0]).not.toHaveBeenCalled()
    const original = await h.outgoing()
    const incoming = { ...event(), channel: 'email' }
    await second.consumers.get('bot-1')!.onEvent(incoming, { signal: h.lifetime })
    const trigger = h.receive.mock.calls.at(-1)![0]
    expect(trigger.meta.provider).toBe('mail')
    expect(trigger.threads).not.toEqual(h.receive.mock.calls[0]![0].threads)
    await h.sources.kind('im-mailbox')!.channel!.send!(undefined as never, { id: 'mail-out', channel: trigger.channel!, text: 'Mail result', kind: 'notice' })
    expect(second.replyChecked).toHaveBeenCalledOnce()
    expect(h.fake.replyChecked).not.toHaveBeenCalled()
    await expect(h.sources.kind('im-work')!.channel!.send!(undefined as never, original)).resolves.toBe('sent')
    release()
    expect(h.connectors.status().mailbox).toMatchObject({ state: 'waiting' })
    expect(h.connectors.status().work).toMatchObject({ state: 'ready' })
    await expect(h.deliver(event({ message: 'after-mail-stop' }))).resolves.toEqual({ accepted: true })
  })
  it('starts a second provider even while the first provider description is stalled', async () => {
    const h = host([config(), config({ id: 'mailbox', provider: 'mail', channel: 'email' })]), second = secondService()
    h.fake.describeBot.mockImplementation(() => new Promise(() => {}))
    h.connectors.bind(h.fake.service)
    h.connectors.register(mail, second.service)
    await h.connectors.refresh()
    await vi.waitFor(() => expect(second.consumers.has('bot-1')).toBe(true))
    expect(h.connectors.status().mailbox).toMatchObject({ state: 'ready' })
    await h.connectors.stop()
    expect(second.releases[0]).toHaveBeenCalledOnce()
  })
  it('rejects channel and provider substitution before creating a Trigger', async () => {
    const h = host()
    await h.start()
    await expect(h.deliver(ImEventSchema.parse({ ...event(), channel: 'email' }))).rejects.toThrow('Untrusted source account')
    await expect(h.deliver(ImEventSchema.parse({ ...event(), provider: 'mail' }))).rejects.toThrow('Untrusted source account')
    expect(h.receive).not.toHaveBeenCalled()
  })
  it('contains discovery failures and dispatches account management to one provider', async () => {
    const h = host(), second = secondService()
    await h.start()
    h.fake.service.listBots = async () => { throw failure('bot-not-connected') }
    second.service.manage = vi.fn(async () => ({ ok: true }))
    h.connectors.register(mail, second.service)
    expect(await h.connectors.discover()).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'feishu', available: false }),
      expect.objectContaining({ provider: 'mail', channel: 'email', botId: 'bot-1' }),
    ]))
    await expect(h.connectors.manage('mail', 'account.status', { botId: 'bot-1' })).resolves.toEqual({ ok: true })
    expect(second.service.manage).toHaveBeenCalledWith('account.status', { botId: 'bot-1' }, undefined)
    await expect(h.connectors.manage('missing', 'account.status', {})).rejects.toThrow('capability-unavailable')
  })
  it('reads attachments only through the captured provider and revokes an acquired reader', async () => {
    const h = host([config(), config({ id: 'mailbox', provider: 'mail', channel: 'email' })]), second = secondService()
    h.fake.service.readResource = vi.fn(async () => Buffer.from('feishu'))
    second.service.readResource = vi.fn(async () => Buffer.from('mail'))
    await h.start(); h.connectors.register(mail, second.service); await h.refresh()
    const incoming = { ...event(), channel: 'email' }
    await second.consumers.get('bot-1')!.onEvent(incoming, { signal: h.lifetime })
    const reader = h.connectors.resourceReader(h.receive.mock.calls.at(-1)![0])!
    const options = { expectedFingerprint: fingerprint, signal: h.lifetime, maxBytes: 100 }
    await expect(reader.readResource!('bot-1', incoming.reply, 'file-1', options)).resolves.toEqual(Buffer.from('mail'))
    expect(h.fake.service.readResource).not.toHaveBeenCalled()
    await expect(reader.readResource!('bot-1', { ...incoming.reply, conversationId: 'another' }, 'file-1', options)).rejects.toThrow('account-changed')
    h.configure([config()]); await h.refresh()
    await expect(reader.readResource!('bot-1', incoming.reply, 'file-1', options)).rejects.toThrow('account-changed')
  })
  it('keeps the legacy Feishu destination and thread valid after an explicit provider migration', async () => {
    const h = host(); await h.start()
    const message = await h.outgoing(), original = h.receive.mock.calls.at(-1)![0]
    delete message.channel.address.provider
    h.configure([config({ provider: 'feishu', channel: 'feishu' })]); await h.refresh()
    await h.deliver()
    expect(h.receive.mock.calls.at(-1)![0].id).toBe(original.id)
    expect(h.receive.mock.calls.at(-1)![0].threads).toEqual(original.threads)
    await expect(h.sources.kind('im-work')!.channel!.send!(undefined as never, message)).resolves.toBe('sent')
  })
  it('does not prepare a directory for a rebound account or accept a late result after revocation', async () => {
    const h = host(); h.fake.service.prepareDialogue = vi.fn(async () => '/original')
    await h.start(); await h.deliver()
    const trigger = h.receive.mock.calls[0]![0]
    await expect(h.connectors.prepareDialogue(trigger, 'conversation')).resolves.toBe('/original')
    const prepared = Promise.withResolvers<string>()
    h.fake.service.prepareDialogue = vi.fn(() => prepared.promise)
    const preparing = h.connectors.prepareDialogue(trigger, 'conversation')
    h.configure([config({ botId: 'bot-2', fingerprint: otherFingerprint })])
    prepared.resolve('/old')
    await expect(preparing).rejects.toThrow('account-changed')
    await expect(h.connectors.prepareDialogue(trigger, 'conversation')).rejects.toThrow('account-changed')
    expect(h.fake.service.prepareDialogue).toHaveBeenCalledOnce()
  })
  it('stops waiting for a stalled dialogue directory when the provider is removed', async () => {
    const h = host(), prepared = Promise.withResolvers<string>()
    h.fake.service.prepareDialogue = () => prepared.promise
    const unbind = h.connectors.bind(h.fake.service); await h.refresh(); await h.deliver()
    const preparing = h.connectors.prepareDialogue(h.receive.mock.calls[0]![0], 'conversation')
    const rejected = expect(preparing).rejects.toThrow()
    unbind(); await rejected
    prepared.reject(new Error('late provider rejection'))
    await h.connectors.stop()
  })
  it('preserves another provider native account during Feishu account synchronization', () => {
    const other = config({ id: 'native-mail', provider: 'mail', channel: 'email' })
    const original = config({ id: 'native-old', enabled: false })
    expect(nativeConnectorConfigs([other, original], [])).toEqual([other])
    const refreshed = nativeConnectorConfigs([other], [{ id: 'bot_1', channel: 'feishu', fingerprint }])
    expect(refreshed[0]).toEqual(other)
    expect(refreshed[1]).toMatchObject({ id: 'native-bot-1', provider: 'feishu', channel: 'feishu' })
  })
})
