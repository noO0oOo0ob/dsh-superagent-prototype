/** Native Connector account, captured source and checked transport interfaces. */
import type { ContentBlock } from '../messaging/content.ts'
import type { OutboundMessage } from '../core/index.ts'
import { z } from 'zod'

const identifier = z.string().min(1).max(512)
export const ReplyRouteSchema = z.object({ messageId: identifier, conversationId: identifier, actorId: identifier,
  threadId: identifier.optional(), rootId: identifier.optional(), parentId: identifier.optional() }).strict()
export type ImReplyRoute = z.infer<typeof ReplyRouteSchema>
export const ImEventSchema = z.object({ version: z.literal(1), channel: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), botId: z.string().min(1),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/), eventId: z.string().min(1), messageId: z.string().min(1),
  actor: z.object({ kind: z.literal('user'), id: z.string().min(1) }).passthrough(),
  conversation: z.object({ kind: z.enum(['group', 'dm']), id: z.string().min(1) }).passthrough(),
  mentions: z.array(z.object({ id: z.string(), key: z.string() }).passthrough()).default([]),
  groupScope: z.object({ tenantId: identifier, groupId: identifier }).strict().optional(),
  mentionedAccount: z.boolean(), at: z.iso.datetime({ offset: true }), text: z.string().min(1).max(128_000), reply: ReplyRouteSchema,
}).passthrough().superRefine((event, ctx) => {
  if (event.groupScope && (event.conversation.kind !== 'group' || event.groupScope.groupId !== event.conversation.id))
    ctx.addIssue({ code: 'custom', message: 'Group scope must identify the captured group' })
  if (event.messageId !== event.reply.messageId || event.actor.id !== event.reply.actorId || event.conversation.id !== event.reply.conversationId)
    ctx.addIssue({ code: 'custom', message: 'The reply route must identify the original message, actor and conversation' })
})
export type ImEvent = z.infer<typeof ImEventSchema>
export const ImBotSchema = z.object({ version: z.literal(1), botId: z.string().min(1), channel: z.string(), connected: z.boolean(),
  account: z.object({ fingerprint: z.string().regex(/^[0-9a-f]{64}$/), name: z.string().optional() }), capabilities: z.array(z.string()) }).passthrough()
/** Provider-owned capabilities; hidden channels are not implied by generic transport support. */
export interface ProviderDefinition {
  id: string
  channels: readonly string[]
  onboarding: readonly ('qr' | 'credentials')[]
  inbound: readonly ContentBlock['type'][]
  outbound: readonly ContentBlock['type'][]
  history: boolean
  actions: boolean
  replyTargets: readonly ('original-message' | 'thread')[]
  sendIdempotency: 'none' | 'provider-window'
}
export const FEISHU_PROVIDER: ProviderDefinition = { id: 'feishu', channels: ['feishu', 'lark'], onboarding: ['qr', 'credentials'],
  inbound: ['text', 'image', 'file', 'audio', 'video'], outbound: ['text', 'image', 'file', 'link', 'card'], history: true, actions: true,
  replyTargets: ['original-message', 'thread'], sendIdempotency: 'provider-window' }
/** Legacy accounts belong to Feishu without changing their durable Connector or message identities. */
export function providerIdOf(account: { provider?: string }): string { return account.provider ?? 'feishu' }
export interface ConnectorService {
  /** Recheck the adapter's current account ACL after asynchronous intake work. */
  allowsInbound?(event: ImEvent): boolean
  /** Verify the parent sender with this account's platform credentials, without cross-account ID guesses. */
  replyOwner?(botId: string, route: ImReplyRoute, options: { expectedFingerprint: string; signal?: AbortSignal }): Promise<'self' | 'other' | 'user' | 'unknown'>
  /** Owner-only management operations; never registered as model tools. */
  manage?(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>
  prepareDialogue?(botId: string, conversationKey: string, expectedFingerprint: string): Promise<string>

  readResource?(botId: string, route: ImReplyRoute, key: string, options: { expectedFingerprint: string; signal: AbortSignal; maxBytes: number }): Promise<Buffer>
  contractVersion: number
  inboundVersion: number
  listBots(): Promise<{ botId: string; channel: string }[]>
  describeBot(botId: string): Promise<unknown>
  consumeInbound(botId: string, options: { expectedFingerprint: string; signal: AbortSignal;
    onEvent(event: unknown, context: { signal: AbortSignal }): Promise<{ accepted: true }> }): Promise<() => void>
  deliverChecked?(botId: string, route: ImReplyRoute, message: OutboundMessage, options: { expectedFingerprint: string; signal: AbortSignal }): Promise<{ sent: true }>
  replyChecked(botId: string, route: ImReplyRoute, text: string, options: { expectedFingerprint: string; signal: AbortSignal; format?: 'markdown' }): Promise<unknown>
  historyChecked?(botId: string, route: ImReplyRoute, query: { scope: 'group' | 'nearby' | 'thread'; limit: number; cursor?: string },
    options: { expectedFingerprint: string; signal: AbortSignal }): Promise<unknown>
}

/** Only documented failures that guarantee no external reply was attempted may be retried automatically. */
export const IM_PRE_SEND_FAILURES = new Set(['account-unverified', 'account-changed', 'capability-unavailable', 'bot-not-connected',
  'consumer-unavailable', 'stale-route', 'unknown-bot', 'bad-request'])
export function imErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(error.code)
    ? error.code : 'reply-result-unknown'
}
