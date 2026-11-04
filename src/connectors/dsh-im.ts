/** Public same-Host dsh-im v1 protocol, verified against @xmanrui/dsh-im 5.10.0. */
import { z } from 'zod'

const identifier = z.string().min(1).max(512)
export const ReplyRouteSchema = z.object({ messageId: identifier, conversationId: identifier, actorId: identifier,
  threadId: identifier.optional(), rootId: identifier.optional(), parentId: identifier.optional() }).strict()
export type ImReplyRoute = z.infer<typeof ReplyRouteSchema>
export const ImEventSchema = z.object({ version: z.literal(1), channel: z.enum(['feishu', 'lark']), botId: z.string().min(1),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/), eventId: z.string().min(1), messageId: z.string().min(1),
  actor: z.object({ kind: z.literal('user'), id: z.string().min(1) }).passthrough(),
  conversation: z.object({ kind: z.enum(['group', 'dm']), id: z.string().min(1) }).passthrough(),
  mentions: z.array(z.object({ id: z.string(), key: z.string() }).passthrough()).default([]),
  mentionedAccount: z.boolean(), at: z.iso.datetime({ offset: true }), text: z.string().min(1).max(128_000), reply: ReplyRouteSchema,
}).passthrough().superRefine((event, ctx) => {
  if (event.messageId !== event.reply.messageId || event.actor.id !== event.reply.actorId || event.conversation.id !== event.reply.conversationId)
    ctx.addIssue({ code: 'custom', message: 'The reply route must identify the original message, actor and conversation' })
})
export type ImEvent = z.infer<typeof ImEventSchema>
export const ImBotSchema = z.object({ version: z.literal(1), botId: z.string().min(1), channel: z.string(), connected: z.boolean(),
  account: z.object({ fingerprint: z.string().regex(/^[0-9a-f]{64}$/), name: z.string().optional() }), capabilities: z.array(z.string()) }).passthrough()
export interface DshImService {
  contractVersion: number
  inboundVersion: number
  listBots(): Promise<{ botId: string; channel: string }[]>
  describeBot(botId: string): Promise<unknown>
  consumeInbound(botId: string, options: { expectedFingerprint: string; signal: AbortSignal;
    onEvent(event: unknown, context: { signal: AbortSignal }): Promise<{ accepted: true }> }): Promise<() => void>
  replyChecked(botId: string, route: ImReplyRoute, text: string, options: { expectedFingerprint: string; signal: AbortSignal; format?: 'markdown' }): Promise<unknown>
  historyChecked?(botId: string, route: ImReplyRoute, query: { scope: 'group' | 'nearby' | 'thread'; limit: number; cursor?: string },
    options: { expectedFingerprint: string; signal: AbortSignal }): Promise<unknown>
}
declare module '@deepseek-ai/cordis' { interface Context { dshIm: DshImService } }

/** Only documented failures that guarantee no external reply was attempted may be retried automatically. */
export const IM_PRE_SEND_FAILURES = new Set(['account-unverified', 'account-changed', 'capability-unavailable', 'bot-not-connected',
  'consumer-unavailable', 'stale-route', 'unknown-bot', 'bad-request'])
export function imErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(error.code)
    ? error.code : 'reply-result-unknown'
}
