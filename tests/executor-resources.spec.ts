/** Assignment cancellation and resource ownership checks precede every worker wake and restored Session. */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { Commands } from '../src/infra/commands.ts'
import { type PreparedRepository } from '../src/personal/repositories.ts'
import { deferred, waitUntil } from './fixtures/async.ts'
import { feishu, startRuntime, type Host } from './fixtures/host.ts'

let h: Host
beforeEach(async () => {
  h = await startRuntime()
  const path = join(h.directory, 'source-notes')
  await mkdir(path); await writeFile(join(path, 'note.md'), 'Original notes')
  const view = h.runtime.personal.view()
  h.runtime.personal.save({ ...view.config, repositories: [{ id: 'notes', kind: 'directory', path }] }, view.revision)
})
afterEach(async () => { await h.stop() })

async function accept(id: string) {
  const trigger = feishu(id, `@bot Task ${id}`)
  h.runtime.receive(trigger)
  const result = await h.route({ kind: 'accept', trigger_id: trigger.id, title: `Task ${id}`, worktree_name: `task-${id}`,
    acknowledgement: 'Accepted.', resource_ids: ['notes'] })
  const ticketId = (result.ticket as { ticket_id: string }).ticket_id
  return { ticketId, sessionId: `spa-worker-${ticketId}` }
}

it('cancels only the committed ending assignment preparation and frees its launch without waking a worker', async () => {
  const pending = new Map<string, { signal: AbortSignal; finish(): void }>()
  vi.spyOn(h.runtime.repositories, 'prepare').mockImplementation(async (ticketId, _directory, _selection, signal) =>
    new Promise<PreparedRepository[]>((resolve, reject) => {
      const abort = () => { reject(signal.reason) }
      pending.set(ticketId, { signal, finish: () => { signal.removeEventListener('abort', abort); resolve([]) } })
      signal.addEventListener('abort', abort, { once: true })
    }))
  const first = await accept('1'), second = await accept('2')
  try {
    await waitUntil(() => pending.size === 2)
    expect(() => h.runtime.store.atomic(() => { h.runtime.engine.stopTicket(first.ticketId); throw new Error('rollback') })).toThrow('rollback')
    expect(pending.get(first.ticketId)!.signal.aborted).toBe(false)
    h.runtime.engine.stopTicket(first.ticketId)
    expect(pending.get(first.ticketId)!.signal.aborted).toBe(true)
    expect(pending.get(second.ticketId)!.signal.aborted).toBe(false)
    pending.get(second.ticketId)!.finish()
    await h.runtime.idle()
    expect(h.agents.has(first.sessionId)).toBe(false)
    expect(h.relays(first.sessionId)).toHaveLength(0)
    expect(h.runtime.store.tickets.get(first.ticketId)?.ended?.outcome).toBe('stopped')
    expect(h.agents.get(second.sessionId)?.status).toBe('running')
  } finally { for (const preparation of pending.values()) preparation.finish() }
})

it.each(['idle', 'deleted'] as const)('rechecks resource ownership before an %s worker receives follow-up input', async state => {
  const prepare = vi.spyOn(h.runtime.repositories, 'prepare')
  const task = await accept('1'); await h.runtime.idle()
  expect(prepare).toHaveBeenCalledTimes(1)
  h.runtime.receive(feishu('2', 'Follow up while running', { mentions: [], root_id: 'om_1' })); await h.runtime.idle()
  expect(prepare).toHaveBeenCalledTimes(1)
  const ticket = h.runtime.store.tickets.get(task.ticketId)!
  const marker = join(ticket.execution!.directory, 'repositories', 'notes', '.super-personal-agent-resource.json')
  const original = await readFile(marker, 'utf8'); await rm(marker)
  h.agents.get(task.sessionId)!.status = 'idle'
  if (state === 'deleted') h.agents.delete(task.sessionId)
  const before = h.relays(task.sessionId).length, creations = h.controller.create.mock.calls.length
  h.runtime.receive(feishu('3', 'Follow up after idle', { mentions: [], root_id: 'om_1' })); await h.runtime.idle()
  expect(prepare).toHaveBeenCalledTimes(2)
  expect(h.relays(task.sessionId)).toHaveLength(before)
  expect(h.runtime.store.tickets.get(task.ticketId)?.delivery?.error).toContain('ownership changed')
  expect(h.controller.create).toHaveBeenCalledTimes(creations)
  await writeFile(marker, original)
  vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 6000 })
  try { await h.runtime.pump(); await h.runtime.idle() } finally { vi.useRealTimers() }
  expect(h.runtime.store.tickets.get(task.ticketId)?.undelivered).toEqual([])
  expect(h.agents.get(task.sessionId)?.status).toBe('running')
})

it('aborts an idle worker resource check when its assignment ends', async () => {
  const task = await accept('1'); await h.runtime.idle()
  h.agents.get(task.sessionId)!.status = 'idle'
  let preparing: AbortSignal | undefined
  vi.spyOn(h.runtime.repositories, 'prepare').mockImplementation(async (_ticket, _directory, _selection, signal) => {
    preparing = signal
    await new Promise<void>((_resolve, reject) => { signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true }) })
    return []
  })
  const before = h.relays(task.sessionId).length
  h.runtime.receive(feishu('2', 'Wake up', { mentions: [], root_id: 'om_1' }))
  await waitUntil(() => !!preparing)
  h.runtime.engine.stopTicket(task.ticketId); await h.runtime.idle()
  expect(preparing?.aborted).toBe(true)
  expect(h.relays(task.sessionId)).toHaveLength(before)
  expect(h.runtime.store.tickets.get(task.ticketId)?.delivery).toBeUndefined()
})

it.each(['queued', 'source-lookup', 'session-resolution'] as const)('rechecks a routing grant revoked during %s before worker delivery', async stage => {
  const origin = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Prepare a private plan' }], source: { kind: 'user' } }))!
  const response = await h.runTool(h.runtime.masterId, 'personal_agent_submit', { trigger_id: origin.id, title: 'Private plan', worktree_name: 'private-plan' })
  await h.runtime.idle()
  const ticketId = (response.ticket as { ticket_id: string }).ticket_id, sessionId = `spa-worker-${ticketId}`
  const incoming = feishu('cross', '@bot Relevant work context'), view = h.runtime.personal.view()
  const routing = { identities: [{ principalId: 'me', actor: origin.actor }, { principalId: 'me', actor: incoming.actor }],
    grants: [{ principalId: 'me', from: { source: incoming.source, conversation: incoming.channel!.thread },
      to: { source: origin.source, conversation: origin.channel!.thread } }] }
  h.runtime.personal.save({ ...view.config, routing }, view.revision)
  h.runtime.store.triggers.save(incoming)
  const lookup = deferred(), before = h.relays(sessionId).length
  let held = false
  vi.mocked(Commands.prototype.lark).mockImplementation(async args => {
    if (args.includes('+messages-mget') && args.includes('om_cross') && stage !== 'session-resolution') { held = true; await lookup.promise }
    return { users: [], has_more: false }
  })
  if (stage === 'session-resolution') h.controller.resolveAgent.mockImplementation(async id => {
    if (id === sessionId && !held) { held = true; await lookup.promise }
    return h.resolveDefault(id)
  })
  try {
    if (stage === 'queued') await h.runtime.settings.pause(true, 'panel')
    h.runtime.engine.attach(ticketId, incoming.id)
    if (stage !== 'queued') await waitUntil(() => held)
    const current = h.runtime.personal.view()
    h.runtime.personal.save({ ...current.config, routing: { ...routing, grants: [] } }, current.revision)
    if (stage === 'queued') await h.runtime.settings.pause(false, 'panel')
    lookup.resolve(); await h.runtime.idle()
    expect(held).toBe(stage !== 'queued')
    expect(h.relays(sessionId)).toHaveLength(before)
    expect(h.runtime.store.tickets.get(ticketId)?.delivery?.error).toContain('Routing permission')
    expect(h.runtime.store.tickets.get(ticketId)?.undelivered).toHaveLength(1)
  } finally { lookup.resolve() }
})
