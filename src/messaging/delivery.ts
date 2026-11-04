/** Durable per-destination, per-part delivery with explicit uncertain outcomes. */
import { z } from 'zod'
import { key, type OutboundMessage } from '../core/index.ts'
import { family } from '../kv.ts'
import type { Store } from '../app/store.ts'
import { ContentBlockSchema, type ContentBlock } from './content.ts'

const PartSchema = z.object({ id: z.string(), block: ContentBlockSchema, state: z.enum(['pending', 'sending', 'sent', 'failed', 'unknown', 'unsupported']),
  attempts: z.number().int().nonnegative(), providerMessageIds: z.array(z.string()), resourceKey: z.string().optional(), error: z.string().optional() }).strict()
const DeliverySchema = z.object({ version: z.literal(1), id: z.string(), signature: z.string(), source: z.string(), thread: z.string(),
  ticketId: z.string().optional(), resultId: z.string().optional(), at: z.string(), updatedAt: z.string(), parts: z.array(PartSchema),
  resolutions: z.array(z.object({ partId: z.string(), action: z.enum(['confirm_sent', 'retry']), note: z.string(), at: z.string() })) }).strict()
export type PartReceipt = z.infer<typeof PartSchema>
export type DeliveryRecord = z.infer<typeof DeliverySchema>
const records = family<DeliveryRecord>('personal-message-delivery:')
export interface DeliveryAdapter {
  readonly supported: readonly ContentBlock['type'][]
  prepare?(blocks: ContentBlock[]): ContentBlock[]
  send(block: ContentBlock, options: { id: string; signal: AbortSignal; resourceKey?: string; uploaded(key: string): void }): Promise<{ providerMessageIds: string[] }>
}
/** A failed operation is safe to retry only when the provider guarantees no message was accepted. */
export class DeliveryFailure extends Error {
  constructor(readonly outcome: 'failed' | 'unknown' | 'unsupported', readonly code: string, options?: ErrorOptions) { super(code, options) }
}
export function deliveryState(record: DeliveryRecord): 'pending' | 'sent' | 'partial' | 'failed' | 'unknown' {
  if (record.parts.every(part => part.state === 'sent')) return 'sent'
  if (record.parts.some(part => part.state === 'unknown')) return 'unknown'
  if (record.parts.some(part => part.state === 'sent')) return 'partial'
  if (record.parts.some(part => ['failed', 'unsupported'].includes(part.state))) return 'failed'
  return 'pending'
}
/** All publishers reuse the frozen first payload; retries address only unfinished parts. */
export class MessageDelivery {
  private readonly active = new Map<string, Promise<void>>()
  constructor(private readonly store: Pick<Store, 'get' | 'set' | 'keys' | 'atomic'>) {
    for (const record of this.list()) if (record.parts.some(part => part.state === 'sending')) {
      for (const part of record.parts) if (part.state === 'sending') { part.state = 'unknown'; part.error = 'interrupted-send' }
      this.save(record)
    }
  }
  get(id: string): DeliveryRecord | undefined {
    const value = this.store.get(records(id))
    return value ? DeliverySchema.parse(value) : undefined
  }
  list(): DeliveryRecord[] { return this.store.keys(records).flatMap(name => this.get(name.slice(records.prefix.length)) ?? []) }
  private save(record: DeliveryRecord): void { record.updatedAt = new Date().toISOString(); this.store.set(records(record.id), record) }
  /** Queues the immutable prepared parts before the first provider call. */
  deliver(message: OutboundMessage, adapter: DeliveryAdapter, signal: AbortSignal): Promise<void> {
    const original = z.array(ContentBlockSchema).min(1).parse(message.blocks ?? [{ type: 'text', text: message.text, format: 'markdown' }])
    const signature = key(JSON.stringify([message.channel, original]))
    const previous = this.get(message.id)
    if (previous && previous.signature !== signature) return Promise.reject(new Error('Publication payload or destination changed'))
    const running = this.active.get(message.id)
    if (running) return running
    const record = previous ?? this.store.atomic(() => {
      const blocks = z.array(ContentBlockSchema).min(1).max(1024).parse(adapter.prepare?.(original) ?? original)
      const at = new Date().toISOString()
      const entry: DeliveryRecord = { version: 1, id: message.id, signature, source: message.channel.source, thread: message.channel.thread,
        ...(message.ticketId ? { ticketId: message.ticketId } : {}), ...(message.resultId ? { resultId: message.resultId } : {}), at, updatedAt: at,
        resolutions: [], parts: blocks.map((block, index) => ({ id: key('message-part-v1', message.id, String(index)), block, state: 'pending', attempts: 0, providerMessageIds: [] })) }
      this.save(entry); return entry
    })
    const promise = Promise.resolve().then(() => this.run(record, adapter, signal)).finally(() => this.active.delete(message.id))
    this.active.set(message.id, promise)
    return promise
  }
  private async run(record: DeliveryRecord, adapter: DeliveryAdapter, signal: AbortSignal): Promise<void> {
    for (const part of record.parts) {
      if (part.state === 'sent') continue
      if (part.state === 'unknown' || part.state === 'unsupported') break
      signal.throwIfAborted()
      if (!adapter.supported.includes(part.block.type)) { part.state = 'unsupported'; part.error = `unsupported-${part.block.type}`; this.save(record); break }
      part.state = 'sending'; part.attempts++; delete part.error; this.save(record)
      try {
        const sent = await adapter.send(part.block, { id: part.id, signal, ...(part.resourceKey ? { resourceKey: part.resourceKey } : {}),
          uploaded: value => { part.resourceKey = z.string().min(1).parse(value); this.save(record) } })
        part.providerMessageIds = z.array(z.string().min(1)).min(1).parse(sent.providerMessageIds)
        part.state = 'sent'; this.save(record)
      } catch (error) {
        part.state = error instanceof DeliveryFailure ? error.outcome : 'unknown'
        part.error = error instanceof DeliveryFailure ? error.code : 'provider-outcome-unknown'
        this.save(record); break
      }
    }
    if (deliveryState(record) !== 'sent') throw Object.assign(new Error('Publication is not completely delivered'), { code: 'delivery-incomplete', deliveryId: record.id })
  }
  /** Human reconciliation never rewrites content or clears successful receipts. */
  reconcile(id: string, partId: string, action: 'confirm_sent' | 'retry', note: string): void {
    if (this.active.has(id)) throw new Error('Delivery is in flight')
    const record = this.get(id), part = record?.parts.find(part => part.id === partId)
    if (!record || !part || !['failed', 'unknown', 'unsupported'].includes(part.state)) throw new Error('No unresolved delivery part')
    if (!note.trim()) throw new Error('A reconciliation note is required')
    part.state = action === 'confirm_sent' ? 'sent' : 'pending'; delete part.error
    record.resolutions.push({ partId, action, note: note.trim(), at: new Date().toISOString() }); this.save(record)
  }
}
