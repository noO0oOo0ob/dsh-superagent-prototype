/** Stable references carried with messages; trace IDs identify processing, never identity or authorization. */
import { key } from './ids.ts'
import type { Ticket, Trigger } from './model.ts'

/** Reference to an immutable context record, readable through `context/<id>`. */
export interface ContextRef { id: string; traceId: string; triggerId: string }
/** Returns the same application-owned context reference for every delivery of a Trigger. */
export function contextRef(triggerId: string): ContextRef {
  return { id: key('context-v1', triggerId), traceId: key('trace-v1', triggerId), triggerId }
}
/** Preserves the origin first and then each distinct follow-up, without overwriting earlier metadata. */
export function ticketContexts(ticket: Ticket): ContextRef[] {
  return [...new Set([ticket.origin.triggerId, ...ticket.origin.triggerIds,
    ...ticket.inputs.flatMap(input => input.kind === 'trigger' ? [input.triggerId] : [])])].map(contextRef)
}
const SOURCE_FIELDS = ['channel', 'botId', 'senderName', 'conversationTitle', 'conversationId', 'conversationType', 'threadId', 'messageId', 'sentAt'] as const
/** Logged source references and explicitly provided scalar display fields; complete metadata stays in the context resource. */
export function messageContext(trigger: Trigger) {
  const fields: Partial<Record<typeof SOURCE_FIELDS[number], string>> = {}
  for (const field of SOURCE_FIELDS) {
    const value = trigger.meta[field]
    if (typeof value === 'string' && value.length) fields[field] = value
  }
  return { ...contextRef(trigger.id), source: trigger.source, actor: trigger.actor,
    threads: trigger.threads, ...fields, read: `context/${contextRef(trigger.id).id}` }
}
