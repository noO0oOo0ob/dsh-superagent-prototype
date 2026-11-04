/** Durable scheduled instructions and their distinct intake executions; the Host owns the polling loop. */
import { z } from 'zod'
import { key, type ReceiveResult, type Trigger } from '../core/index.ts'
import { contextRef } from '../core/context.ts'
import { family } from '../kv.ts'
import type { Store } from '../app/store.ts'

const id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
const instant = z.iso.datetime({ offset: true })
export const ScheduleSpecSchema = z.object({
  id, title: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(32_000),
  originTriggerId: z.string().min(1).max(256),
  when: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('once'), at: instant }).strict(),
    z.object({ kind: z.literal('interval'), firstAt: instant, everyMs: z.number().int().min(1000).max(366 * 86_400_000) }).strict(),
  ]),
}).strict()
export type ScheduleSpec = z.infer<typeof ScheduleSpecSchema>
/** Validates a submitted instruction and normalizes its timestamp for durable ordering and stable execution IDs. */
function resolveSpec(input: unknown): ScheduleSpec {
  const spec = ScheduleSpecSchema.parse(input)
  return { ...spec, when: spec.when.kind === 'once' ? { ...spec.when, at: new Date(spec.when.at).toISOString() }
    : { ...spec.when, firstAt: new Date(spec.when.firstAt).toISOString() } }
}
export const SchedulerOptionsSchema = z.object({
  maxDuePerPass: z.number().int().min(1).max(100).default(20),
  retryDelayMs: z.number().int().min(1).max(86_400_000).default(5000),
  maxAttempts: z.number().int().min(1).max(100).default(3),
}).strict()
export type SchedulerOptions = z.infer<typeof SchedulerOptionsSchema>
export interface ScheduleRecord {
  version: 1; revision: number; spec: ScheduleSpec; state: 'active' | 'paused' | 'stopped' | 'completed'
  createdAt: string; updatedAt: string; nextAt?: string
}
export interface ScheduleRun {
  version: 1; id: string; scheduleId: string; revision: number; scheduledAt: string; originTriggerId: string
  state: 'pending' | 'accepted' | 'failed' | 'blocked' | 'cancelled'; trigger: Trigger
  attempts: number; failures: number; createdAt: string; updatedAt: string; retryAt?: string; error?: string
  /** Explicit retry of a filtered Trigger gets a fresh message ID while preserving the logical occurrence. */
  routeAttempt: number
}
const schedules = family<ScheduleRecord>('personal-schedule:')
const executions = family<ScheduleRun>('personal-schedule-run:')
export interface SchedulesHost {
  store: Pick<Store, 'get' | 'set' | 'keys' | 'atomic' | 'triggers'>
  /** Must ingest into this Store synchronously; a thrown failure rolls back that intake transaction. */
  receive(trigger: Trigger): ReceiveResult
  /** Revalidates the original human instruction against current source admission and identity policy. */
  authorize(origin: Trigger): boolean
  options?: () => SchedulerOptions
  now?: () => number
}

/** A schedule revision changed while a management editor was open. */
export class ScheduleConflict extends Error {}

/** Persists schedule definitions, intake attempts and retry decisions without starting its own timer or model. */
export class Schedules {
  private passing = false
  constructor(private readonly host: SchedulesHost) {}
  private now(): string { return new Date(this.host.now?.() ?? Date.now()).toISOString() }
  get(scheduleId: string): ScheduleRecord | undefined { return this.host.store.get(schedules(scheduleId)) }
  list(): ScheduleRecord[] { return this.host.store.keys(schedules).flatMap(name => this.host.store.get(name) ?? []) }
  run(executionId: string): ScheduleRun | undefined { return this.host.store.get(executions(executionId)) }
  runs(scheduleId?: string): ScheduleRun[] {
    return this.host.store.keys(executions).flatMap(name => this.host.store.get(name) ?? [])
      .filter(run => scheduleId === undefined || run.scheduleId === scheduleId).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id))
  }
  /** Creates an explicitly approved instruction; choosing the approving message belongs to local management. */
  create(input: unknown): ScheduleRecord {
    const spec = resolveSpec(input)
    return this.host.store.atomic(() => {
      if (this.get(spec.id)) throw new Error('Schedule ID already exists')
      this.origin(spec.originTriggerId)
      const now = this.now(), value: ScheduleRecord = { version: 1, revision: 1, spec, state: 'active', createdAt: now, updatedAt: now,
        nextAt: spec.when.kind === 'once' ? spec.when.at : spec.when.firstAt }
      this.host.store.set(schedules(spec.id), value)
      return value
    })
  }
  /** Replaces future work under a new revision; already accepted task executions remain unchanged. */
  update(scheduleId: string, input: unknown, revision: number): ScheduleRecord {
    const spec = resolveSpec(input)
    return this.host.store.atomic(() => {
      const current = this.require(scheduleId)
      if (spec.id !== scheduleId || current.revision !== revision) throw new ScheduleConflict('Schedule changed; reload before saving')
      if (current.state === 'stopped' || current.state === 'completed') throw new Error('Create a new schedule after stopping or completing one')
      this.origin(spec.originTriggerId)
      this.cancelPending(scheduleId, 'Schedule was replaced')
      const updated: ScheduleRecord = { ...current, spec, revision: revision + 1, updatedAt: this.now(),
        nextAt: spec.when.kind === 'once' ? spec.when.at : spec.when.firstAt }
      this.host.store.set(schedules(scheduleId), updated)
      return updated
    })
  }
  pause(scheduleId: string): ScheduleRecord { return this.changeState(scheduleId, 'paused') }
  resume(scheduleId: string): ScheduleRecord {
    const current = this.require(scheduleId)
    this.origin(current.spec.originTriggerId)
    return this.changeState(scheduleId, 'active')
  }
  /** Stops future occurrences and queued retries; accepted tasks have their own independent stop controls. */
  stop(scheduleId: string): ScheduleRecord {
    return this.host.store.atomic(() => {
      const current = this.require(scheduleId)
      this.cancelPending(scheduleId, 'Schedule was stopped')
      const updated: ScheduleRecord = { ...current, state: 'stopped', updatedAt: this.now(), nextAt: undefined }
      this.host.store.set(schedules(scheduleId), updated)
      return updated
    })
  }
  /** Retries failed intake only; this never re-executes an already accepted worker task. */
  retry(executionId: string): ScheduleRun {
    return this.host.store.atomic(() => {
      const run = this.run(executionId)
      if (!run) throw new Error('Unknown schedule execution')
      const schedule = this.require(run.scheduleId)
      if (schedule.state !== 'active' || schedule.revision !== run.revision) throw new Error('The schedule is not active at this revision')
      if (run.state !== 'failed' && run.state !== 'blocked') throw new Error('Only a failed or blocked intake may be retried')
      this.origin(run.originTriggerId)
      const filtered = !!this.host.store.triggers.disposition(run.trigger.id)?.filtered
      const routeAttempt = run.routeAttempt + (filtered ? 1 : 0)
      const trigger: Trigger = filtered ? { ...run.trigger, id: key('schedule-trigger', run.id, String(routeAttempt)),
        meta: { ...run.trigger.meta, routeAttempt } } : run.trigger
      const updated: ScheduleRun = { ...run, trigger, routeAttempt, state: 'pending', failures: 0, retryAt: this.now(),
        updatedAt: this.now(), error: undefined }
      this.host.store.set(executions(run.id), updated)
      return updated
    })
  }
  /** Verify exact saved scheduled input before granting any Source authority; arbitrary metadata grants nothing. */
  authorizedTrigger(trigger: Trigger): boolean {
    const runId = trigger.meta.executionId
    if (trigger.source !== 'schedule' || typeof runId !== 'string') return false
    const run = this.run(runId)
    if (!run || (run.state !== 'pending' && run.state !== 'accepted') || JSON.stringify(run.trigger) !== JSON.stringify(trigger)) return false
    const schedule = this.get(run.scheduleId)
    if (!schedule || run.state !== 'accepted' && (schedule.state !== 'active' || schedule.revision !== run.revision)) return false
    const origin = this.host.store.triggers.get(run.originTriggerId)
    return !!origin?.human && this.host.authorize(origin)
  }
  /** Returns the verified original source instruction for the Host's admission adapter. */
  originFor(trigger: Trigger): Trigger | undefined {
    return this.authorizedTrigger(trigger) ? this.host.store.triggers.get(String(trigger.meta.originalTriggerId)) : undefined
  }
  /** One bounded due pass; interval downtime coalesces to one occurrence and then the next future slot. */
  pass(): number {
    if (this.passing) return 0
    this.passing = true
    try {
      const options = SchedulerOptionsSchema.parse(this.host.options?.() ?? {}), now = this.now()
      let processed = 0
      for (const schedule of this.list().sort((a, b) => (a.nextAt ?? '').localeCompare(b.nextAt ?? ''))) {
        if (processed >= options.maxDuePerPass) break
        if (schedule.state !== 'active') continue
        const pending = this.runs(schedule.spec.id).filter(run => run.state === 'pending' && (run.retryAt ?? run.scheduledAt) <= now)
        for (const run of pending) {
          if (processed >= options.maxDuePerPass) break
          this.dispatch(run, options); processed++
        }
        const current = this.require(schedule.spec.id)
        if (processed >= options.maxDuePerPass || current.state !== 'active' || !current.nextAt || current.nextAt > now) continue
        const run = this.reserve(current, now)
        this.dispatch(run, options); processed++
      }
      return processed
    } finally { this.passing = false }
  }
  private origin(triggerId: string): Trigger {
    const origin = this.host.store.triggers.get(triggerId)
    if (!origin?.human || !this.host.authorize(origin)) throw new Error('The original human instruction is no longer authorized')
    return origin
  }
  private require(scheduleId: string): ScheduleRecord {
    const value = this.get(scheduleId)
    if (!value) throw new Error('Unknown schedule')
    return value
  }
  private changeState(scheduleId: string, state: 'active' | 'paused'): ScheduleRecord {
    return this.host.store.atomic(() => {
      const current = this.require(scheduleId)
      if (current.state === 'stopped' || current.state === 'completed') throw new Error('This schedule has ended')
      const updated = { ...current, state, updatedAt: this.now() }
      this.host.store.set(schedules(scheduleId), updated)
      return updated
    })
  }
  private cancelPending(scheduleId: string, error: string): void {
    for (const run of this.runs(scheduleId)) if (run.state !== 'accepted' && run.state !== 'cancelled')
      this.host.store.set(executions(run.id), { ...run, state: 'cancelled', retryAt: undefined, error, updatedAt: this.now() })
  }
  private reserve(schedule: ScheduleRecord, now: string): ScheduleRun {
    return this.host.store.atomic(() => {
      const scheduledAt = schedule.nextAt!, executionId = key('schedule-run', schedule.spec.id, String(schedule.revision), scheduledAt)
      const existing = this.run(executionId)
      if (existing) return existing
      // Capture the approving message even if authorization was revoked: dispatch records a visible blocked outcome.
      const origin = this.host.store.triggers.get(schedule.spec.originTriggerId)
      if (!origin) throw new Error('The approving source message is missing')
      const trigger: Trigger = { id: key('schedule-trigger', executionId, '0'), source: 'schedule', actor: { source: 'schedule', id: schedule.spec.id },
        human: true, addressed: 'direct', at: scheduledAt, text: schedule.spec.text,
        threads: [{ source: 'schedule', id: executionId }], ...(origin.channel ? { channel: origin.channel } : {}),
        meta: { scheduleId: schedule.spec.id, executionId, routeAttempt: 0, originalTriggerId: origin.id,
          originalSource: origin.source, originalActor: origin.actor, originalContext: contextRef(origin.id) } }
      const run: ScheduleRun = { version: 1, id: executionId, scheduleId: schedule.spec.id, revision: schedule.revision,
        scheduledAt, originTriggerId: origin.id, state: 'pending', trigger, attempts: 0, failures: 0, createdAt: now, updatedAt: now, routeAttempt: 0 }
      this.host.store.set(executions(executionId), run)
      const nextAt = schedule.spec.when.kind === 'once' ? undefined : new Date(Date.parse(scheduledAt)
        + (Math.floor((Date.parse(now) - Date.parse(scheduledAt)) / schedule.spec.when.everyMs) + 1) * schedule.spec.when.everyMs).toISOString()
      this.host.store.set(schedules(schedule.spec.id), { ...schedule, nextAt, updatedAt: now })
      return run
    })
  }
  private dispatch(run: ScheduleRun, options: SchedulerOptions): void {
    const now = this.now(), attempted = { ...run, attempts: run.attempts + 1, updatedAt: now }
    try {
      this.host.store.atomic(() => {
        if (!this.authorizedTrigger(run.trigger)) {
          this.host.store.set(executions(run.id), { ...attempted, state: 'blocked', retryAt: undefined,
            error: 'The saved schedule instruction is no longer authorized' }); return
        }
        const outcome = this.host.receive(run.trigger)
        const filtered = outcome === 'filtered' || outcome === 'duplicate' && !!this.host.store.triggers.disposition(run.trigger.id)?.filtered
        this.host.store.set(executions(run.id), { ...attempted, state: filtered ? 'blocked' : 'accepted', retryAt: undefined,
          error: filtered ? 'The Source filtered this execution' : undefined })
        const current = this.require(run.scheduleId)
        if (!filtered && current.state === 'active' && current.revision === run.revision && current.spec.when.kind === 'once')
          this.host.store.set(schedules(run.scheduleId), { ...current, state: 'completed', updatedAt: now })
      })
    } catch (error) {
      const failures = run.failures + 1, retry = failures < options.maxAttempts
      this.host.store.set(executions(run.id), { ...attempted, failures, state: retry ? 'pending' : 'failed',
        retryAt: retry ? new Date(Date.parse(now) + options.retryDelayMs).toISOString() : undefined,
        error: String(error).slice(0, 1000) })
    }
  }
}
