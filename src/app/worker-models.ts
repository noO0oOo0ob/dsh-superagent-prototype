/** Creation-time model policy for tasks; later configuration changes do not alter a task's choice. */
import type { Context } from '@deepseek-ai/cordis'
import { MODEL_PROFILES, workerModels, type ModelProfileId, type ModelProfiles, type RoleModel, type WorkerModelPlan, type WorkerModels } from '../models.ts'
import type { Settings } from '../policy.ts'
import { ModelRoutingError, modlensStatus, requireModlens, resolveVisionModel } from './model-routing.ts'

/** Resolve an intentionally inherited DSH default into an explicit route before saving it on a task. */
export async function defaultModel(ctx: Context): Promise<RoleModel> {
  const value = (await ctx.sessionController.modelCatalog()).default
  if (!value) throw new ModelRoutingError('modelUnavailable', 'No DSH default model is configured. Select a model for the default Worker profile.')
  return { provider: value.provider, model: value.model, ...(value.reasoningEffort ? { reasoningEffort: value.reasoningEffort } : {}) }
}

/** Freeze inherited defaults for every enabled profile, without querying unused providers. */
async function snapshotProfiles(ctx: Context, models: WorkerModels): Promise<ModelProfiles> {
  const profiles = structuredClone(models.profiles)
  const inherited = MODEL_PROFILES.some(id => profiles[id]?.model === null) ? await defaultModel(ctx) : undefined
  for (const id of MODEL_PROFILES) {
    const profile = profiles[id]
    if (profile && !profile.model) profile.model = inherited!
  }
  return profiles
}

/** Resolve one new task before acceptance. Configuration changes during preflight require a fresh decision, with no partial task. */
export async function planWorkerModel(ctx: Context, settings: () => Settings, selected?: ModelProfileId, signal?: AbortSignal): Promise<WorkerModelPlan> {
  const config = workerModels(settings().executor), profile = selected ?? config.default
  if (!config.profiles[profile]) throw new ModelRoutingError('profileUnavailable', `Model profile ${profile} is disabled. Read personal_agent_model_profiles and choose an enabled profile.`)
  requireModlens(ctx)
  const profiles = await snapshotProfiles(ctx, config), spec = profiles[profile]!
  const route = await resolveVisionModel(ctx, spec.model!, spec.visionProvider, signal)
  signal?.throwIfAborted()
  if (JSON.stringify(config) !== JSON.stringify(workerModels(settings().executor))) throw new ModelRoutingError('configurationChanged', 'Worker model settings changed during preflight. Read the profiles and retry task acceptance.')
  return { profile, route, profiles }
}

/** Readable configuration for routers; provider availability is checked at acceptance, never inferred from this list. */
export function profileChoices(settings: Settings) {
  const models = workerModels(settings.executor)
  return { default: models.default, profiles: MODEL_PROFILES.flatMap(id => {
    const profile = models.profiles[id]
    return profile ? [{ id, description: profile.description, model: profile.model ?? 'DSH default, captured at task creation' }] : []
  }), rule: 'Select model_profile only for new tasks. Follow-ups retain the existing task model. Omission uses the default profile.' }
}

/** Probe all configured entries for the settings UI. This checks routes, not paid image inference or engine authentication. */
export async function inspectWorkerModels(ctx: Context, config: WorkerModels, signal?: AbortSignal) {
  const dependency = modlensStatus(ctx)
  const entries = await Promise.all(MODEL_PROFILES.map(async id => {
    const spec = config.profiles[id]
    if (!spec) return { id, state: 'disabled' as const }
    try {
      requireModlens(ctx)
      const route = await resolveVisionModel(ctx, spec.model ?? await defaultModel(ctx), spec.visionProvider, signal)
      return { id, state: 'ready' as const, route }
    } catch (error) {
      signal?.throwIfAborted()
      if (!(error instanceof ModelRoutingError)) throw error
      return { id, state: 'error' as const, code: error.code, detail: error.message }
    }
  }))
  return { dependency, profiles: entries }
}

/** Reject an invalid settings edit before recording a settings revision. */
export async function validateWorkerModels(ctx: Context, config: WorkerModels, signal?: AbortSignal): Promise<void> {
  const checked = await inspectWorkerModels(ctx, config, signal)
  const failure = checked.profiles.find(entry => entry.state === 'error')
  if (failure?.state === 'error') throw new ModelRoutingError(failure.code, `${failure.id}: ${failure.detail}`)
}
