/** Restart-safe transfer of outstanding legacy IM evaluations to Main. */
import type { Store } from '../app/store.ts'
import type { Effects } from '../app/effects.ts'

/** Requeue undecided candidates with their existing IDs; receipts and Worker inputs stay intact. */
export function migrateMainCandidates(store: Store, effects: Pick<Effects, 'enqueue'>): void {
  store.atomic(() => {
    const marker = 'personal-main-routing-v1'
    if (store.get(marker)) return
    for (const thread of store.threads.active()) {
      const evaluation = thread.evaluating
      if (!evaluation) continue
      const trigger = store.triggers.get(evaluation.primary ?? evaluation.triggerIds[0]!)
      if (trigger?.meta.conversationVersion !== 1) continue
      delete evaluation.delivered
      store.threads.save(thread)
      effects.enqueue('assessment', evaluation.id, { triggerId: trigger.id })
    }
    store.set(marker, true)
  })
}
