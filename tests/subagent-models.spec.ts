/** Delegation inherits the effective parent model and enforces task profiles and DSH allowlists. */
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { bindScopeParent, createScope, type Scope } from '@deepseek-ai/dsh-scope'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { resolveChildAgentOptions } from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { managedDelegationGuard, modelDelegationTools } from '../src/app/subagent-models.ts'
import { toolParameters } from '../src/app/tools/definition.ts'
import type { WorkerModelPlan } from '../src/models.ts'
import { deferred } from './fixtures/async.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
function setup() {
  const ctx = new Context(); contexts.push(ctx)
  const session = Session.create(SessionId('parent'))
  session.append('request/header', { header: { config: { provider: 'modlens-text', model: 'cheap', reasoningEffort: ReasoningEffortId('low') } }, reason: 'initial' })
  const agent = { id: session.id, ctx, session, options: { provider: 'old-default', model: 'expensive' } } as Agent
  const spawn = { capabilities: { agentOptions: true, depthLimit: true } }
  const start = vi.fn(async (_request: { request: { agentOptions: AgentOptions } }) => ({ childId: SessionId('child') }))
  const resolve = vi.fn(async value => value)
  ctx.reflect.provide('agents', new Map([[agent.id, agent]]))
  ctx.reflect.provide('llm', { resolveCallConfig: resolve, resolveModelInfo: async (provider: string, model: string) =>
    ({ provider, id: model, name: model, inputModalities: provider === 'text' ? ['text'] : ['text', 'image'] }) })
  ctx.reflect.provide('tools', { get: () => ({}) })
  ctx.reflect.provide('subagents', { getProvider: () => spawn, resolveMaxDepth: () => 3, startActivation: start })
  const plan: WorkerModelPlan = { profile: 'basic', route: { requested: { provider: 'text', model: 'cheap' },
    effective: { provider: 'modlens-text', model: 'cheap' }, vision: 'modlens' }, profiles: {
    basic: { model: { provider: 'text', model: 'cheap', reasoningEffort: 'low' }, description: 'Simple' },
    standard: null, advanced: { model: { provider: 'native', model: 'deep' }, description: 'Complex' },
  } }
  const live = { value: true }
  const tools = modelDelegationTools({ context: ctx, agent, plan, preset: 'worker-preset', assertLive: () => { if (!live.value) throw new Error('Task ended') } })
  const invoke = (name: string, args: Record<string, unknown> = {}) => {
    const entry = tools.find(item => item.name === name)!
    return entry.execute(entry.schema.parse(args), new AbortController().signal)
  }
  const delegate = (extra: Record<string, unknown> = {}) => invoke('personal_agent_delegate', { description: 'Identify a landmark', prompt: 'Read the supplied image', ...extra })
  return { ctx, agent, session, plan, live, start, resolve, invoke, delegate }
}
it('inherits the current request model and effort, not the model used when the parent was constructed', async () => {
  const { delegate, start } = setup()
  expect(await delegate()).toMatchObject({ model_profile: 'inherit', model: { provider: 'modlens-text', model: 'cheap', reasoningEffort: 'low' } })
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ provider: 'spawn', delivery: 'parent', request: expect.objectContaining({
    agentPreset: 'worker-preset', maxDepth: 3, agentOptions: { provider: 'modlens-text', model: 'cheap', reasoningEffort: 'low' },
  }) }))
})
it('uses a captured explicit profile and clears the parent effort when the new profile omits it', async () => {
  const { delegate, start } = setup()
  expect(await delegate({ model_profile: 'advanced' })).toMatchObject({ model: { provider: 'native', model: 'deep' } })
  expect(start).toHaveBeenCalledWith(expect.objectContaining({ request: expect.objectContaining({ agentOptions: { provider: 'native', model: 'deep' } }) }))
  expect(await delegate({ model_profile: 'basic' })).toMatchObject({ model: { provider: 'modlens-text', model: 'cheap', reasoningEffort: 'low' } })
})
it('clears inherited effort through the actual runtime merge even when profiles use the same provider and model', async () => {
  const { delegate, start, plan, agent } = setup()
  plan.profiles.advanced!.model = { provider: 'modlens-text', model: 'cheap' }
  await delegate({ model_profile: 'advanced' })
  const child = resolveChildAgentOptions(agent, start.mock.calls[0]![0].request.agentOptions, 1)
  expect(child).toMatchObject({ provider: 'modlens-text', model: 'cheap' })
  expect(child.reasoningEffort).toBeUndefined()
})
it('rejects raw model parameters and disabled profiles before spawning', async () => {
  const { delegate, start } = setup()
  expect(() => delegate({ provider: 'other', model: 'unapproved' })).toThrow()
  await expect(delegate({ model_profile: 'standard' })).rejects.toMatchObject({ code: 'profileUnavailable' })
  expect(start).not.toHaveBeenCalled()
})
it('honors a narrower durable DSH model allowlist without modifying it', async () => {
  const { delegate, session, start } = setup()
  // This event is owned by DSH's optional native delegation tool; exercise its durable wire representation.
  Reflect.apply(session.append, session, ['subagent/model-selection-policy', { allowedModels: [{ provider: 'modlens-text', model: 'cheap' }] }])
  await expect(delegate({ model_profile: 'advanced' })).rejects.toThrow('not allowed')
  expect(start).not.toHaveBeenCalled()
  expect(await delegate()).toMatchObject({ model_profile: 'inherit' })
})
it('stops delegation if the owning task ends while the model is being resolved', async () => {
  const { delegate, resolve, live, start } = setup()
  const gate = deferred<void>()
  resolve.mockImplementationOnce(async value => { await gate.promise; return value })
  const pending = delegate({ model_profile: 'advanced' })
  live.value = false; gate.resolve()
  await expect(pending).rejects.toThrow('Task ended')
  expect(start).not.toHaveBeenCalled()
})
it('lets a child inherit its immediate parent model while retaining the task profile definitions', async () => {
  const { ctx, agent, plan } = setup()
  const session = Session.create(SessionId('second-level'), [], { ...agent.session.header, id: SessionId('second-level'), origin: 'subagent', parentSession: agent.id })
  const child = { id: session.id, session, ctx, options: { provider: 'native', model: 'deep' } } as Agent
  const tool = modelDelegationTools({ context: ctx, agent: child, plan, preset: 'worker-preset', assertLive: () => {} }).find(item => item.name === 'personal_agent_delegate')!
  expect(await tool.execute(tool.schema.parse({ description: 'Check a detail', prompt: 'Verify this fact' }), new AbortController().signal))
    .toMatchObject({ model_profile: 'inherit', model: { provider: 'native', model: 'deep' } })
})
it('does not fall back when the selected vision route disappears', async () => {
  const { ctx, delegate, start } = setup()
  vi.spyOn(ctx.tools, 'get').mockReturnValue(undefined)
  await expect(delegate({ model_profile: 'basic' })).rejects.toMatchObject({ code: 'modlensUnavailable' })
  expect(start).not.toHaveBeenCalled()
})
it('coexists with native delegation mounted in the Worker scope using the real DSH tool registry', async () => {
  const { agent, plan } = setup()
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const mint = async (key: object) => {
    let scope!: Scope
    await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, key) }, { inject: ['tools', 'systemPrompt'] }))
    return scope
  }
  const preset = {}, legacy = {}
  const parent = await mint(preset)
  parent.ctx.tools.register({ name: 'subagent', description: 'Native delegation', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: () => [] }, execute: async () => ({}) })
  bindScopeParent(agent, preset); bindScopeParent(legacy, preset)
  const scope = await mint(agent)
  scope.ctx.tools.register({ name: 'subagent', description: 'Worker-local native delegation', parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'object' }, render: () => [] }, execute: async () => ({}) })
  scope.ctx.tools.restrict({ allow: [] })
  scope.ctx.tools.guard(managedDelegationGuard)
  for (const entry of modelDelegationTools({ context: ctx, agent, plan, preset: 'worker-preset', assertLive: () => {} })) {
    scope.ctx.tools.register({ name: entry.name, description: entry.description, parameters: toolParameters(entry.schema),
      output: { schema: { type: 'object' }, render: () => [] }, execute: async () => ({}) })
  }
  expect(ctx.tools.schemas(agent).map(tool => tool.name).sort()).toEqual(['personal_agent_delegate', 'personal_agent_model_profiles', 'subagent'])
  expect(ctx.tools.get('personal_agent_delegate', agent)?.parameters).toMatchObject({ properties: { model_profile: { enum: ['basic', 'standard', 'advanced'] } } })
  expect(ctx.tools.get('subagent', legacy)?.description).toBe('Native delegation')
  const denied = await ctx.tools.execute({ callId: ToolCallId('native'), name: 'subagent', arguments: {}, agent, signal: new AbortController().signal })
  expect(denied.isError).toBe(true)
  expect(JSON.stringify(denied)).toContain('Use personal_agent_delegate')
  const managed = await ctx.tools.execute({ callId: ToolCallId('managed'), name: 'personal_agent_delegate', arguments: { description: 'Check', prompt: 'Check' }, agent, signal: new AbortController().signal })
  expect(managed.isError).toBe(false)
})

it('blocks native model-policy bypass but allows managed delegation and other work tools', () => {
  expect(managedDelegationGuard({ name: 'subagent' })).toContain('personal_agent_delegate')
  expect(managedDelegationGuard({ name: 'list_subagent_models' })).toContain('personal_agent_model_profiles')
  expect(managedDelegationGuard({ name: 'personal_agent_delegate' })).toBeUndefined()
  expect(managedDelegationGuard({ name: 'read' })).toBeUndefined()
})
