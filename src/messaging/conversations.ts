/** Stable IM conversations with independently versioned dialogue context and task references. */
import { z } from 'zod'
import { key, threadKey, type Ticket, type Trigger } from '../core/index.ts'
import { contextRef } from '../core/context.ts'
import { family } from '../kv.ts'
import type { Store } from '../app/store.ts'
import type { MessageDelivery } from './delivery.ts'

const ConversationSchema = z.object({ version: z.literal(1), id: z.string(), source: z.string(), thread: z.string(),
  fingerprint: z.string(), conversationId: z.string(), kind: z.enum(['dm', 'group']), generation: z.number().int().nonnegative(),
  sessionId: z.string(), workspace: z.string().optional(), createdAt: z.string(), updatedAt: z.string(), focus: z.string().optional() }).strict()
export type Conversation = z.infer<typeof ConversationSchema>
const conversations = family<Conversation>('personal-conversation:')
const sessions = family<{ conversationId: string; generation: number }>('personal-dialogue-session:')
const messages = family<string>('personal-conversation-message:')
const resets = family<{ before: string; after: string }>('personal-conversation-reset:')
const sessionId = (id: string, generation: number) => `spa-dialogue-${id}-${generation}`
const nativeId = (trigger: Trigger, messageId: string) => key(trigger.source, String(trigger.meta.fingerprint), String(trigger.meta.conversationId), messageId)

/** Threads retain all messages; a new context never rewrites source IDs, receipts or task ownership. */
export class Conversations {
  constructor(private readonly store: Store, private readonly deliveries: MessageDelivery) {}
  sessionIds(): string[] { return this.store.keys(sessions).map(name => name.slice(sessions.prefix.length)) }
  get(id: string): Conversation | undefined { const value = this.store.get(conversations(id)); return value ? ConversationSchema.parse(value) : undefined }
  forTrigger(trigger: Trigger): Conversation | undefined {
    return typeof trigger.meta.conversationKey === 'string' ? this.get(trigger.meta.conversationKey) : undefined
  }
  forSession(id: string): Conversation | undefined {
    const ref = this.store.get(sessions(id)), current = ref && this.get(ref.conversationId)
    return current?.generation === ref?.generation ? current : undefined
  }
  isDialogue(id: string): boolean { return !!this.store.get(sessions(id)) }
  /** Capture the current generation once, before the source event is persisted. */
  prepare(trigger: Trigger): Trigger {
    const existing = this.store.triggers.get(trigger.id)
    if (existing) return existing
    if (trigger.meta.conversationVersion !== 1) return trigger
    const first = trigger.threads[0]!, id = key('conversation-v1', trigger.source, first.id)
    return this.store.atomic(() => {
      let record = this.get(id)
      if (!record) {
        record = ConversationSchema.parse({ version: 1, id, source: trigger.source, thread: first.id,
          fingerprint: trigger.meta.fingerprint, conversationId: trigger.meta.conversationId, kind: trigger.meta.conversationType,
          generation: 0, sessionId: sessionId(id, 0), createdAt: trigger.at, updatedAt: trigger.at })
        this.save(record)
      }
      const captured: Trigger = { ...trigger, meta: { ...trigger.meta, conversationKey: id, dialogueGeneration: record.generation, dialogueSessionId: record.sessionId } }
      const target = this.replyTarget(captured)
      if (target) captured.meta.targetTicketId = target
      if (!trigger.meta.virtual) this.store.set(messages(nativeId(trigger, String(trigger.meta.messageId))), trigger.id)
      return captured
    })
  }
  private save(record: Conversation): void {
    this.store.set(conversations(record.id), record)
    this.store.set(sessions(record.sessionId), { conversationId: record.id, generation: record.generation })
  }
  /** Application-generated reply correlations select at most one task. Topics alone never select a Worker. */
  private replyTarget(trigger: Trigger): string | undefined {
    const reply = z.object({ parentId: z.string().optional() }).passthrough().safeParse(trigger.meta.reply)
    if (!reply.success || !reply.data.parentId) return undefined
    const parent = this.store.get(messages(nativeId(trigger, reply.data.parentId)))
    const parentTrigger = parent && this.store.triggers.get(parent)
    if (parentTrigger && parentTrigger.meta.dialogueGeneration !== trigger.meta.dialogueGeneration) return undefined
    const candidates = new Set<string>()
    if (parent) for (const ticket of this.tasks(trigger)) if (ticket.origin.triggerIds.includes(parent) || ticket.origin.triggerId === parent
      || ticket.inputs.some(input => input.kind === 'trigger' && input.triggerId === parent)) candidates.add(ticket.id)
    for (const receipt of this.deliveries.list()) if (receipt.source === trigger.source && receipt.thread === trigger.channel?.thread && receipt.ticketId
      && receipt.parts.some(part => part.providerMessageIds.includes(reply.data.parentId!))) {
      const ticket = this.store.tickets.get(receipt.ticketId), origin = ticket && this.store.triggers.get(ticket.origin.triggerId)
      if (origin?.meta.dialogueGeneration === trigger.meta.dialogueGeneration && this.belongs(ticket!, trigger)) candidates.add(receipt.ticketId)
    }
    return candidates.size === 1 ? [...candidates][0] : undefined
  }
  /** Ordinary native IM messages go through Main, never subscription broadcast. */
  permitsInput(ticket: Ticket, trigger: Trigger): boolean {
    return trigger.meta.conversationVersion !== 1 || this.forTrigger(trigger)?.generation === trigger.meta.dialogueGeneration && !trigger.meta.command && trigger.meta.targetTicketId === ticket.id && this.belongs(ticket, trigger) && ticket.mandate.actor.id === trigger.actor.id
  }
  bindWorkspace(session: string, workspace: string): string {
    const current = this.forSession(session)
    if (!current) throw new Error('Conversation was reset while preparing its workspace')
    if (current.workspace) return current.workspace
    this.save({ ...current, workspace })
    return workspace
  }
  /** Mutations consume a current source request, never historical authorization from another member. */
  authorizeMutation(ticket: Ticket, trigger: Trigger): void {
    const current = this.forTrigger(trigger)
    if (trigger.meta.conversationVersion !== 1) return
    if (!current || current.generation !== trigger.meta.dialogueGeneration || this.store.triggers.disposition(trigger.id)?.decisionId
      || !this.belongs(ticket, trigger) || ticket.mandate.actor.id !== trigger.actor.id)
      throw new Error('Task mutation requires a current request from its owner in the original conversation')
  }
  belongs(ticket: Ticket, trigger: Trigger): boolean {
    const origin = this.store.triggers.get(ticket.origin.triggerId)
    return !!origin && origin.source === trigger.source && origin.meta.fingerprint === trigger.meta.fingerprint
      && origin.meta.conversationId === trigger.meta.conversationId && origin.meta.conversationType === trigger.meta.conversationType
  }
  tasks(trigger: Trigger): Ticket[] { return this.store.tickets.list().filter(ticket => this.belongs(ticket, trigger)) }
  /** Repeated delivery of the same reset command does not reset a later conversation. */
  reset(trigger: Trigger): { before: string; after: string } {
    return this.store.atomic(() => {
      const prior = this.store.get(resets(trigger.id))
      if (prior) return prior
      const current = this.forTrigger(trigger)
      if (!current) throw new Error('Conversation is unavailable')
      const generation = current.generation + 1
      const { focus: _focus, workspace: _workspace, ...base } = current
      const next = { ...base, generation, sessionId: sessionId(current.id, generation), updatedAt: new Date().toISOString() }
      this.save(next)
      const result = { before: current.sessionId, after: next.sessionId }
      this.store.set(resets(trigger.id), result)
      return result
    })
  }
  focus(ticket: Ticket, trigger: Trigger): void {
    const record = this.forTrigger(trigger)
    if (!record || record.generation !== trigger.meta.dialogueGeneration || !this.belongs(ticket, trigger)) return
    this.save({ ...record, focus: ticket.id, updatedAt: new Date().toISOString() })
  }
  /** Refuse stale generations and references from another account or conversation before tools run. */
  authorize(id: string, triggerId: string): Trigger {
    const record = this.forSession(id), trigger = this.store.triggers.get(triggerId)
    if (!record || !trigger || trigger.meta.conversationKey !== record.id || trigger.meta.dialogueGeneration !== record.generation)
      throw new Error('The conversation changed; this input is no longer current')
    return trigger
  }
  history(id: string): Trigger[] {
    const record = this.forSession(id)
    return record ? this.store.read.threadPage(threadKey({ source: record.source, id: record.thread }), 0, 100)
      .filter(trigger => trigger.meta.dialogueGeneration === record.generation && !trigger.meta.command).reverse() : []
  }
  link(trigger: Trigger): void {
    const record = this.forTrigger(trigger)
    if (record && record.generation === trigger.meta.dialogueGeneration) this.store.contexts.link('session', record.sessionId, [contextRef(trigger.id)])
  }
}
