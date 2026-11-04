/** Context references survive follow-ups and restarts and retain worker read isolation. */
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Store } from '../src/app/store.ts'
import { contextRef, messageContext } from '../src/core/context.ts'
import type { Trigger } from '../src/core/index.ts'
import { startRuntime } from './fixtures/host.ts'

const message = (id: string, root = id): Trigger => ({ id, source: 'local-test',
  actor: { source: 'local-test', id: 'owner' }, human: true, addressed: 'direct',
  threads: [{ source: 'local-test', id: root }], at: new Date().toISOString(), text: 'Prepare a travel plan',
  meta: { external: { traceId: 'external-trace', source: 'forged', accountId: 'owner-account' } } })

it('projects only provided scalar source fields while leaving full metadata behind its context reference', () => {
  const source = message('projection'), fields = { channel: 'feishu', botId: 'bot-1', senderName: 'Alice', conversationTitle: 'Trip',
    conversationId: 'chat-1', conversationType: 'group', threadId: 'thread-1', messageId: 'message-1', sentAt: source.at }
  const full = { ...source, meta: { ...fields, fingerprint: 'a'.repeat(64), token: 'private-token', raw: { private: true } } }
  expect(messageContext(full)).toEqual({ ...contextRef(source.id), source: source.source, actor: source.actor,
    threads: source.threads, ...fields, read: `context/${contextRef(source.id).id}` })
  const omitted = messageContext({ ...source, meta: { senderName: { secret: 'do not stringify' }, conversationTitle: '', messageId: 42 } })
  expect(omitted).not.toHaveProperty('senderName')
  expect(omitted).not.toHaveProperty('conversationTitle')
  expect(omitted).not.toHaveProperty('messageId')
  expect(omitted).not.toHaveProperty('sentAt')
  expect(full.meta).toHaveProperty('token', 'private-token')
})

it('retains separate source records through routing, attempts, worker reports and reopening the database', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(),
    policy: { ...store.settings().policy, sources: { 'local-test': { allowed: [{ id: 'owner' }] } } } }))
  try {
    const initial = message('trip'), { ticket, sessionId } = await h.acceptedTicket(initial)
    const first = contextRef(initial.id)
    expect(h.runtime.store.contexts.refs('ticket', ticket.id)).toEqual([first])
    expect(h.runtime.store.contexts.refs('session', sessionId)).toEqual([first])
    const body = await h.runTool(sessionId, 'personal_agent_read', { resource: `context/${first.id}` })
    expect(JSON.stringify(body)).toContain('owner-account')
    expect(first.traceId).not.toBe('external-trace')
    await h.runTool(sessionId, 'personal_agent_report', { publication: { mode: 'internal' }, state: 'progress', summary: 'Drafting the travel plan.' })
    const waiting = h.runtime.store.tickets.get(ticket.id)!.assignments.at(-1)!
    const oldReport = `${waiting.id}:${waiting.report!.at}`
    expect(h.runtime.store.contexts.refs('report', oldReport)).toEqual([first])
    const followup = message('trip-followup', 'trip')
    h.runtime.receive(followup); await h.runtime.idle()
    expect(h.runtime.store.contexts.refs('ticket', ticket.id)).toEqual([first, contextRef(followup.id)])
    expect(h.runtime.store.contexts.refs('report', oldReport)).toEqual([first])
    h.runtime.receive(message('other'))
    await expect(h.runTool(sessionId, 'personal_agent_read', { resource: `context/${contextRef('other').id}` })).rejects.toThrow()
    h.runtime.store.db.exec("DELETE FROM kv WHERE key LIKE 'personal-context%'")
    const migrated = new Store(join(h.directory, 'orchestrator.sqlite'))
    try { expect(migrated.contexts.refs('report', oldReport)).toEqual([first]) } finally { migrated.close() }
    await h.runTool(sessionId, 'personal_agent_report', { publication: { mode: 'internal' }, state: 'ready', summary: 'Travel plan is ready.' })
    await h.runtime.idle()
    const updated = h.runtime.store.tickets.get(ticket.id)!, assignment = updated.assignments.at(-1)!
    expect(h.runtime.store.contexts.refs('report', `${assignment.id}:${assignment.report!.at}`)).toContainEqual(first)
    h.runtime.store.db.exec("DELETE FROM kv WHERE key LIKE 'personal-context%'")
    const reopened = new Store(join(h.directory, 'orchestrator.sqlite'))
    try {
      expect(reopened.contexts.get(first.id)?.actor).toEqual(initial.actor)
      expect(reopened.contexts.refs('ticket', ticket.id)).toHaveLength(2)
    } finally { reopened.close() }
  } finally { await h.stop() }
})

it('associates the entire accepted batch with the assignment and its report', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), paused: true,
    policy: { ...store.settings().policy, sources: { 'local-test': { allowed: [{ id: 'owner' }] } } } }))
  try {
    h.runtime.receive(message('batch-a', 'batch'))
    h.runtime.receive(message('batch-b', 'batch'))
    h.runtime.store.saveSettings({ ...h.runtime.store.settings(), paused: false })
    await h.runtime.pump()
    await h.runtime.idle()
    await h.route({ kind: 'accept', trigger_id: 'batch-a', title: 'Travel', worktree_name: 'travel', acknowledgement: 'Planning the trip.' })
    await h.runtime.idle()
    const ticket = h.runtime.store.tickets.list()[0]!
    const refs = h.runtime.store.contexts.refs('assignment', ticket.assignments.at(-1)!.id)
    for (const id of ticket.origin.triggerIds) expect(refs).toContainEqual(contextRef(id))
    expect(refs).toContainEqual(contextRef('batch-b'))
  } finally { await h.stop() }
})

it('rolls back context capture with rejected transactions and keeps the first event reference immutable', async () => {
  const h = await startRuntime()
  try {
    const store = h.runtime.store, original = message('immutable')
    expect(() => store.atomic(() => { store.triggers.save(original); throw new Error('rollback') })).toThrow('rollback')
    expect(store.contexts.get(contextRef(original.id).id)).toBeUndefined()
    store.triggers.save(original)
    store.contexts.capture({ ...original, actor: { source: 'other', id: 'other' } })
    expect(store.contexts.get(contextRef(original.id).id)?.actor).toEqual(original.actor)
  } finally { await h.stop() }
})
