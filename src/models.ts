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

export const MODEL_PROFILES = ['basic', 'standard', 'advanced'] as const
export const ModelProfileIdSchema = z.enum(MODEL_PROFILES)
export type ModelProfileId = z.infer<typeof ModelProfileIdSchema>
export const ModelProfileSchema = z.object({
  model: RoleModelSchema.nullable(),
  description: z.string().trim().max(240),
  visionProvider: z.string().trim().min(1).optional(),
}).strict()
export const ModelProfilesSchema = z.object({ basic: ModelProfileSchema.nullable(), standard: ModelProfileSchema.nullable(), advanced: ModelProfileSchema.nullable() }).strict()
export type ModelProfiles = z.infer<typeof ModelProfilesSchema>
export const WorkerModelsSchema = z.object({ default: ModelProfileIdSchema, profiles: ModelProfilesSchema }).strict()
  .refine(value => value.profiles[value.default] !== null, { message: 'The default model profile must be enabled', path: ['default'] })
export type WorkerModels = z.infer<typeof WorkerModelsSchema>

/** Legacy settings remain readable; an inherited default is resolved once when new work is accepted. */
export function workerModels(executor: { model: RoleModel | null; models?: WorkerModels }): WorkerModels {
  return executor.models ?? { default: 'standard', profiles: { basic: null, advanced: null,
    standard: { model: executor.model, description: 'General research, planning, writing and implementation.' } } }
}

/** A Ticket owns its selected route and the profile definitions available to its future children. */
export const WorkerModelPlanSchema = z.object({ profile: ModelProfileIdSchema, route: ResolvedModelRouteSchema, profiles: ModelProfilesSchema }).strict()
  .refine(value => value.profiles[value.profile] !== null, { message: 'Selected task model profile is disabled' })
export type WorkerModelPlan = z.infer<typeof WorkerModelPlanSchema>
