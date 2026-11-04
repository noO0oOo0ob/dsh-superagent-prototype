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
/** Small logged model projection; full source metadata is available only through the context resource. */
export function messageContext(trigger: Trigger) {
  return { ...contextRef(trigger.id), source: trigger.source, actor: trigger.actor,
    threads: trigger.threads, read: `context/${contextRef(trigger.id).id}` }
}
