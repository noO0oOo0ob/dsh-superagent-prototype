/** Versioned personal-agent configuration, independent of optional account credentials. */
import { z } from 'zod'
import { record } from '../kv.ts'
import { ArtifactConfigSchema } from './artifacts.ts'
import { SchedulerOptionsSchema } from './schedules.ts'
import { HookConfigSchema } from './hooks.ts'
import { VaultConfigSchema } from './vault.ts'
import { RepositoryConfigsSchema } from './repositories.ts'
import { RoutingConfigSchema } from './routing.ts'
import type { Store } from '../app/store.ts'

export const PersonalId = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/)
export const ConnectorConfigSchema = z.object({
  id: PersonalId,
  provider: PersonalId.optional(),
  channel: PersonalId.optional(),
  enabled: z.boolean().default(false),
  intake: z.enum(['account', 'restricted']).default('restricted'),
  botId: z.string().trim().default(''),
  fingerprint: z.string().regex(/^(?:[0-9a-f]{64})?$/).default(''),
  conversations: z.array(z.object({ id: z.string().min(1), kind: z.enum(['dm', 'group']),
    listen: z.enum(['mentions', 'all']).default('mentions') }).strict()).default([]),
  allowedSenders: z.array(z.string().trim().min(1)).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.provider && value.provider !== 'feishu' && !value.channel)
    ctx.addIssue({ code: 'custom', message: 'A provider account needs an explicit channel' })
  if (value.enabled && (!value.botId || !value.fingerprint))
    ctx.addIssue({ code: 'custom', message: 'An enabled Connector needs a bot and verified fingerprint' })
  if (value.enabled && value.intake === 'restricted' && (!value.conversations.length || !value.allowedSenders.length))
    ctx.addIssue({ code: 'custom', message: 'Restricted intake needs conversations and allowed senders' })
  if (value.intake === 'account' && (value.conversations.length || value.allowedSenders.length))
    ctx.addIssue({ code: 'custom', message: 'Account intake does not use local conversation or sender lists' })
  if (new Set(value.conversations.map(item => item.id)).size !== value.conversations.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate conversation IDs' })
})
export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>
export const PersonalConfigSchema = z.object({
  expertImports: z.object({ maxBytes: z.number().int().positive().default(8_000_000), maxFiles: z.number().int().positive().default(1000), mcpTimeoutMs: z.number().int().positive().default(60000) }).strict().default(() => ({ maxBytes: 8_000_000, maxFiles: 1000, mcpTimeoutMs: 60000 })),
  feishuDocuments: z.object({ contextChars: z.number().int().min(1000).max(200000).default(24000), commentPages: z.number().int().min(1).max(100).default(10) }).strict().default(() => ({ contextChars: 24000, commentPages: 10 })),
  artifacts: ArtifactConfigSchema.default(() => ArtifactConfigSchema.parse({})),
  scheduler: SchedulerOptionsSchema.default(() => SchedulerOptionsSchema.parse({})),
  hooks: HookConfigSchema.default(() => HookConfigSchema.parse({})),
  vault: VaultConfigSchema.default(() => VaultConfigSchema.parse({})),
  repositories: RepositoryConfigsSchema.default([]),
  routing: RoutingConfigSchema.default(() => RoutingConfigSchema.parse({})),
  connectors: z.array(ConnectorConfigSchema).default([]),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.connectors.map(item => item.id)).size !== value.connectors.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate Connector IDs' })
  const enabled = value.connectors.filter(item => item.enabled)
  if (new Set(enabled.map(item => `${item.provider ?? 'feishu'}:${item.botId}`)).size !== enabled.length)
    ctx.addIssue({ code: 'custom', message: 'One bot may have only one enabled Connector per provider' })
  if (new Set(enabled.map(item => `${item.provider ?? 'feishu'}:${item.fingerprint}`)).size !== enabled.length)
    ctx.addIssue({ code: 'custom', message: 'One verified account may have only one enabled Connector per provider' })
})
export type PersonalConfig = z.infer<typeof PersonalConfigSchema>
const configKey = record<{ version: 1; revision: number; config: PersonalConfig }>('personal-config')

/** A stale revision must be reloaded before applying a settings edit. */
export class PersonalConflict extends Error {}

/** Validates persisted configuration and rejects stale concurrent edits. */
export class PersonalSettings {
  constructor(private readonly store: Pick<Store, 'get' | 'set' | 'atomic'>) {}
  view(): { revision: number; config: PersonalConfig } {
    const stored = this.store.get(configKey)
    if (stored && stored.version !== 1) throw new Error('Unsupported personal settings version')
    return { revision: stored?.revision ?? 0, config: PersonalConfigSchema.parse(stored?.config ?? {}) }
  }
  save(input: unknown, revision: number): ReturnType<PersonalSettings['view']> {
    const config = PersonalConfigSchema.parse(input)
    return this.store.atomic(() => {
      if (this.view().revision !== revision) throw new PersonalConflict('Personal settings changed; reload before saving')
      this.store.set(configKey, { version: 1, revision: revision + 1, config })
      return this.view()
    })
  }
}
