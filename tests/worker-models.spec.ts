/** Task model preflight, durable choices and legacy Session compatibility. */
import { afterEach, expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { workerModels, WorkerModelsSchema, type WorkerModels } from '../src/models.ts'
import { planWorkerModel } from '../src/app/worker-models.ts'
import { workerSessionId } from '../src/executor/dsh.ts'
import { startRuntime, feishu, type Host } from './fixtures/host.ts'
import { deferred } from './fixtures/async.ts'

let h: Host | undefined
afterEach(async () => { await h?.stop(); h = undefined })
const profiles: WorkerModels = { default: 'standard', profiles: {
  basic: { model: { provider: 'text', model: 'cheap', reasoningEffort: 'low' }, description: 'Simple tasks' },
  standard: { model: { provider: 'native', model: 'regular' }, description: 'General work' },
  advanced: { model: { provider: 'native', model: 'deep' }, description: 'Difficult work' },
} }
async function setup() {
  const host = h = await startRuntime()
  const settings = host.runtime.store.settings()
  host.runtime.store.saveSettings({ ...settings, executor: { ...settings.executor, models: structuredClone(profiles) } })
  vi.spyOn(host.ctx.llm, 'resolveModelInfo').mockImplementation(async (provider, model) => ({ id: model, name: model, provider,
    inputModalities: provider === 'text' ? ['text'] : ['text', 'image'] }))
  return host
}
async function accept(host: Host, id: string, profile: 'basic' | 'standard' | 'advanced' = 'basic') {
  const trigger = feishu(id, 'Please research a travel plan')
  trigger.meta.settings = { model: { provider: 'account', model: 'expensive' } }
  host.runtime.receive(trigger); await host.runtime.idle()
  const result = await host.route({ kind: 'accept', trigger_id: trigger.id, title: id, worktree_name: 'travel-plan', acknowledgement: '开始整理旅行计划。', model_profile: profile })
  await host.runtime.idle()
  const ticketId = (result.ticket as { ticket_id: string }).ticket_id
  return { trigger, ticket: host.runtime.store.tickets.get(ticketId)!, agent: host.agents.get(workerSessionId(ticketId))! }
}
it('resolves the chosen tier before dispatch and does not let the IM account model override it', async () => {
  const host = await setup(), { ticket, agent } = await accept(host, 'chosen-tier')
  expect(ticket.modelPlan).toMatchObject({ profile: 'basic', route: { vision: 'modlens', effective: { provider: 'modlens-text', model: 'cheap', reasoningEffort: 'low' } } })
  expect(agent.session.snapshotEvents().filter(event => event.type === 'model/selection').map(event => event.data)).toEqual([ticket.modelPlan!.route.effective])
  expect(host.controller.selectModel).not.toHaveBeenCalled()
  const detail = await host.api('GET', `tickets/${ticket.id}`)
  expect(detail.body.modelPlan).toEqual(ticket.modelPlan)
})
it('keeps the same route on follow-up, repeated acceptance and re-ensure after defaults change or ModLens disappears', async () => {
  const host = await setup(), { trigger, ticket, agent } = await accept(host, 'stable-tier')
  const settings = host.runtime.store.settings()
  host.runtime.store.saveSettings({ ...settings, executor: { ...settings.executor, models: { ...profiles, default: 'advanced' } } })
  vi.spyOn(host.ctx.tools, 'get').mockReturnValue(undefined)
  const duplicate = await host.route({ kind: 'accept', trigger_id: trigger.id, title: 'Changed', worktree_name: 'other-plan', acknowledgement: '开始。', model_profile: 'advanced' })
  expect(duplicate.ticket).toMatchObject({ ticket_id: ticket.id, model_profile: 'basic' })
  const followup = feishu('travel-image', 'Add this pictured landmark')
  host.runtime.receive(followup); await host.runtime.idle()
  await host.runtime.sessions.ensure(agent.id, ticket.execution!.directory, ticket.title, 'worker')
  expect(agent.session.snapshotEvents().filter(event => event.type === 'model/selection')).toHaveLength(1)
  expect(host.runtime.store.tickets.get(ticket.id)!.modelPlan).toEqual(ticket.modelPlan)
})
it('refuses a missing dependency before creating a ticket or acknowledgement', async () => {
  const host = await setup()
  vi.spyOn(host.ctx.tools, 'get').mockReturnValue(undefined)
  const trigger = feishu('missing-modlens', 'Research travel')
  host.runtime.receive(trigger); await host.runtime.idle()
  await expect(host.route({ kind: 'accept', trigger_id: trigger.id, title: 'Travel', worktree_name: 'travel', acknowledgement: '开始。' })).rejects.toThrow('ModLens is not loaded')
  expect(host.runtime.store.tickets.list()).toHaveLength(0)
  expect(host.runtime.store.triggers.disposition(trigger.id)?.decisionId).toBeUndefined()
})
it('rejects a stale preflight and leaves unrelated profile outages out of a selected task', async () => {
  const host = await setup()
  const gate = deferred<void>()
  vi.spyOn(host.ctx.llm, 'resolveCallConfig').mockImplementationOnce(async value => { await gate.promise; return value })
  const pending = planWorkerModel(host.ctx, () => host.runtime.store.settings(), 'standard')
  const settings = host.runtime.store.settings()
  host.runtime.store.saveSettings({ ...settings, executor: { ...settings.executor, models: { ...profiles, default: 'advanced' } } })
  gate.resolve()
  await expect(pending).rejects.toMatchObject({ code: 'configurationChanged' })
  vi.mocked(host.ctx.llm.resolveModelInfo).mockImplementation(async (provider, model) => {
    if (model === 'deep') throw new Error('unrelated provider outage')
    return { id: model, name: model, provider, inputModalities: ['text', 'image'] }
  })
  expect((await planWorkerModel(host.ctx, () => host.runtime.store.settings(), 'standard')).route.effective.model).toBe('regular')
})
it('captures a legacy inherited default for new work without rewriting legacy configuration', async () => {
  const host = h = await startRuntime()
  const old = host.runtime.store.settings()
  const plan = await planWorkerModel(host.ctx, () => host.runtime.store.settings())
  expect(plan.route.effective).toEqual({ provider: 'test-native', model: 'default' })
  expect(plan.profiles.standard!.model).toEqual(plan.route.effective)
  expect(host.runtime.store.settings()).toEqual(old)
  expect(workerModels(old.executor).default).toBe('standard')
})
it('preserves a pre-profile task while new tasks use profiles', async () => {
  const host = h = await startRuntime()
  const settings = host.runtime.store.settings()
  host.runtime.store.saveSettings({ ...settings, executor: { ...settings.executor, model: { provider: 'legacy', model: 'original' }, models: profiles } })
  const trigger = feishu('legacy-ticket', 'Continue older work')
  host.runtime.receive(trigger); await host.runtime.idle()
  const decision = host.runtime.engine.decide(trigger.id, { kind: 'accept', title: 'Legacy', scope: 'Legacy', reason: 'Existing accepted work', name: 'legacy-task' })
  await host.runtime.idle()
  const ticket = host.runtime.store.tickets.get(decision.ticketId!)!
  expect(ticket.modelPlan).toBeUndefined()
  expect(host.agents.get(workerSessionId(ticket.id))!.session.snapshotEvents()).toContainEqual(expect.objectContaining({ type: 'model/selection', data: { provider: 'legacy', model: 'original' } }))
})
it('applies the same profiles to Main delegation and forbids reselecting an existing task', async () => {
  const host = await setup()
  const message = createUserMessage({ content: [{ type: 'text', text: 'Please create a travel plan' }], source: { kind: 'user' } })
  const trigger = host.runtime.main.capture(message)!
  const result = await host.runTool(host.runtime.masterId, 'personal_agent_submit', { trigger_id: trigger.id, title: 'Travel', worktree_name: 'travel', model_profile: 'advanced' })
  const ticket = result.ticket as { ticket_id: string; model_profile: string }
  expect(ticket.model_profile).toBe('advanced')
  await expect(host.runTool(host.runtime.masterId, 'personal_agent_submit', { trigger_id: trigger.id, ticket_id: ticket.ticket_id,
    title: 'Travel', worktree_name: 'travel', model_profile: 'basic' })).rejects.toThrow('retain their original model')
})
it('requires an enabled default and reports route readiness without claiming engine authentication', async () => {
  const host = await setup()
  expect(WorkerModelsSchema.safeParse({ ...profiles, profiles: { ...profiles.profiles, standard: null } }).success).toBe(false)
  const result = await host.api('POST', 'worker-models/check', profiles)
  expect(result.status).toBe(200)
  expect(result.body).toMatchObject({ dependency: { loaded: true, engine: 'not-checked' }, profiles: [
    { id: 'basic', state: 'ready', route: { effective: { provider: 'modlens-text' } } },
    { id: 'standard', state: 'ready' }, { id: 'advanced', state: 'ready' },
  ] })
})
