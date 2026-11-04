/** Main Session management tools for explicitly requested scheduled work. */
import { z } from 'zod'
import type { Trigger } from '../core/index.ts'
import { ScheduleSpecSchema, type ScheduleRecord, type Schedules } from '../personal/schedules.ts'
import type { Store } from './store.ts'
import { tool, type Tool } from './tools/tool.ts'

export interface PersonalToolsHost {
  store: Pick<Store, 'triggers'>
  schedules: Schedules
  currentRequest(): Trigger | undefined
  requestPass(): void
}
const createSchema = ScheduleSpecSchema.omit({ originTriggerId: true }).extend({
  trigger_id: z.string().min(1).describe('The latest original local human trigger_id returned by personal_agent_current_request.'),
}).strict()
const describe = (value: ScheduleRecord) => ({ id: value.spec.id, title: value.spec.title, text: value.spec.text, when: value.spec.when,
  revision: value.revision, state: value.state, next_at: value.nextAt, origin_trigger_id: value.spec.originTriggerId })

/** Tools are registered only on Main; every mutation names the current original local human request. */
export function personalTools(host: PersonalToolsHost): Tool[] {
  const request = (triggerId: string): Trigger => {
    const current = host.currentRequest(), saved = host.store.triggers.get(triggerId)
    if (current?.id !== triggerId || !saved?.human || saved.source !== 'main' || saved.actor.source !== 'main' || saved.actor.id !== 'owner')
      throw new Error('Schedule changes require the latest original local human request')
    return saved
  }
  const owned = (scheduleId: string, current: Trigger): ScheduleRecord => {
    const schedule = host.schedules.get(scheduleId), origin = schedule && host.store.triggers.get(schedule.spec.originTriggerId)
    if (!schedule) throw new Error('Unknown schedule')
    if (!origin?.human || origin.source !== current.source || origin.actor.source !== current.actor.source || origin.actor.id !== current.actor.id)
      throw new Error('This schedule belongs to another source; use authorized local management')
    return schedule
  }
  return [
    tool({ name: 'personal_agent_schedules',
      description: 'List saved schedules, or their distinct intake executions. Accepted means the task was admitted, not that its Worker finished. Reading creates no work.',
      schema: z.object({ schedule_id: z.string().min(1).optional(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(50).default(20) }).strict(),
      execute: async ({ schedule_id, offset, limit }) => {
        const values = schedule_id ? host.schedules.runs(schedule_id).map(run => ({ execution_id: run.id, schedule_id: run.scheduleId,
          scheduled_at: run.scheduledAt, state: run.state, trigger_id: run.trigger.id, attempts: run.attempts, retry_at: run.retryAt, error: run.error }))
          : host.schedules.list().map(describe)
        return { items: values.slice(offset, offset + limit), next_offset: values.length > offset + limit ? offset + limit : null }
      } }),
    tool({ name: 'personal_agent_schedule_create',
      description: 'Create a one-shot or recurring instruction only when the current local user explicitly requests scheduled execution. Do not schedule brainstorming, a hypothetical example or a request to wait. Preserve requested scope and timezone; ask when the requested time is ambiguous. The Host binds the original request and reply destination; do not choose another source.',
      schema: createSchema,
      execute: async ({ trigger_id, ...input }, signal) => {
        signal.throwIfAborted()
        const current = request(trigger_id)
        const schedule = host.schedules.create({ ...input, originTriggerId: current.id })
        host.requestPass()
        return { schedule: describe(schedule) }
      } }),
    tool({ name: 'personal_agent_schedule_update',
      description: 'Replace future scheduled work only on an explicit instruction in the current local request. Read the current revision first. Already accepted tasks remain independent; stopped/completed schedules require a new ID.',
      schema: createSchema.extend({ revision: z.number().int().min(1) }).strict(),
      execute: async ({ trigger_id, revision, ...input }, signal) => {
        signal.throwIfAborted()
        const current = request(trigger_id)
        owned(input.id, current)
        const schedule = host.schedules.update(input.id, { ...input, originTriggerId: current.id }, revision)
        host.requestPass()
        return { schedule: describe(schedule) }
      } }),
    tool({ name: 'personal_agent_schedule_control',
      description: 'Pause, resume or stop future scheduled occurrences, or explicitly retry a failed intake. Only perform the action the current local human requested. Stopping a schedule does not cancel already accepted tasks. Retry uses execution_id; other actions use schedule ID.',
      schema: z.object({ trigger_id: z.string().min(1), action: z.enum(['pause', 'resume', 'stop', 'retry']), id: z.string().min(1) }).strict(),
      execute: async ({ trigger_id, action, id }, signal) => {
        signal.throwIfAborted()
        const current = request(trigger_id)
        if (action === 'retry') {
          const run = host.schedules.run(id)
          if (!run) throw new Error('Unknown schedule execution')
          owned(run.scheduleId, current)
          const execution = host.schedules.retry(id)
          host.requestPass()
          return { execution_id: execution.id, state: execution.state, trigger_id: execution.trigger.id }
        }
        owned(id, current)
        const schedule = host.schedules[action](id)
        host.requestPass()
        return { schedule: describe(schedule) }
      } }),
  ]
}
