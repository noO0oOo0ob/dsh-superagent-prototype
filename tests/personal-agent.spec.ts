/** The account-free local task loop and coexistence with another Host plugin. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Store } from '../src/app/store.ts'
import { inboxKind, inboxTrigger, pollInbox } from '../src/sources/inbox.ts'
import { ticketOfSession, workerSessionId } from '../src/executor/dsh.ts'
import { PersonalAgentSubprocess } from '../src/executor/environment.ts'
import { startRuntime } from './fixtures/host.ts'

it('starts without GitHub, completes a plain-directory task and persists its source metadata and result delivery', async () => {
  const inherited = { ...process.env }
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(),
    sources: { github: { enabled: false, config: {} }, feishu: { enabled: false, config: {} } },
    policy: { ...store.settings().policy, sources: { inbox: { allowed: [{ id: 'owner' }] } } },
  }))
  try {
    expect(h.runtime.configured()).toBe(true)
    expect(h.runtime.deployment.github).toBeUndefined()
    expect(h.subprocess.spawn).not.toHaveBeenCalled()
    expect(process.env).toEqual(inherited)
    h.runtime.sources.register(inboxKind)
    const root = join(h.directory, 'inbox')
    const config = { root, agentName: 'agent', pollSeconds: 10, conversations: [{ id: 'personal', listen: 'mentions' as const }] }
    const block = h.runtime.settings.block('source:inbox')
    await h.runtime.settings.save('source:inbox', { enabled: true, config }, block.revision, 'panel')
    const input = join(root, 'personal', 'in')
    mkdirSync(input, { recursive: true })
    const message = { id: 'travel-1', from: 'owner', to: 'agent', text: 'Plan a relaxed two-day trip.', bot: false,
      metadata: { traceId: 'trace-travel', accountId: 'local-owner', taskReference: 'weekend' } }
    writeFileSync(join(input, 'message.json'), JSON.stringify(message))
    const trigger = inboxTrigger(message, 'personal', new Date().toISOString(), config)!
    await pollInbox(h.runtime.context(inboxKind), config, h.runtime.lifetime)
    await h.runtime.idle()
    expect(h.runtime.store.triggers.get(trigger.id)?.meta.external).toEqual(message.metadata)
    const routed = await h.route({ kind: 'accept', trigger_id: trigger.id, title: 'Two-day travel plan', worktree_name: 'travel-plan',
      acknowledgement: 'I will prepare a relaxed two-day plan.' })
    await h.runtime.idle()
    const id = (routed.ticket as { ticket_id: string }).ticket_id
    const ticket = h.runtime.store.tickets.get(id)!
    expect(readdirSync(ticket.execution!.directory)).toEqual([])
    expect(h.subprocess.spawn).not.toHaveBeenCalled()
    const session = workerSessionId(id)
    expect(await h.runTool(session, 'personal_agent_read', { resource: `trigger/${trigger.id}` }))
      .toMatchObject({ metadata: { external: message.metadata } })
    const result = 'Day 1: explore the old town. Day 2: visit the waterfront. Keep both afternoons free.'
    writeFileSync(join(ticket.execution!.directory, 'plan.md'), result)
    h.step(session)
    await expect(h.runTool(session, 'personal_agent_report', { publication: { mode: 'internal' }, state: 'ready', summary: result, pr_number: 42 }))
      .rejects.toThrow('GitHub is unavailable')
    await h.runTool(session, 'personal_agent_report', { publication: { mode: 'internal' }, state: 'ready', summary: result })
    await h.runtime.idle()
    expect(h.runtime.store.tickets.get(id)?.ended?.outcome).toBe('completed')
    expect(h.relays(h.runtime.masterId)).toContainEqual(expect.objectContaining({ kind: 'worker_report', trigger_id: trigger.id, state: 'ready', summary: result }))
    const reply = { ticket_id: id, purpose: 'result', text: result }
    await h.runTool(h.runtime.masterId, 'personal_agent_reply', reply)
    await h.runtime.sendReplies()
    const folder = join(root, 'personal', 'out')
    const before = readdirSync(folder).sort()
    expect(before).toHaveLength(2)
    expect(before.map(file => JSON.parse(readFileSync(join(folder, file), 'utf8'))))
      .toContainEqual(expect.objectContaining({ text: expect.stringContaining(result), ticket_id: id, reply_to: message.id, thread: message.id }))
    await h.runTool(h.runtime.masterId, 'personal_agent_reply', reply)
    await h.runtime.sendReplies()
    expect(readdirSync(folder).sort()).toEqual(before)
    // Simulate a replay after receive succeeded but before the file was archived.
    writeFileSync(join(input, 'replayed.json'), JSON.stringify(message))
    await pollInbox(h.runtime.context(inboxKind), config, h.runtime.lifetime)
    expect(h.runtime.store.tickets.list()).toHaveLength(1)
    await h.runtime.stop()
    const reopened = new Store(join(h.directory, 'orchestrator.sqlite'))
    try {
      expect(reopened.triggers.get(trigger.id)?.meta.external).toEqual(message.metadata)
      expect(reopened.tickets.get(id)?.ended?.outcome).toBe('completed')
    } finally { reopened.close() }
    expect(process.env).toEqual(inherited)
  } finally { await h.stop() }
})

it('keeps the original service, root subprocess and original worker sessions outside the new preset scope', async () => {
  const h = await startRuntime()
  try {
    const original = { identity: 'original-superagent' }
    h.ctx.reflect.provide('orchestrator', original)
    const scope = h.ctx.isolate('subprocess')
    new PersonalAgentSubprocess(scope)
    const spec = { argv: ['sh', '-c', 'true'], cwd: h.directory, graceMs: 2000,
      stdio: { stdin: 'ignore' as const, stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } },
      env: { PATH: '/foreign/shims', GIT_CONFIG_GLOBAL: '/foreign/config' } }
    scope.subprocess.spawn(spec)
    const captured = h.subprocess.spawn.mock.calls.at(-1)![0]
    expect(captured).toMatchObject({ env: { PATH: h.runtime.execution.environment().PATH, GIT_CONFIG_GLOBAL: h.runtime.execution.environment().GIT_CONFIG_GLOBAL } })
    expect(h.ctx.subprocess).toBe(h.subprocess)
    expect(h.ctx.get('orchestrator')).toBe(original)
    expect(h.ctx.superPersonalAgent.execution.backend).toBe(h.subprocess)
    expect(ticketOfSession('worker-original')).toBeUndefined()
    expect(ticketOfSession(workerSessionId('personal'))).toBe('personal')
    expect(h.runtime.masterId).toMatch(/^spa-main-/)
    await h.runtime.stop()
    expect(h.ctx.get('orchestrator')).toBe(original)
    expect(h.ctx.subprocess).toBe(h.subprocess)
  } finally { await h.stop() }
})
