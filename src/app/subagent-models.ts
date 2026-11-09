/** Task-scoped delegation models over the DSH subagent runtime; lifecycle and depth limits remain owned by DSH. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { parentAgentOptionsForDelegation } from '@deepseek-ai/dsh-subagent'
import { z } from 'zod'
import { MODEL_PROFILES, ModelProfileIdSchema, RoleModelSchema, type RoleModel, type WorkerModelPlan } from '../models.ts'
import { ModelRoutingError, resolveVisionModel } from './model-routing.ts'
import { resolveRoleModel } from './role-models.ts'
import { tool, type Tool } from './tools/definition.ts'

const HostPolicySchema = z.object({ allowedModels: z.array(RoleModelSchema.pick({ provider: true, model: true })).min(1) }).strict()
/** Existing DSH opt-ins may be narrower than the task profiles. Children also honor an ancestor's saved policy. */
function hostPolicy(ctx: Context, agent: Agent): RoleModel[] | undefined {
  let current: Agent | undefined = agent
  const seen = new Set<string>()
  while (current) {
    if (seen.has(current.id)) throw new Error('Cannot resolve the parent model policy: cyclic Session ancestry')
    seen.add(current.id)
    const events: readonly { type: string; data: unknown }[] = current.session.snapshotEvents()
    const event = events.find(item => item.type === 'subagent/model-selection-policy')
    if (event) return HostPolicySchema.parse(event.data).allowedModels
    const parent = current.session.header.parentSession
    if (!parent) return undefined
    current = ctx.agents.get(parent)
    if (!current) throw new Error('The parent Session is unavailable; restore it before explicitly selecting a child model')
  }
  return undefined
}

export const WORKER_MODEL_INSTRUCTIONS = 'Use personal_agent_delegate for subagent delegation; do not call native subagent or list_subagent_models. Omit model_profile to inherit your current provider, model and reasoning effort. '
  + 'Use personal_agent_model_profiles before explicitly selecting another enabled profile for a new child. Profiles were captured when this task was accepted. '
  + 'Do not supply provider/model IDs or change an existing child to handle an image. Continue an existing child with send_message. '
  + 'Read images through the normal attachment tools; native vision or ModLens handles them. Treat image-read errors or uncertain evidence as limitations, never as a successful observation.'

interface Host {
  context: Context
  agent: Agent
  plan: WorkerModelPlan
  preset: string
  /** Recheck task authority after asynchronous route resolution, before publishing a child. */
  assertLive(): void
}

/** Only new profile-aware tasks get these tools; older Workers keep their existing delegation behavior. */
export function modelDelegationTools(host: Host): Tool[] {
  const { context: ctx, agent, plan } = host
  return [tool({ name: 'personal_agent_model_profiles', description: 'Read this task\'s captured child model profiles. Omit model_profile on personal_agent_delegate to inherit the current parent model.',
    schema: z.object({}).strict(), execute: async () => {
      host.assertLive()
      return { default: 'inherit', current: parentAgentOptionsForDelegation(agent), profiles: MODEL_PROFILES.flatMap(id => {
        const profile = plan.profiles[id]
        return profile ? [{ id, description: profile.description, model: profile.model }] : []
      }), host_allowed_models: hostPolicy(ctx, agent) ?? null }
    } }), tool({ name: 'personal_agent_delegate', description: 'Start a managed child for an independent task. Omit model_profile to inherit the current parent model; explicitly select only a captured task profile. DSH reports completion automatically. Use send_message to continue an existing child.',
    schema: z.object({ description: z.string().trim().min(1), prompt: z.string().min(1), cwd: z.string().optional(), model_profile: ModelProfileIdSchema.optional() }).strict(),
    execute: async ({ description, prompt, cwd, model_profile }, signal) => {
      host.assertLive(); signal.throwIfAborted()
      const subagents = ctx.get('subagents')
      const provider = subagents?.getProvider('spawn')
      if (!subagents || !provider?.capabilities.agentOptions) throw new Error('DSH spawn subagents with model selection are unavailable. Enable the native spawn provider.')
      const inherited = parentAgentOptionsForDelegation(agent)
      let selected: RoleModel
      if (model_profile) {
        const spec = plan.profiles[model_profile]
        if (!spec?.model) throw new ModelRoutingError('profileUnavailable', `Model profile ${model_profile} was not configured when this task was accepted.`)
        selected = (await resolveVisionModel(ctx, spec.model, spec.visionProvider, signal)).effective
        const allowed = hostPolicy(ctx, agent)
        if (allowed && !allowed.some(item => item.provider === selected.provider && item.model === selected.model))
          throw new Error(`Child model ${selected.provider}/${selected.model} is not allowed by this Session's DSH model policy. Use inheritance or update the policy for a new Session.`)
      } else {
        if (!inherited.provider || !inherited.model) throw new Error('The parent Session has no effective model to inherit')
        selected = await resolveRoleModel(ctx, { provider: inherited.provider, model: inherited.model,
          ...(inherited.reasoningEffort ? { reasoningEffort: inherited.reasoningEffort } : {}) }, signal)
      }
      const { reasoningEffort: _parentEffort, ...options } = inherited
      // The runtime merges parent options again; an own undefined clears effort even when two profiles share a route.
      const agentOptions: AgentOptions = { ...options, provider: selected.provider, model: selected.model,
        reasoningEffort: selected.reasoningEffort ? ReasoningEffortId(selected.reasoningEffort) : undefined }
      const maxDepth = subagents.resolveMaxDepth(undefined)
      if (maxDepth !== undefined && !provider.capabilities.depthLimit) throw new Error('The native spawn provider cannot enforce the configured delegation depth')
      host.assertLive(); signal.throwIfAborted()
      if (subagents.getProvider('spawn') !== provider) throw new Error('The spawn provider changed during model preflight; retry delegation')
      const request = { parent: agent, prompt: [{ type: 'text' as const, text: prompt }], agentOptions, agentPreset: host.preset,
        ...(cwd !== undefined ? { cwd } : {}), ...(maxDepth !== undefined ? { maxDepth } : {}) }
      const activation = await subagents.startActivation({ provider: 'spawn', label: description, request, signal, delivery: 'parent' })
      return { kind: 'activation', subagentId: activation.childId, model_profile: model_profile ?? 'inherit', model: selected }
    } })]
}

/** Native delegation must not bypass the model profiles captured by a managed task. */
export function managedDelegationGuard({ name }: { name: string }): string | undefined {
  return name === 'subagent' || name === 'list_subagent_models'
    ? 'Use personal_agent_delegate and personal_agent_model_profiles for this task; native delegation bypasses its captured model policy'
    : undefined
}
