/** Scheduled intake derives authority from its persisted run and original human instruction. */
import type { Policy } from '../core/index.ts'
import type { Schedules } from '../personal/schedules.ts'

/** Wraps normal source policy without granting authority to arbitrary schedule-shaped metadata. */
export function scheduledPolicy(base: Policy, schedules: Schedules): Policy {
  return { ...base,
    gate(trigger, thread, tickets) {
      if (trigger.source !== 'schedule') return base.gate(trigger, thread, tickets)
      if (!schedules.authorizedTrigger(trigger)) return { admissible: false, reason: 'not_a_member' }
      return { admissible: true, strength: 'explicit', basis: { source: 'schedule', scope: trigger.meta, via: 'addressed', addressed: 'direct' } }
    },
    revalidate(mandate) {
      if (mandate.basis.source !== 'schedule') return base.revalidate(mandate)
      const id = mandate.basis.scope?.executionId, run = typeof id === 'string' ? schedules.run(id) : undefined
      return !!run && schedules.authorizedTrigger(run.trigger)
    },
  }
}
