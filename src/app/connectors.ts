/** Connector lifecycle, account-scoped intake and durable external send reconciliation. */
import { z } from 'zod'
import { GroupTargets } from '../messaging/group-targets.ts'
import { key, type Trigger, type OutboundMessage } from '../core/index.ts'
import { family } from '../kv.ts'
import { ImBotSchema, ImEventSchema, ReplyRouteSchema, IM_PRE_SEND_FAILURES, imErrorCode, providerIdOf, FEISHU_PROVIDER, type ProviderDefinition, type ConnectorService, type ImEvent } from '../connectors/protocol.ts'
import { ConnectorConfigSchema, type ConnectorConfig, type PersonalSettings } from '../personal/config.ts'
import type { Settings } from '../policy.ts'
import type { SourceKind } from '../sources/kind.ts'
import type { SourceRegistry } from '../sources/registry.ts'
import type { Store } from './store.ts'

export interface ImDelivery {
  id: string; connectorId: string; state: 'sending' | 'sent' | 'uncertain' | 'retryable' | 'gone'; at: string
  fingerprint: string; routeHash: string; textHash: string; attempts: number; error?: string
  resolution?: { action: 'confirm_sent' | 'retry'; note: string; at: string }
}
const deliveries = family<ImDelivery>('personal-im-delivery:')
const sourceId = (id: string) => `im-${id}`
const signature = (config: ConnectorConfig | undefined) => JSON.stringify(config)
interface ConnectorHost {
  store: Store; sources: SourceRegistry; personal: PersonalSettings; lifetime: AbortSignal
  receive(trigger: Trigger): unknown
  policyChanged(before: Settings, after: Settings): void
}
interface Connecting { provider: string; signature: string; abort: AbortController; service: ConnectorService; channel?: string; pending?: Promise<void> }
interface Active extends Connecting { release: () => void }
const SourceConfigSchema = z.object({ binding: ConnectorConfigSchema.optional() }).strict()
const messageId = (config: ConnectorConfig, conversationId: string, id: string) => key('dsh-im', config.id, config.fingerprint, conversationId, id)
const parseRoute = (value: string | undefined) => {
  try { return ReplyRouteSchema.safeParse(JSON.parse(value ?? 'null')).data }
  catch (error) { if (error instanceof SyntaxError) return undefined; throw error }
}
const unavailable = (code: string) => Object.assign(new Error(code), { code })
/** Stop waiting when a binding closes, while observing any later provider rejection. */
function cancellable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { reject(signal.reason) }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    operation.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}

/** Uses one exclusive consumer per configured account; no bot is discovered or enabled implicitly. */
export class Connectors {
  private readonly providers = new Map<string, { definition: ProviderDefinition; service: ConnectorService; token: object }>()
  private readonly registered = new Map<string, () => void>()
  private readonly active = new Map<string, Active>()
  private readonly connecting = new Map<string, Connecting>()
  private readonly sending = new Set<string>()
  private readonly states = new Map<string, { state: string; detail: string }>()
  private readonly acquisitions = new Set<Promise<void>>()
  private closed = false
  readonly targeting: GroupTargets
  constructor(private readonly host: ConnectorHost) { this.targeting = new GroupTargets(host.store, () => host.personal.view().config.connectors) }
  /** Compatibility entry for the existing Feishu adapter; additional providers use register(). */
  bind(service: ConnectorService): () => void { return this.register(FEISHU_PROVIDER, service) }
  /** Replace only this provider; a stale disposer cannot remove its successor or another provider. */
  register(definition: ProviderDefinition, service: ConnectorService): () => void {
    if (this.closed || this.host.lifetime.aborted) throw new Error('Connector manager is stopping')
    const token = {}, id = definition.id
    const disconnect = () => {
      for (const [connectorId, item] of [...this.active, ...this.connecting]) if (item.provider === id) {
        item.abort.abort(); this.release(connectorId)
      }
    }
    disconnect()
    this.providers.set(id, { definition, service, token })
    void this.refresh().catch(error => { this.states.set('_runtime', { state: 'error', detail: `Connector refresh failed: ${imErrorCode(error)}` }) })
    return () => {
      if (this.providers.get(id)?.token !== token) return
      disconnect(); this.providers.delete(id)
      for (const config of this.host.personal.view().config.connectors) if (providerIdOf(config) === id && config.enabled)
        this.states.set(config.id, { state: 'waiting', detail: `Provider ${id} is unavailable` })
    }
  }
  /** Capabilities of currently registered providers, without account credentials. */
  definitions(): ProviderDefinition[] { return [...this.providers.values()].map(value => value.definition) }
  /** Dispatch an owner management request to exactly one registered provider. */
  async manage(provider: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
    const service = this.providers.get(provider)?.service
    if (!service?.manage) throw unavailable('capability-unavailable')
    return service.manage(endpoint, payload, signal)
  }
  /** Prepare a dialogue through its own provider; another provider is never used as a fallback. */
  async prepareDialogue(trigger: Trigger, conversationKey: string): Promise<string | undefined> {
    const id = String(trigger.meta.connectorId), config = this.config(id), service = config && this.serviceFor(config)
    const valid = () => {
      const current = this.config(id)
      if (!config || !current || !trigger.channel || !this.allowed(current, trigger.channel.address)
        || signature(current) !== signature(config) || this.serviceFor(current) !== service) throw unavailable('account-changed')
    }
    valid()
    const active = this.active.get(id)
    if (!service || !active || active.service !== service) throw unavailable('consumer-unavailable')
    const signal = AbortSignal.any([active.abort.signal, this.host.lifetime])
    signal.throwIfAborted()
    const workspace = await cancellable(Promise.resolve(service.prepareDialogue?.(config!.botId, conversationKey, config!.fingerprint)), signal)
    signal.throwIfAborted()
    valid()
    return workspace
  }
  /** Resolve attachments against the captured account, not a global native service. */
  resourceReader(trigger: Trigger): Pick<ConnectorService, 'readResource'> | undefined {
    const id = String(trigger.meta.connectorId), config = this.config(id), service = config && this.serviceFor(config), active = this.active.get(id)
    const address = trigger.channel?.address
    if (!config || !service?.readResource || !active || active.service !== service || !address || !this.allowed(config, address)) return undefined
    const valid = () => {
      const current = this.config(id)
      if (!current || this.serviceFor(current) !== service || signature(current) !== active.signature || !this.allowed(current, address)) throw unavailable('account-changed')
    }
    return { readResource: async (botId, route, key, options) => {
      valid()
      if (botId !== config.botId || options.expectedFingerprint !== config.fingerprint || JSON.stringify(route) !== JSON.stringify(parseRoute(address.route))) throw unavailable('account-changed')
      const signal = AbortSignal.any([options.signal, active.abort.signal, this.host.lifetime])
      signal.throwIfAborted()
      const bytes = await service.readResource!(botId, route, key, { ...options, signal })
      signal.throwIfAborted(); valid()
      return bytes
    } }
  }

  async discover(): Promise<unknown[]> {
    return (await Promise.all([...this.providers.values()].map(async ({ definition, service }) => {
      try { return await Promise.all((await service.listBots()).map(async bot => {
        try {
          const described = ImBotSchema.parse(await service.describeBot(bot.botId))
          if (described.botId !== bot.botId || !definition.channels.includes(described.channel)) throw unavailable('account-changed')
          const { version, botId, channel, connected, account, capabilities } = described
          return { provider: definition.id, version, botId, channel, connected, account: { fingerprint: account.fingerprint, ...(account.name ? { name: account.name } : {}) }, capabilities }
        } catch (error) { return { provider: definition.id, botId: bot.botId, channel: bot.channel, available: false, error: imErrorCode(error) } }
      })) } catch (error) { return [{ provider: definition.id, available: false, error: imErrorCode(error) }] }
    }))).flat()
  }
  private serviceFor(config: ConnectorConfig): ConnectorService | undefined { return this.providers.get(providerIdOf(config))?.service }
  status() { return Object.fromEntries(this.states) }
  pending(): ImDelivery[] { return this.host.store.keys(deliveries).flatMap(name => this.host.store.get(name) ?? []).filter(item => item.state !== 'sent' && item.state !== 'gone') }
  /** Called only by the local management API after a person inspected the remote conversation. */
  reconcile(id: string, action: 'confirm_sent' | 'retry', note: string): void {
    const value = this.host.store.get(deliveries(id))
    if (this.sending.has(id)) throw new Error('Delivery is still in flight; wait for its outcome before reconciling')
    if (!value || !['sending', 'uncertain'].includes(value.state)) throw new Error('No uncertain delivery with this ID')
    if (!note.trim()) throw new Error('Record what was checked before reconciling delivery')
    this.host.store.set(deliveries(id), { ...value, state: action === 'confirm_sent' ? 'sent' : 'retryable',
      resolution: { action, note, at: new Date().toISOString() } })
  }
  /** Reconcile settings and start independent acquisitions without waiting for provider I/O. */
  async refresh(): Promise<void> {
    const configs = this.host.personal.view().config.connectors
    for (const [id, item] of [...this.active, ...this.connecting]) {
      const current = configs.find(config => config.id === id)
      if (this.closed || this.host.lifetime.aborted || !current?.enabled || signature(current) !== item.signature || this.serviceFor(current) !== item.service) {
        item.abort.abort(); this.release(id)
      }
    }
    this.refreshNow()
    this.states.delete('_runtime')
  }
  private config(id: string): ConnectorConfig | undefined { return this.host.personal.view().config.connectors.find(item => item.id === id) }
  private release(id: string): void {
    const active = this.active.get(id)
    if (active) {
      this.active.delete(id); active.abort.abort()
      try { active.release() }
      catch (error) { this.states.set(id, { state: 'error', detail: `Consumer release failed: ${imErrorCode(error)}` }) }
    }
  }
  private refreshNow(): void {
    if (this.closed || this.host.lifetime.aborted) return
    const configs = this.host.personal.view().config.connectors
    for (const config of configs) if (!this.registered.has(config.id)) this.registered.set(config.id, this.host.sources.register(this.kind(config)))
    this.host.store.atomic(() => {
      const before = this.host.store.settings(), after = { ...before, sources: { ...before.sources }, policy: { ...before.policy, sources: { ...before.policy.sources } } }
      for (const [id, stored] of Object.entries(before.sources)) if (id.startsWith('im-') && 'binding' in stored.config && !configs.some(config => sourceId(config.id) === id))
        after.sources[id] = { ...stored, enabled: false }
      for (const config of configs) {
        const id = sourceId(config.id)
        after.sources[id] = { enabled: config.enabled, config: { binding: config } }
        const admission = config.intake === 'account'
          ? { dm: { unlistedAddressed: 'explicit' as const }, group: { unlistedAddressed: 'explicit' as const } }
          : before.policy.sources[id]?.admission ?? {}
        after.policy.sources[id] = { ...before.policy.sources[id], admission, allowed: config.allowedSenders.map(id => ({ id })) }
      }
      if (JSON.stringify(after) !== JSON.stringify(before)) {
        this.host.store.saveSettings(after)
        this.host.policyChanged(before, this.host.store.settings())
      }
    })
    for (const [id, release] of this.registered) if (!configs.some(config => config.id === id)) {
      this.release(id); release(); this.registered.delete(id); this.states.delete(id)
    }
    for (const config of configs) this.connect(config)
  }
  private connect(config: ConnectorConfig): Promise<void> {
    const existing = this.connecting.get(config.id)
    if (existing && !existing.abort.signal.aborted) return existing.pending!
    const service = this.serviceFor(config)
    if (!config.enabled) { this.release(config.id); this.states.set(config.id, { state: 'disabled', detail: 'Connector disabled' }); return Promise.resolve() }
    if (this.active.has(config.id)) return Promise.resolve()
    if (!service) { this.states.set(config.id, { state: 'waiting', detail: `Provider ${providerIdOf(config)} is unavailable` }); return Promise.resolve() }
    const item: Connecting = { provider: providerIdOf(config), signature: signature(config), abort: new AbortController(), service }
    this.connecting.set(config.id, item)
    this.states.set(config.id, { state: 'connecting', detail: 'Verifying account and acquiring consumer' })
    item.pending = this.acquire(config, item).finally(() => { this.acquisitions.delete(item.pending!) })
    this.acquisitions.add(item.pending)
    return item.pending
  }
  private async acquire(config: ConnectorConfig, item: Connecting): Promise<void> {
    const sig = item.signature
    const { service, abort } = item, signal = AbortSignal.any([abort.signal, this.host.lifetime])
    try {
      if (service.contractVersion !== 1 || service.inboundVersion !== 1) throw unavailable('incompatible-protocol')
      const bot = ImBotSchema.parse(await cancellable(service.describeBot(config.botId), signal))
      signal.throwIfAborted()
      if (signature(this.config(config.id)) !== sig || this.serviceFor(config) !== service) { return }
      if (bot.botId !== config.botId || bot.account.fingerprint !== config.fingerprint) throw unavailable('account-changed')
      if (!bot.connected || !bot.capabilities.includes('exclusive-text-consumer') || !bot.capabilities.includes('reply-text-checked'))
        throw unavailable('capability-unavailable')
      if (!this.providers.get(providerIdOf(config))?.definition.channels.includes(bot.channel) || config.channel && bot.channel !== config.channel) throw unavailable('channel-unavailable')
      item.channel = bot.channel
      let dispose: (() => void) | undefined
      const release = () => {
        signal.removeEventListener('abort', release)
        const current = dispose; dispose = undefined; current?.()
      }
      signal.addEventListener('abort', release, { once: true })
      const acquiring = service.consumeInbound(config.botId, { expectedFingerprint: config.fingerprint, signal,
        onEvent: async (raw, context) => {
          signal.throwIfAborted(); context.signal.throwIfAborted()
          if (signature(this.config(config.id)) !== sig || !this.config(config.id)?.enabled) throw new Error('Connector configuration changed')
          const event = ImEventSchema.parse(raw)
          if (event.botId !== config.botId || event.fingerprint !== config.fingerprint || event.channel !== bot.channel || event.provider !== undefined && event.provider !== providerIdOf(config)) throw new Error('Untrusted source account')
          const conversation = config.conversations.find(item => item.id === event.conversation.id && item.kind === event.conversation.kind)
          if (config.intake === 'restricted' && (!conversation || !config.allowedSenders.includes(event.actor.id))) return { accepted: true }
          const authorize = () => {
            signal.throwIfAborted(); context.signal.throwIfAborted()
            if (signature(this.config(config.id)) !== sig || this.serviceFor(config) !== service) throw unavailable('account-changed')
            if (service.allowsInbound && !service.allowsInbound(event)) throw unavailable('source-denied')
          }
          const intakeSignal = AbortSignal.any([signal, context.signal])
          const replyOwner: ConnectorService['replyOwner'] = service.replyOwner && ((id, route, options) =>
            cancellable(service.replyOwner!(id, route, { ...options, signal: intakeSignal }), intakeSignal))
          await this.targeting.accept(config, event, replyOwner, authorize, async reason => {
            const trigger = this.trigger(config, event)
            trigger.meta.targetReason = reason
            trigger.addressed = reason === 'explicit-mention' ? 'mention' : 'direct'
            await this.host.receive(trigger)
          })
          return { accepted: true }
        } }).then(acquired => { dispose = acquired; if (signal.aborted) release() })
      await cancellable(acquiring, signal)
      if (signal.aborted || this.closed || this.serviceFor(config) !== service || signature(this.config(config.id)) !== sig) { abort.abort(); release(); return }
      this.active.set(config.id, { provider: providerIdOf(config), signature: sig, abort, release, service, channel: bot.channel })
      this.states.set(config.id, { state: 'ready', detail: 'Exclusive checked-text intake is active' })
    } catch (error) {
      abort.abort()
      if (!this.closed && this.connecting.get(config.id) === item && this.serviceFor(config) === service && signature(this.config(config.id)) === sig)
        this.states.set(config.id, { state: 'error', detail: `Connector unavailable: ${imErrorCode(error)}` })
    } finally { if (this.connecting.get(config.id) === item) this.connecting.delete(config.id) }
  }
  private trigger(config: ConnectorConfig, event: ImEvent): Trigger {
    const source = sourceId(config.id), id = messageId(config, event.conversation.id, event.messageId)
    const root = event.reply.threadId ?? event.reply.rootId ?? event.messageId
    const thread = key('im-conversation-v1', ...(providerIdOf(config) === 'feishu' ? [] : [providerIdOf(config)]), event.channel, config.fingerprint, event.conversation.kind, event.conversation.id)
    return { id, source, actor: { source, id: event.actor.id }, human: true,
      ...(event.conversation.kind === 'dm' ? { addressed: 'direct' as const } : event.mentionedAccount ? { addressed: 'mention' as const } : {}),
      threads: [{ source, id: thread }], at: event.at, text: event.text,
      channel: { source, thread, address: { provider: providerIdOf(config), connectorId: config.id, botId: config.botId, fingerprint: config.fingerprint,
        triggerId: id, conversationKind: event.conversation.kind, route: JSON.stringify(event.reply) } },
      meta: { provider: providerIdOf(config), conversationVersion: 1, settings: event.settings, resources: event.resources, connectorId: config.id, channel: event.channel, botId: event.botId, fingerprint: event.fingerprint,
        messageId: event.messageId, eventId: event.eventId, conversationId: event.conversation.id, conversationType: event.conversation.kind,
        actorId: event.actor.id, mentionedAccount: event.mentionedAccount, root, reply: event.reply, sentAt: event.at, mentions: event.mentions,
        ...(typeof event.actor.name === 'string' ? { senderName: event.actor.name } : {}),
        ...(typeof event.conversation.title === 'string' ? { conversationTitle: event.conversation.title } : {}),
        ...(event.reply.threadId ? { threadId: event.reply.threadId } : {}) } }
  }
  private kind(config: ConnectorConfig): SourceKind<z.infer<typeof SourceConfigSchema>> {
    const id = sourceId(config.id)
    return { kind: id, defaultEnabled: config.enabled, title: { zh: `IM · ${config.id}`, en: `IM · ${config.id}` },
      description: { zh: '由个人助理设置管理的独立账号连接。', en: 'An account connection managed in Personal settings.' },
      schema: SourceConfigSchema, fields: [], health: [],
      scope: ({ meta }, { binding: current }) => {
        if (!current?.enabled || current.id !== config.id || providerIdOf(current) !== (meta.provider ?? 'feishu') || current.channel && current.channel !== meta.channel || current.botId !== meta.botId || current.fingerprint !== meta.fingerprint)
          return { listened: false, reason: 'connector_scope_denied' }
        if (current.intake === 'account' && (meta.conversationType === 'dm' || meta.conversationType === 'group'))
          return { listened: true, observed: false, row: meta.conversationType }
        const conversation = current.conversations.find(item => item.id === meta.conversationId && item.kind === meta.conversationType)
        return conversation && current.allowedSenders.includes(String(meta.actorId))
          ? { listened: true, observed: conversation.listen === 'all', row: conversation.kind }
          : { listened: false, reason: 'connector_scope_denied' }
      },
      channel: { allowed: address => {
        const current = this.config(config.id)
        return !!current && this.allowed(current, address)
      }, link: () => ({ url: '', label: { zh: '原始 IM 会话', en: 'Original IM conversation' } }), send: (_host, message) => this.send(config.id, message) },
      repliesTo: trigger => {
        const reply = ReplyRouteSchema.safeParse(trigger.meta.reply)
        return reply.success && reply.data.parentId && typeof trigger.meta.fingerprint === 'string'
          ? messageId({ ...config, fingerprint: trigger.meta.fingerprint }, reply.data.conversationId, reply.data.parentId) : undefined
      },
      threadContext: { messageId: trigger => String(trigger.meta.messageId), read: async (_commands, trigger, part, cursor) => {
        const current = this.config(config.id), service = current && this.serviceFor(current), active = this.active.get(config.id)
        if (!service?.historyChecked || !current || !active || active.service !== service || active.signature !== signature(current)
          || !trigger.channel || !this.allowed(current, trigger.channel.address)) throw new Error('Checked conversation history is unavailable')
        const route = ReplyRouteSchema.parse(trigger.meta.reply)
        if (JSON.stringify(route) !== JSON.stringify(parseRoute(trigger.channel.address.route))) throw new Error('History reply route differs from the captured channel')
        const scope = part === 'thread' && route.threadId ? 'thread' : 'nearby'
        const signal = AbortSignal.any([active.abort.signal, this.host.lifetime])
        signal.throwIfAborted()
        const raw = await service.historyChecked(current.botId, route, { scope, limit: 20, ...(cursor ? { cursor } : {}) },
          { expectedFingerprint: current.fingerprint, signal })
        signal.throwIfAborted()
        if (this.serviceFor(current) !== service || signature(this.config(config.id)) !== active.signature) throw new Error('Connector configuration changed during history read')
        const page = z.object({ events: z.array(ImEventSchema).max(20), hasMore: z.boolean(), nextCursor: z.string().min(1).max(4096).optional() }).passthrough().parse(raw)
        if (page.hasMore && !page.nextCursor) throw new Error('History pagination cursor is missing')
        for (const event of page.events) if (event.fingerprint !== current.fingerprint || event.botId !== current.botId || event.channel !== active.channel || event.provider !== undefined && event.provider !== providerIdOf(current) || event.conversation.id !== route.conversationId
          || scope === 'thread' && event.reply.threadId !== route.threadId)
          throw new Error('History contains another account, conversation or thread')
        const messages = page.events.filter(event => part === 'thread' || event.messageId === (part === 'root' ? route.rootId ?? route.messageId : route.parentId))
        return { messages: messages.map(event => ({ id: event.messageId, from: event.actor.id, at: event.at, text: event.text })),
          ...(page.hasMore && page.nextCursor ? { next: page.nextCursor } : {}), body: { coverage: 'provider-visible-human-text' } }
      } },
    }
  }
  private allowed(config: ConnectorConfig, address: Record<string, string>): boolean {
    if (!config.enabled || providerIdOf(config) !== (address.provider ?? 'feishu') || address.connectorId !== config.id || config.botId !== address.botId || config.fingerprint !== address.fingerprint) return false
    const route = parseRoute(address.route)
    if (!route || !['dm', 'group'].includes(address.conversationKind ?? '')) return false
    return config.intake === 'account' || config.conversations.some(item => item.id === route.conversationId && item.kind === address.conversationKind) && config.allowedSenders.includes(route.actorId)
  }
  private async send(id: string, message: OutboundMessage): Promise<'sent' | 'gone'> {
    const config = this.config(id), service = config && this.serviceFor(config), active = this.active.get(id)
    if (!service || !config?.enabled || !active || active.service !== service || active.signature !== signature(config)) throw new Error('Connector is unavailable')
    if (message.channel.source !== sourceId(id) || !this.allowed(config, message.channel.address)) throw new Error('Connector reply route is no longer allowed')
    const route = ReplyRouteSchema.parse(parseRoute(message.channel.address.route)), prior = this.host.store.get(deliveries(message.id))
    const routeHash = key(JSON.stringify(route)), textHash = message.blocks ? key(message.text, JSON.stringify(message.blocks)) : key(message.text)
    if (prior && (prior.connectorId !== id || prior.fingerprint !== config.fingerprint || prior.routeHash !== routeHash || prior.textHash !== textHash)) throw new Error('Delivery identity changed')
    if (prior?.state === 'sent') return 'sent'
    if (prior?.state === 'gone') return 'gone'
    if (prior?.state === 'sending' || prior?.state === 'uncertain') throw new Error('Delivery outcome is unknown; inspect the conversation and reconcile before retrying')
    if (service.deliverChecked) {
      // The native message center owns all part outcomes, including crash recovery. Do not create a second send lock.
      const response = await service.deliverChecked(config.botId, route, message,
        { expectedFingerprint: config.fingerprint, signal: AbortSignal.any([active.abort.signal, this.host.lifetime]) })
      z.object({ sent: z.literal(true) }).passthrough().parse(response)
      return 'sent'
    }
    const intent: ImDelivery = { id: message.id, connectorId: id, state: 'sending', at: new Date().toISOString(), fingerprint: config.fingerprint,
      routeHash, textHash, attempts: (prior?.attempts ?? 0) + 1, ...(prior?.resolution ? { resolution: prior.resolution } : {}) }
    this.host.store.set(deliveries(message.id), intent)
    this.sending.add(message.id)
    try {
      const options = { expectedFingerprint: config.fingerprint, signal: AbortSignal.any([active.abort.signal, this.host.lifetime]) }
      if (message.blocks?.some(block => block.type !== 'text')) throw unavailable('capability-unavailable')
      const response = await service.replyChecked(config.botId, route, message.text, { ...options, format: 'markdown' })
      z.object({ sent: z.literal(true) }).passthrough().parse(response)
      this.host.store.set(deliveries(message.id), { ...intent, state: 'sent' })
      return 'sent'
    } catch (error) {
      const code = imErrorCode(error)
      this.host.store.set(deliveries(message.id), { ...intent, state: code === 'stale-route' ? 'gone' : (IM_PRE_SEND_FAILURES.has(code) || code === 'delivery-incomplete') ? 'retryable' : 'uncertain', error: code })
      if (code === 'stale-route') return 'gone'
      throw new Error(`IM reply: ${code}`, { cause: error })
    } finally { this.sending.delete(message.id) }
  }
  async stop(): Promise<void> {
    this.closed = true
    for (const id of this.active.keys()) this.release(id)
    for (const item of this.connecting.values()) item.abort.abort()
    try { await Promise.all(this.acquisitions) }
    finally {
      for (const release of this.registered.values()) release()
      this.registered.clear(); this.providers.clear()
      for (const id of this.states.keys()) this.states.set(id, { state: 'stopped', detail: 'Connector manager stopped' })
    }
  }
}
