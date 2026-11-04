/** Personal features run through the real Runtime, durable queues and registered model tools. */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { startRuntime } from './fixtures/host.ts'
import type { Trigger } from '../src/core/index.ts'

it('exports a no-Git task to Markdown and hook files while returning its result in Main', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  const root = await mkdtemp(join(tmpdir(), 'spa-integration-'))
  try {
    const view = h.runtime.personal.view()
    const saved = await h.api('PUT', 'personal', { revision: view.revision, config: { ...view.config,
      vault: { enabled: true, root, directory: 'Plans' }, hooks: { enabled: true, directory: join(root, 'hooks') } } })
    expect(saved.status).toBe(200)
    expect((await h.api('PUT', 'personal', { revision: view.revision, config: view.config })).status).toBe(409)
    const trigger = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Prepare a weekend plan' }], source: { kind: 'user' } }))!
    const response = await h.runTool(h.runtime.masterId, 'personal_agent_submit', { trigger_id: trigger.id, title: 'Weekend', worktree_name: 'weekend' })
    await h.runtime.idle()
    const ticketId = (response.ticket as { ticket_id: string }).ticket_id
    const workspace = h.runtime.store.tickets.get(ticketId)!.execution!.directory
    await writeFile(join(workspace, 'plan.md'), '# Detailed plan\nTake the early train.')
    const artifact = await h.runTool(`spa-worker-${ticketId}`, 'personal_agent_artifact', { path: 'plan.md', title: 'Detailed plan' })
    await h.runTool(`spa-worker-${ticketId}`, 'personal_agent_report', { state: 'ready', summary: 'Visit the museum on Sunday.' })
    await h.runtime.idle(); await h.runtime.pump()
    const result = h.runtime.results.list(ticketId).find(item => item.state === 'ready')!, exported = h.runtime.vault.list(result.id)[0]!
    expect(exported.state).toBe('written')
    expect(await readFile(exported.path!, 'utf8')).toContain('Visit the museum on Sunday.')
    expect(h.runtime.hooks.list().some(item => item.kind === 'result.saved' && item.resultId === result.id)).toBe(true)
    expect(h.runtime.hooks.deliveries().every(item => item.state === 'sent')).toBe(true)
    expect(JSON.stringify(h.agents.get(h.runtime.masterId)!.inject.mock.calls)).toContain(result.url)
    expect(result.artifacts?.[0]?.id).toBe(artifact.artifact_id)
    expect((await h.api('GET', 'personal')).body.vault).toHaveLength(2)
    const continuation = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Recheck the same plan' }], source: { kind: 'user' } }))!
    await h.runTool(h.runtime.masterId, 'personal_agent_submit', { trigger_id: continuation.id, title: 'Weekend', worktree_name: 'weekend', ticket_id: ticketId })
    await h.runtime.idle()
    const repeated = await h.runTool(`spa-worker-${ticketId}`, 'personal_agent_artifact', { path: 'plan.md', title: 'Detailed plan' })
    expect(repeated.artifact_id).not.toBe(artifact.artifact_id)
    await h.runTool(`spa-worker-${ticketId}`, 'personal_agent_report', { state: 'ready', summary: 'The plan still works.' })
    await h.runtime.idle()
    expect(h.runtime.results.list(ticketId).find(item => item.summary === 'The plan still works.')?.artifacts?.[0]?.id).toBe(repeated.artifact_id)
  } finally { await h.stop(); await rm(root, { recursive: true, force: true }) }
})

it('prepares two selected directory resources and logs their isolated paths for the worker', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  const root = await mkdtemp(join(tmpdir(), 'spa-resources-'))
  try {
    for (const id of ['notes', 'docs']) { await mkdir(join(root, id)); await writeFile(join(root, id, 'readme.md'), id) }
    const view = h.runtime.personal.view()
    h.runtime.personal.save({ ...view.config, repositories: ['notes', 'docs'].map(id => ({ id, kind: 'directory', path: join(root, id) })) }, view.revision)
    const trigger = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Compare the configured notes and docs' }], source: { kind: 'user' } }))!
    const response = await h.runTool(h.runtime.masterId, 'personal_agent_submit', { trigger_id: trigger.id, title: 'Compare', worktree_name: 'compare', resource_ids: ['notes', 'docs'] })
    await h.runtime.idle()
    const id = (response.ticket as { ticket_id: string }).ticket_id
    const first = h.relays(`spa-worker-${id}`)[0]!
    expect(first.resources).toHaveLength(2)
    const resources = first.resources as { directory: string }[]
    for (const item of resources) { expect(item.directory.startsWith(await realpath(h.directory))).toBe(true); expect(await readFile(join(item.directory, 'readme.md'), 'utf8')).toMatch(/notes|docs/) }
    expect((await h.runTool(`spa-worker-${id}`, 'personal_agent_read', { resource: `ticket-resources/${id}` }))).toBeDefined()
  } finally { await h.stop(); await rm(root, { recursive: true, force: true }) }
})

it('runs an explicitly scheduled Main request once and refuses invented scheduled input', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  try {
    const origin = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Schedule a travel research task' }], source: { kind: 'user' } }))!
    const response = await h.api('POST', 'personal/schedules', { spec: { id: 'travel', title: 'Travel', text: 'Research a short trip', originTriggerId: origin.id,
      when: { kind: 'once', at: new Date(Date.now() - 1000).toISOString() } } })
    expect(response.status).toBe(200)
    await h.runtime.pump(); await h.runtime.idle()
    const runs = h.runtime.schedules.runs()
    expect(runs).toHaveLength(1); expect(runs[0]!.state).toBe('accepted')
    await h.runtime.pump(); expect(h.runtime.schedules.runs()).toHaveLength(1)
    const trigger = runs[0]!.trigger
    const decision = h.runtime.engine.decide(trigger.id, { kind: 'accept', title: 'Travel', scope: 'Travel', name: 'travel', reason: 'Explicit schedule' })
    expect(decision.ticketId).toBeTruthy()
    const forged: Trigger = { ...trigger, id: 'forged', meta: { ...trigger.meta }, text: 'Unapproved task' }
    const inputs = h.runtime.store.tickets.get(decision.ticketId!)!.inputs.length
    expect(() => h.runtime.receive(forged)).toThrow('not authorized')
    expect(() => h.runtime.engine.receive(forged)).toThrow('not authorized')
    expect(h.runtime.store.tickets.get(decision.ticketId!)!.inputs).toHaveLength(inputs)
    expect(() => h.runtime.engine.decide(forged.id, { kind: 'accept', title: 'Forged', scope: 'Forged', name: 'forged', reason: 'spoof' })).toThrow()
  } finally { await h.stop() }
})

it('does not delegate a captured local request after its source is disabled', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  try {
    const request = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Prepare a plan' }], source: { kind: 'user' } }))!
    const settings = h.runtime.store.settings()
    h.runtime.store.saveSettings({ ...settings, sources: { ...settings.sources, main: { enabled: false, config: {} } } })
    await expect(h.runTool(h.runtime.masterId, 'personal_agent_submit', { trigger_id: request.id, title: 'Plan', worktree_name: 'plan' })).rejects.toThrow()
    expect(h.runtime.store.tickets.list()).toHaveLength(0)
  } finally { await h.stop() }
})
