/** Immutable task facts and independently retried, idempotent local JSON delivery. */
import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, mkdir, open, realpath, unlink } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { z } from 'zod'
import { key } from '../core/index.ts'
import { family } from '../kv.ts'
import type { Store } from '../app/store.ts'

const ref = z.object({ id: z.string().min(1).max(256), traceId: z.string().min(1).max(256), triggerId: z.string().min(1).max(256) }).strict()
const shared = { version: z.literal(1).default(1), id: z.string().min(1).max(256), at: z.iso.datetime({ offset: true }),
  contexts: z.array(ref), taskId: z.string().min(1).max(256) }
export const HookKinds = ['task.state', 'result.saved', 'delivery.status'] as const
export const HookEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...shared, kind: z.literal('task.state'), state: z.enum(['created', 'running', 'waiting', 'ready', 'blocked', 'failed', 'completed', 'stopped', 'dropped', 'merged', 'closed', 'resumed']),
    assignmentId: z.string().min(1).max(256).optional() }).strict(),
  z.object({ ...shared, kind: z.literal('result.saved'), resultId: z.string().min(1).max(256),
    artifactIds: z.array(z.string().min(1).max(256)).max(1000).default([]) }).strict(),
  z.object({ ...shared, kind: z.literal('delivery.status'), deliveryId: z.string().min(1).max(256),
    status: z.enum(['pending', 'sending', 'sent', 'failed', 'unknown', 'dropped', 'cancelled']) }).strict(),
])
export type HookEvent = z.infer<typeof HookEventSchema>
export const HookConfigSchema = z.object({
  enabled: z.boolean().default(false), directory: z.string().trim().default(''),
  kinds: z.array(z.enum(HookKinds)).default([...HookKinds]),
  maxPerPass: z.number().int().min(1).max(100).default(20), retryDelayMs: z.number().int().min(1).max(86_400_000).default(5000),
}).strict().superRefine((value, ctx) => {
  if (value.enabled && !isAbsolute(value.directory)) ctx.addIssue({ code: 'custom', message: 'An enabled hook sink needs an absolute directory' })
  if (new Set(value.kinds).size !== value.kinds.length) ctx.addIssue({ code: 'custom', message: 'Duplicate hook kinds' })
})
export type HookConfig = z.infer<typeof HookConfigSchema>
export interface HookDelivery {
  version: 1; id: string; eventId: string; directory: string; canonicalDirectory?: string
  state: 'pending' | 'sent' | 'failed' | 'blocked'; attempts: number; createdAt: string; updatedAt: string
  retryAt?: string; error?: string; path?: string
}
const events = family<HookEvent>('personal-hook-event:')
const deliveries = family<HookDelivery>('personal-hook-delivery:')
export interface HooksHost {
  store: Pick<Store, 'get' | 'set' | 'keys' | 'atomic'>
  config(): HookConfig
  now?: () => number
  signal?: AbortSignal
}
const errorCode = (error: unknown): string | undefined => error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined

/** Records facts inside the producer transaction, then publishes files without rerunning the producer or Worker. */
export class Hooks {
  private passing?: Promise<number>
  constructor(private readonly host: HooksHost) {}
  private now(): string { return new Date(this.host.now?.() ?? Date.now()).toISOString() }
  get(eventId: string): HookEvent | undefined { return this.host.store.get(events(eventId)) }
  list(): HookEvent[] {
    return this.host.store.keys(events).flatMap(name => this.host.store.get(name) ?? [])
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
  }
  deliveries(eventId?: string): HookDelivery[] {
    return this.host.store.keys(deliveries).flatMap(name => this.host.store.get(name) ?? [])
      .filter(delivery => eventId === undefined || delivery.eventId === eventId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }
  /** Persists once; reusing an event ID for different facts is an error, never an overwrite. */
  record(input: unknown): HookEvent {
    const event = HookEventSchema.parse(input), config = HookConfigSchema.parse(this.host.config())
    return this.host.store.atomic(() => {
      const existing = this.get(event.id)
      if (existing && JSON.stringify(existing) !== JSON.stringify(event)) throw new Error('Hook event ID already names different facts')
      if (existing) return existing
      this.host.store.set(events(event.id), event)
      if (config.enabled && config.kinds.includes(event.kind)) this.queue(event, config)
      return event
    })
  }
  /** Explicitly queues a saved event for the currently configured directory; a sent file is never duplicated. */
  replay(eventId: string): HookDelivery {
    const config = HookConfigSchema.parse(this.host.config()), event = this.get(eventId)
    if (!event) throw new Error('Unknown hook event')
    if (!config.enabled || !config.kinds.includes(event.kind)) throw new Error('Enable this hook kind before replaying it')
    return this.host.store.atomic(() => this.queue(event, config))
  }
  /** Retries an existing delivery at its original destination, including after a file conflict was resolved. */
  retry(deliveryId: string): HookDelivery {
    const delivery = this.host.store.get(deliveries(deliveryId))
    if (!delivery) throw new Error('Unknown hook delivery')
    if (delivery.state === 'sent') return delivery
    const config = HookConfigSchema.parse(this.host.config())
    if (!config.enabled || resolve(config.directory) !== delivery.directory) throw new Error('Restore the original hook directory before retrying')
    const updated: HookDelivery = { ...delivery, state: 'pending', error: undefined, retryAt: this.now(), updatedAt: this.now() }
    this.host.store.set(deliveries(deliveryId), updated)
    return updated
  }
  /** Coalesces concurrent callers into one bounded pass. The Host invokes it from its existing lifecycle loop. */
  pass(): Promise<number> {
    if (this.passing) return this.passing
    this.passing = this.publishDue().finally(() => { this.passing = undefined })
    return this.passing
  }
  private queue(event: HookEvent, config: HookConfig): HookDelivery {
    const directory = resolve(config.directory), deliveryId = key('hook-delivery-v1', event.id, directory)
    const existing = this.host.store.get(deliveries(deliveryId))
    if (existing) return existing
    const now = this.now(), delivery: HookDelivery = { version: 1, id: deliveryId, eventId: event.id, directory,
      state: 'pending', attempts: 0, createdAt: now, updatedAt: now }
    this.host.store.set(deliveries(deliveryId), delivery)
    return delivery
  }
  private active(delivery: HookDelivery, event: HookEvent): boolean {
    if (this.host.signal?.aborted) return false
    const config = HookConfigSchema.parse(this.host.config())
    return config.enabled && config.kinds.includes(event.kind) && resolve(config.directory) === delivery.directory
  }
  private async publishDue(): Promise<number> {
    const config = HookConfigSchema.parse(this.host.config())
    if (!config.enabled || this.host.signal?.aborted) return 0
    const now = this.now(), pending = this.deliveries().filter(delivery => delivery.state !== 'sent'
      && delivery.state !== 'blocked' && (delivery.retryAt ?? delivery.createdAt) <= now
      && config.kinds.includes(this.get(delivery.eventId)?.kind ?? 'task.state')).slice(0, config.maxPerPass)
    let attempts = 0
    for (const delivery of pending) {
      const event = this.get(delivery.eventId)
      if (!event) throw new Error('Hook delivery has lost its immutable event')
      if (!this.active(delivery, event)) {
        if (resolve(config.directory) !== delivery.directory) this.host.store.set(deliveries(delivery.id), { ...delivery, state: 'blocked',
          updatedAt: this.now(), error: 'Hook destination changed; restore it to retry or explicitly replay to the new directory' })
        continue
      }
      attempts++
      const attempt: HookDelivery = { ...delivery, attempts: delivery.attempts + 1, updatedAt: this.now() }
      this.host.store.set(deliveries(delivery.id), attempt)
      try {
        const path = await this.publish(attempt, event)
        if (!path) continue
        this.host.store.set(deliveries(delivery.id), { ...attempt, state: 'sent', path, error: undefined, retryAt: undefined, updatedAt: this.now() })
      } catch (error) {
        if (this.host.signal?.aborted) break
        this.host.store.set(deliveries(delivery.id), { ...attempt, state: 'failed', updatedAt: this.now(),
          retryAt: new Date(Date.parse(this.now()) + config.retryDelayMs).toISOString(), error: String(error).slice(0, 1000) })
      }
    }
    return attempts
  }
  private async publish(delivery: HookDelivery, event: HookEvent): Promise<string | undefined> {
    await mkdir(delivery.directory, { recursive: true, mode: 0o700 })
    const directory = await realpath(delivery.directory)
    if (delivery.canonicalDirectory && delivery.canonicalDirectory !== directory) throw new Error('The hook directory now resolves to a different destination')
    delivery.canonicalDirectory = directory
    this.host.store.set(deliveries(delivery.id), delivery)
    const text = `${JSON.stringify(event, null, 2)}\n`, file = join(directory, `${key('hook-file-v1', event.id)}.json`)
    const temporary = join(directory, `.${key(event.id)}-${randomUUID()}.tmp`)
    if (!this.active(delivery, event)) return undefined
    const handle = await open(temporary, 'wx', 0o600)
    try {
      try { await handle.writeFile(text, 'utf8'); await handle.sync() } finally { await handle.close() }
      if (!this.active(delivery, event)) return undefined
      try { await link(temporary, file) }
      catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error
        const existing = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const info = await existing.stat()
          if (!info.isFile() || info.size !== Buffer.byteLength(text) || await existing.readFile('utf8') !== text)
            throw new Error('The hook output file contains different data; it was not overwritten')
        } finally { await existing.close() }
      }
      return file
    } finally { await unlink(temporary) }
  }
}
