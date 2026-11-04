/** Immutable source context and durable references for tasks, attempts, sessions, reports and deliveries. */
import { contextRef, ticketContexts, type ContextRef } from '../core/context.ts'
import type { OutboundMessage, Ticket, Trigger } from '../core/index.ts'
import { family } from '../kv.ts'
import type { Store } from './store.ts'

export interface SourceContextRecord {
  version: 1
  ref: ContextRef
  source: string
  actor: Trigger['actor']
  threads: Trigger['threads']
  at: string
  replyTarget?: Trigger['channel']
  /** References the original Trigger's metadata instead of copying sender-controlled fields. */
  metadataResource: string
}
export type ContextEntity = 'ticket' | 'assignment' | 'session' | 'report' | 'delivery'
const records = family<SourceContextRecord>('personal-context:')
const relations = family<ContextRef[], [ContextEntity, string]>('personal-context-links:', (kind, id) => `${kind}:${id}`)
const parents = family<{ version: 1; child: ContextRef; parent: ContextRef }>('personal-context-parent:')

/** Owns immutable context records; links accumulate while every source event retains its own identity. */
export class Contexts {
  constructor(private readonly store: Pick<Store, 'get' | 'set' | 'atomic' | 'triggers'>) {}
  /** Persist once, in the same transaction as the original Trigger. */
  capture(trigger: Trigger): SourceContextRecord {
    const ref = contextRef(trigger.id), existing = this.get(ref.id)
    if (existing) return existing
    const record: SourceContextRecord = { version: 1, ref, source: trigger.source, actor: trigger.actor,
      threads: trigger.threads, at: trigger.at, ...(trigger.channel ? { replyTarget: trigger.channel } : {}),
      metadataResource: `trigger/${trigger.id}` }
    this.store.set(records(ref.id), record)
    return record
  }
  get(id: string): SourceContextRecord | undefined { return this.store.get(records(id)) }
  refs(kind: ContextEntity, id: string): ContextRef[] { return this.store.get(relations(kind, id)) ?? [] }
  /** Register an application-verified derivation before intake; source metadata never creates this relation. */
  parent(child: Trigger, original: Trigger): void {
    this.store.atomic(() => {
      const ref = contextRef(child.id), parent = contextRef(original.id), existing = this.store.get(parents(ref.id))
      if (existing) {
        if (existing.parent.id !== parent.id) throw new Error('A source context cannot replace its original parent')
        return
      }
      if (!this.store.triggers.get(original.id)) throw new Error('The original source context is missing')
      if (this.store.triggers.get(child.id)) throw new Error('Register the verified parent before the derived Trigger is stored')
      if (this.references([parent]).some(item => item.id === ref.id)) throw new Error('A source context cannot derive from itself')
      this.capture(original); this.capture(child)
      this.store.set(parents(ref.id), { version: 1, child: ref, parent })
    })
  }
  /** Expand only persisted, application-verified parents while keeping each event's original reference. */
  references(refs: readonly ContextRef[]): ContextRef[] {
    const expanded: ContextRef[] = [], seen = new Set<string>()
    for (const initial of refs) {
      let current: ContextRef | undefined = initial
      while (current && !seen.has(current.id)) {
        seen.add(current.id); expanded.push(current)
        current = this.store.get(parents(current.id))?.parent
      }
    }
    return expanded
  }
  /** Add references without allowing a follow-up to replace an earlier origin. */
  link(kind: ContextEntity, id: string, refs: readonly ContextRef[]): void {
    const current = this.refs(kind, id), seen = new Set(current.map(ref => ref.id))
    const added = this.references(refs).filter(ref => !seen.has(ref.id) && !!seen.add(ref.id))
    if (added.length) this.store.set(relations(kind, id), [...current, ...added])
  }
  /** Record task and attempt relations when an aggregate is persisted. */
  ticket(ticket: Ticket, restoring = false): void {
    const refs = this.references(ticketContexts(ticket))
    for (const ref of refs) { const trigger = this.store.triggers.get(ref.triggerId); if (trigger) this.capture(trigger) }
    this.link('ticket', ticket.id, refs)
    this.link('session', `spa-worker-${ticket.id}`, refs)
    for (const assignment of ticket.assignments) {
      const inputs = ticket.inputs.flatMap(input => input.kind === 'trigger' && input.deliveredTo === assignment.id ? [contextRef(input.triggerId)] : [])
      const assigned = [...new Set([ticket.origin.triggerId, ...ticket.origin.triggerIds])].map(contextRef).concat(inputs)
      this.link('assignment', assignment.id, assigned)
      if (assignment.report) {
        const id = `${assignment.id}:${assignment.report.at}`
        const at = assignment.report.at
        const reported = restoring ? [...new Set([ticket.origin.triggerId, ...ticket.origin.triggerIds])].map(contextRef).concat(
          ticket.inputs.flatMap(input => input.kind === 'trigger' && input.deliveredTo === assignment.id
            && typeof (input.readAt ?? input.deliveredAt) === 'string' && (input.readAt ?? input.deliveredAt)! <= at
            ? [contextRef(input.triggerId)] : [])) : assigned
        if (this.store.get(relations('report', id)) === undefined) this.link('report', id, reported)
      }
    }
  }
  /** Link a receipt to its task and original source event, when either is available. */
  delivery(message: OutboundMessage): void {
    const triggerId = message.channel.address.triggerId
    this.link('delivery', message.id, [...message.ticketId ? this.refs('ticket', message.ticketId) : [],
      ...triggerId ? [contextRef(triggerId)] : []])
  }
}
