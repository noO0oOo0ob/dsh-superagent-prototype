/** Explicit account bindings and auditable cross-conversation task routing. */
import { z } from 'zod'
import { family } from '../kv.ts'
import { key, threadKey, type ThreadRef, type Ticket, type Trigger } from '../core/index.ts'
import type { Store } from '../app/store.ts'

const actor = z.object({ source: z.string().min(1), id: z.string().min(1) }).strict()
const scope = z.object({ source: z.string().min(1), conversation: z.string().min(1), account: z.string().min(1).optional() }).strict()
export const RoutingConfigSchema = z.object({
  identities: z.array(z.object({ principalId: z.string().min(1), actor }).strict()).default([]),
  grants: z.array(z.object({ from: scope, to: scope, principalId: z.string().min(1) }).strict()).default([]),
}).strict().superRefine((config, ctx) => {
  const ids = config.identities.map(item => JSON.stringify(item.actor))
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'An account may bind to only one principal' })
  for (const grant of config.grants) if (!config.identities.some(item => item.principalId === grant.principalId))
    ctx.addIssue({ code: 'custom', message: 'A routing grant needs an explicitly bound principal' })
})
export type RoutingConfig = z.infer<typeof RoutingConfigSchema>
export interface RouteDecision {
  id: string; at: string; triggerId: string; ticketId: string; allowed: boolean; reason: string; revision: number
  from: { source: string; conversation: string; account?: string }; to: { source: string; conversation: string; account?: string }; principalId?: string
}
const records = family<RouteDecision>('personal-route:')
const managed = (source: string) => source === 'main' || source === 'inbox' || source === 'schedule' || source === 'feishu-doc' || source.startsWith('im-')
const originScope = (trigger: Trigger) => ({ source: trigger.source,
  conversation: typeof trigger.meta.conversationId === 'string' ? trigger.meta.conversationId : trigger.channel?.thread ?? trigger.threads[0]?.id ?? trigger.id,
  ...(typeof trigger.meta.fingerprint === 'string' ? { account: trigger.meta.fingerprint } : {}) })
const equal = (a: ReturnType<typeof originScope>, b: ReturnType<typeof originScope>) => a.source === b.source && a.conversation === b.conversation && a.account === b.account

/** A deterministic routing refusal; retrying without changing the grant does not authorize the attachment. */
export class RoutingDenied extends Error {}

/** Identity bindings never grant intake permission; grants authorize only a particular task attachment. */
export class Routing {
  constructor(private readonly store: Store, private readonly config: () => { revision: number; routing: RoutingConfig }, private readonly bound?: (ticket: Ticket, trigger: Trigger) => boolean) {}
  list(): RouteDecision[] { return this.store.keys(records).flatMap(name => this.store.get(name) ?? []).sort((a, b) => b.at.localeCompare(a.at)) }
  /** Called before the attachment transaction so rejected decisions remain auditable. */
  follow(ticket: Ticket, thread: ThreadRef): void {
    const origin = this.store.triggers.get(ticket.origin.triggerId)
    if (!origin) throw new Error('Task origin is missing')
    if (!managed(thread.source) && !managed(origin.source)) return
    const target = this.store.read.threadPage(threadKey(thread), 0, 1)[0]
    if (!target) throw new Error('Cannot authorize an unknown personal conversation')
    this.attach(ticket, target, false)
  }
  attach(ticket: Ticket, trigger: Trigger, mainContinuation = true): void {
    const judged = this.decision(ticket, trigger, mainContinuation ? 'attach' : 'follow')
    const decision: RouteDecision = { ...judged, id: key(ticket.id, trigger.id, String(judged.revision)),
      at: new Date().toISOString(), ticketId: ticket.id, triggerId: trigger.id }
    this.store.set(records(decision.id), decision)
    if (!decision.allowed) throw new RoutingDenied('This request belongs to another source or conversation. Create a separate task or configure an explicit identity routing grant.')
  }
  /** Check current grants for automatic intake or a worker read without appending another audit entry. */
  permits(ticket: Ticket, trigger: Trigger): boolean {
    if (!this.store.triggers.get(ticket.origin.triggerId)) return false
    return this.decision(ticket, trigger, 'read').allowed
  }
  private decision(ticket: Ticket, trigger: Trigger, mode: 'attach' | 'follow' | 'read'): Omit<RouteDecision, 'id' | 'at' | 'ticketId' | 'triggerId'> {
    const origin = this.store.triggers.get(ticket.origin.triggerId)
    if (!origin) throw new Error('Task origin is missing')
    const { revision, routing } = this.config(), from = originScope(trigger), to = originScope(origin)
    const principal = (value: Trigger) => routing.identities.find(item => item.actor.source === value.actor.source && item.actor.id === value.actor.id)?.principalId
    const principalId = principal(trigger)
    let reason = 'cross_scope_denied', allowed = false
    const original = ticket.origin.triggerId === trigger.id || ticket.origin.triggerIds.includes(trigger.id)
    const localOwner = trigger.source === 'main' && trigger.actor.source === 'main' && trigger.actor.id === 'owner' && trigger.human
    const continuation = mode === 'read' && localOwner && ticket.inputs.some(input => input.kind === 'trigger' && input.triggerId === trigger.id && !input.context)
    if (this.bound?.(ticket, trigger)) { allowed = true; reason = 'published_document_binding' }
    else if (original) { allowed = true; reason = 'original_task_input' }
    else if (mode === 'attach' && localOwner) { allowed = true; reason = 'explicit_main_continuation' }
    else if (continuation) { allowed = true; reason = 'attached_main_continuation' }
    else if (equal(from, to)) { allowed = true; reason = 'same_conversation' }
    else if (!managed(trigger.source) && !managed(origin.source)) { allowed = true; reason = 'legacy_source_routing' }
    else if (principalId && principalId === principal(origin) && routing.grants.some(grant => grant.principalId === principalId && equal(grant.from, from) && equal(grant.to, to))) {
      allowed = true; reason = 'explicit_identity_grant'
    }
    return { from, to, allowed, reason, revision, ...(principalId ? { principalId } : {}) }
  }
}
