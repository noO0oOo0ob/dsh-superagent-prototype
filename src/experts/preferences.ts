/** User-owned Main/bot persona instructions and per-source expert routing preferences. */
import { z } from 'zod'
import { family, record } from '../kv.ts'
import type { Store } from '../app/store.ts'
import { ExpertId, COORDINATOR_AGENTS, GENERAL_SOUL, type ExpertSelection } from './model.ts'
import type { Experts } from './catalog.ts'
const persona = z.object({ agents: z.string().trim().min(1), soul: z.string().trim().min(1) }).strict()
export const ExpertPreferencesSchema = z.object({
  main: persona.default(() => ({ agents: COORDINATOR_AGENTS, soul: GENERAL_SOUL })),
  accounts: z.array(z.object({ source: z.string().min(1), persona,
    allowed: z.array(ExpertId).nullable().default(null), defaultExpert: ExpertId.nullable().default(null), mode: z.enum(['auto', 'fixed']).default('auto'),
  }).strict()).default([]),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.accounts.map(item => item.source)).size !== value.accounts.length) ctx.addIssue({ code: 'custom', message: 'Duplicate account source' })
  for (const account of value.accounts) {
    if (account.mode === 'fixed' && !account.defaultExpert) ctx.addIssue({ code: 'custom', message: 'Fixed routing requires a default expert' })
    if (account.defaultExpert && account.allowed && !account.allowed.includes(account.defaultExpert)) ctx.addIssue({ code: 'custom', message: 'Default expert must be in the allowed list' })
  }
})
export type ExpertPreferencesConfig = z.infer<typeof ExpertPreferencesSchema>
const configKey = record<{ revision: number; config: ExpertPreferencesConfig }>('expert-preferences:v1')
const personaKey = family<z.infer<typeof persona>>('expert-dialogue-persona:v1:')
const mainKey = family<z.infer<typeof persona>>('expert-main-persona:v1:')
/** Concurrent preference changes must be reloaded, never overwritten implicitly. */
export class ExpertPreferencesConflict extends Error {}
/** Keeps dialogue persona snapshots separate from live routing admission. */
export class ExpertPreferences {
  constructor(private readonly store: Pick<Store, 'get' | 'set' | 'atomic'>, private readonly experts: Experts, private readonly maxChars: () => number) {}
  view() { const value = this.store.get(configKey); return { revision: value?.revision ?? 0, config: ExpertPreferencesSchema.parse(value?.config ?? {}) } }
  save(input: unknown, revision: number) {
    const config = ExpertPreferencesSchema.parse(input)
    for (const item of [config.main, ...config.accounts.map(account => account.persona)]) if (item.agents.length + item.soul.length > this.maxChars()) throw new Error('Persona exceeds prompt budget')
    const ids = new Set(this.experts.list().map(item => item.snapshot.id))
    for (const account of config.accounts) for (const id of [...account.allowed ?? [], ...account.defaultExpert ? [account.defaultExpert] : []]) if (!ids.has(id)) throw new Error(`Unknown expert: ${id}`)
    return this.store.atomic(() => {
      if (this.view().revision !== revision) throw new ExpertPreferencesConflict('Preferences changed; reload')
      const value = { revision: revision + 1, config }; this.store.set(configKey, value); return value
    })
  }
  main(session: string, nextTurn = false): string {
    const value = !nextTurn && this.store.get(mainKey(session)) || this.view().config.main
    if (nextTurn || !this.store.get(mainKey(session))) this.store.set(mainKey(session), value)
    return this.render(value)
  }
  dialogue(session: string, source: string): string {
    let value = this.store.get(personaKey(session))
    if (!value) {
      value = this.view().config.accounts.find(account => account.source === source)?.persona ?? { agents: COORDINATOR_AGENTS, soul: GENERAL_SOUL }
      this.store.set(personaKey(session), value)
    }
    return this.render(persona.parse(value))
  }
  choices(source?: string) {
    const account = this.view().config.accounts.find(account => account.source === source)
    return { mode: account?.mode ?? 'auto', defaultExpert: account?.defaultExpert ?? null,
      experts: this.experts.choices().filter(item => !account?.allowed || account.allowed.includes(item.id)) }
  }
  select(selection: ExpertSelection | null | undefined, source?: string) {
    const choices = this.choices(source)
    if (choices.mode === 'fixed') {
      const chosen = choices.experts.find(item => item.id === choices.defaultExpert)
      if (!chosen) throw new Error('The fixed expert is unavailable; update account settings')
      if (selection && selection.id !== chosen.id) throw new Error('This account uses a fixed expert')
      return this.experts.select(selection ?? { id: chosen.id, digest: chosen.digest, reason: 'Account fixed expert configuration' })
    }
    // Defaults are preferences shown to Router, not a forced match for unrelated work.
    const allowed = this.view().config.accounts.find(account => account.source === source)?.allowed
    if (selection && allowed && !allowed.includes(selection.id)) throw new Error('Expert is not allowed for this source')
    return this.experts.select(selection)
  }
  private render(value: z.infer<typeof persona>): string { return `[Conversation AGENTS]\n${value.agents}\n[Conversation SOUL]\n${value.soul}` }
}
