/** Captured IM settings and model-visible source context; no independent routing Agent. */
import { z } from 'zod'
import type { Trigger, Ticket } from '../core/index.ts'
import type { RoleModel } from '../policy.ts'

const settings = z.object({ workspace: z.string().optional(), agentPreset: z.string().nullable().optional(),
  model: z.object({ provider: z.string(), model: z.string(), reasoningEffort: z.string().optional() }).nullable().optional(),
  contextEnhancement: z.object({ direct: z.object({ enabled: z.boolean(), fields: z.array(z.string()), guidance: z.string() }),
    group: z.object({ enabled: z.boolean(), fields: z.array(z.string()), guidance: z.string() }) }).optional(),
}).passthrough()
/** Settings are captured from the account at intake, never inferred from message text. */
export function dialogueSettings(trigger?: Trigger): { workspace?: string; model?: RoleModel | null; preset?: string } {
  const value = settings.parse(trigger?.meta.settings ?? {})
  return { ...(value.workspace ? { workspace: value.workspace } : {}), ...(value.model ? { model: value.model } : {}),
    ...(value.agentPreset ? { preset: value.agentPreset } : {}) }
}
/** Model-facing context includes selected display fields, while full metadata remains in storage. */
export function dialogueMessage(trigger: Trigger, tasks: Ticket[]): Record<string, unknown> {
  const config = settings.parse(trigger.meta.settings ?? {}).contextEnhancement?.[trigger.meta.conversationType === 'dm' ? 'direct' : 'group']
  const source: Record<string, unknown> = { channel: trigger.meta.channel, conversationType: trigger.meta.conversationType,
    senderId: trigger.actor?.id, senderName: trigger.meta.senderName, conversationTitle: trigger.meta.conversationTitle,
    chatId: trigger.meta.conversationId, threadId: trigger.meta.threadId, botId: trigger.meta.botId, sentAt: trigger.at }
  return { trigger_id: trigger.id, text: trigger.text,
    origin: { source: trigger.source, actor: trigger.actor, conversation: trigger.meta.conversationKey, generation: trigger.meta.dialogueGeneration }, ...(config?.enabled ? {
    source: Object.fromEntries(config.fields.filter(name => source[name] !== undefined).map(name => [name, source[name]])),
    ...(config.guidance ? { source_guidance: config.guidance } : {}) } : {}),
    resources: trigger.meta.resources ?? [], tasks: tasks.map(ticket => ({ id: ticket.id, title: ticket.title,
      state: ticket.ended?.outcome ?? ticket.assignments.at(-1)?.report?.state ?? 'running' })) }
}
