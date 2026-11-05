/** Persisted model routes shared by settings, task records and Session initialization. */
import { z } from 'zod'

export const RoleModelSchema = z.object({ provider: z.string().trim().min(1), model: z.string().trim().min(1), reasoningEffort: z.string().trim().min(1).optional() }).strict()
export type RoleModel = z.infer<typeof RoleModelSchema>

/** The user's base model and the validated provider used for execution; model IDs are never display labels. */
export const ResolvedModelRouteSchema = z.object({
  requested: RoleModelSchema,
  effective: RoleModelSchema,
  vision: z.enum(['native', 'modlens']),
}).strict()
export type ResolvedModelRoute = z.infer<typeof ResolvedModelRouteSchema>
