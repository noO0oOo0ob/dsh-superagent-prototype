/** Durable account-specific message targeting; a group default never replaces an explicit target. */
import { z } from 'zod'
import { key } from '../core/index.ts'
import { family, record } from '../kv.ts'
import { providerIdOf, type ConnectorService, type ImEvent } from '../connectors/protocol.ts'
import type { ConnectorConfig } from '../personal/config.ts'
import type { Store } from '../app/store.ts'

const AccountSchema = z.object({ connectorId: z.string(), botId: z.string(), fingerprint: z.string() }).strict()
const GroupSchema = z.object({ version: z.literal(1), id: z.string(), provider: z.string(), channel: z.string(), tenantId: z.string(), groupId: z.string(),
  revision: z.number().int().nonnegative(), accounts: z.array(AccountSchema), defaultAccount: AccountSchema.nullable() }).strict()
const DecisionSchema = z.object({ version: z.literal(1), id: z.string(), connectorId: z.string(), provider: z.string(), botId: z.string(), fingerprint: z.string(), messageId: z.string(), conversationId: z.string(),
  accepted: z.boolean(), reason: z.enum(['direct-message', 'explicit-mention', 'other-or-unverified-mention', 'verified-reply', 'reply-to-other-bot', 'reply-unverified', 'group-default', 'no-group-default']), completed: z.boolean(), sequence: z.number().int().nonnegative(), at: z.string() }).strict()
export type GroupPolicy = z.infer<typeof GroupSchema>
export type TargetDecision = z.infer<typeof DecisionSchema>
const groups = family<GroupPolicy>('personal-group-policy:')
const MessagePolicySchema = z.object({ version: z.literal(1), defaultAccount: AccountSchema.nullable() }).strict()
const messagePolicies = family<z.infer<typeof MessagePolicySchema>>('personal-group-message-policy:')
export interface GroupPolicyView extends Omit<GroupPolicy, 'accounts'> { accounts: (GroupPolicy['accounts'][number] & { available: boolean })[]; defaultAvailable: boolean }
const decisions = family<TargetDecision>('personal-group-target:')
const counter = record<number>('personal-group-target-sequence')
/** The panel must reload before changing a group that was updated elsewhere. */
export class GroupConflict extends Error {}
type ReplyOwner = NonNullable<ConnectorService['replyOwner']>
const reference = (config: ConnectorConfig) => ({ connectorId: config.id, botId: config.botId, fingerprint: config.fingerprint })
const same = (left: z.infer<typeof AccountSchema>, right: z.infer<typeof AccountSchema>) => JSON.stringify(left) === JSON.stringify(right)

/** Records targeting before acknowledging ingress and retries only the already selected account. */
export class GroupTargets {
  private readonly active = new Map<string, Promise<void>>()
  constructor(private readonly store: Pick<Store, 'get' | 'set' | 'keys' | 'atomic'>, private readonly configs: () => ConnectorConfig[]) {}
  groups(): GroupPolicy[] { return this.store.keys(groups).map(id => GroupSchema.parse(this.store.get(id))) }
  /** Availability comes from current bindings, never the historical observation list. */
  view(): GroupPolicyView[] {
    const configs = this.configs()
    return this.groups().map(group => {
      const available = (account: GroupPolicy['accounts'][number]) => configs.some(config => config.enabled && providerIdOf(config) === group.provider
        && (config.channel === undefined || config.channel === group.channel) && same(account, reference(config)))
      return { ...group, accounts: group.accounts.map(account => ({ ...account, available: available(account) })), defaultAvailable: !!group.defaultAccount && available(group.defaultAccount) }
    })
  }
  decisions(limit = 100): TargetDecision[] {
    return this.store.keys(decisions).map(id => DecisionSchema.parse(this.store.get(id))).sort((a, b) => b.sequence - a.sequence).slice(0, limit)
  }
  /** Only an account observed by this provider in this tenant and group can become its default. */
  setDefault(id: string, revision: number, connectorId: string | null): GroupPolicy {
    return this.store.atomic(() => {
      const group = GroupSchema.parse(this.store.get(groups(id)))
      if (group.revision !== revision) throw new GroupConflict('Group settings changed; reload before saving')
      const account = connectorId === null ? null : group.accounts.find(account => account.connectorId === connectorId)
      const config = account && this.configs().find(config => config.id === connectorId)
      if (connectorId !== null && (!account || !config?.enabled || providerIdOf(config) !== group.provider || !same(account, reference(config))))
        throw new Error('This enabled account was not observed in the group with its current fingerprint')
      const next = { ...group, revision: revision + 1, defaultAccount: account ?? null }
      this.store.set(groups(id), next); return next
    })
  }
  private observe(config: ConnectorConfig, event: ImEvent): GroupPolicy | undefined {
    if (event.conversation.kind !== 'group' || !event.groupScope) return undefined
    const provider = providerIdOf(config), { tenantId, groupId } = event.groupScope
    const id = key('provider-group-v1', provider, event.channel, tenantId, groupId)
    const previous = this.store.get(groups(id)), account = reference(config)
    if (previous) {
      const group = GroupSchema.parse(previous)
      if (group.accounts.some(item => same(item, account))) return group
      const next = { ...group, revision: group.revision + 1, accounts: [...group.accounts.filter(item => item.connectorId !== config.id), account] }
      this.store.set(groups(id), next); return next
    }
    const group: GroupPolicy = { version: 1, id, provider, channel: event.channel, tenantId, groupId, revision: 0, accounts: [account], defaultAccount: null }
    this.store.set(groups(id), group); return group
  }
  /** Authorization is checked again after asynchronous ownership verification and before every retry. */
  accept(config: ConnectorConfig, event: ImEvent, replyOwner: ReplyOwner | undefined, authorize: () => void, receive: (reason: string) => Promise<void>): Promise<void> {
    const id = key('im-target-v1', providerIdOf(config), config.id, config.fingerprint, event.conversation.id, event.messageId)
    const current = this.active.get(id)
    if (current) return current
    const pending = this.run(id, config, event, replyOwner, authorize, receive).finally(() => this.active.delete(id))
    this.active.set(id, pending); return pending
  }
  private async run(id: string, config: ConnectorConfig, event: ImEvent, replyOwner: ReplyOwner | undefined, authorize: () => void, receive: (reason: string) => Promise<void>): Promise<void> {
    authorize()
    let decision = this.store.get(decisions(id))
    if (decision) decision = DecisionSchema.parse(decision)
    if (!decision) {
      const group = this.observe(config, event)
      const defaultAccount = group && this.store.atomic(() => {
        const entry = messagePolicies(key(group.id, event.messageId)), previous = this.store.get(entry)
        if (previous) return MessagePolicySchema.parse(previous).defaultAccount
        this.store.set(entry, { version: 1, defaultAccount: group.defaultAccount }); return group.defaultAccount
      })
      const selected = await this.select(config, event, defaultAccount ?? null, replyOwner)
      authorize()
      decision = this.store.atomic(() => {
        const sequence = (this.store.get(counter) ?? 0) + 1
        const value: TargetDecision = { version: 1, id, connectorId: config.id, provider: providerIdOf(config), botId: config.botId, fingerprint: config.fingerprint, messageId: event.messageId, conversationId: event.conversation.id,
          ...selected, completed: !selected.accepted, sequence, at: new Date().toISOString() }
        this.store.set(counter, sequence); this.store.set(decisions(id), value); return value
      })
    }
    if (decision.completed) return
    authorize()
    await receive(decision.reason)
    this.store.set(decisions(id), { ...decision, completed: true })
  }
  private async select(config: ConnectorConfig, event: ImEvent, defaultAccount: GroupPolicy['defaultAccount'], replyOwner: ReplyOwner | undefined): Promise<Pick<TargetDecision, 'accepted' | 'reason'>> {
    if (event.conversation.kind === 'dm') return { accepted: true, reason: 'direct-message' }
    if (event.mentionedAccount) return { accepted: true, reason: 'explicit-mention' }
    // Unknown mention IDs may refer to another bot. Do not guess across application-scoped IDs.
    if (event.mentions.length) return { accepted: false, reason: 'other-or-unverified-mention' }
    if (event.reply.parentId) {
      let owner: Awaited<ReturnType<ReplyOwner>> = 'unknown'
      try { owner = await replyOwner?.(config.botId, event.reply, { expectedFingerprint: config.fingerprint }) ?? 'unknown' }
      catch (error) { /* Ownership is unverified; never redirect to a group default after a provider failure. */ }
      if (owner === 'self') return { accepted: true, reason: 'verified-reply' }
      if (owner !== 'user') return { accepted: false, reason: owner === 'other' ? 'reply-to-other-bot' : 'reply-unverified' }
    }
    return { accepted: !!defaultAccount && same(defaultAccount, reference(config)), reason: defaultAccount ? 'group-default' : 'no-group-default' }
  }
}
