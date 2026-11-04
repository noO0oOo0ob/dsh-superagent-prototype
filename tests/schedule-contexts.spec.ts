/** Derived task metadata uses a trusted, durable parent ledger rather than sender-controlled references. */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { Store } from '../src/app/store.ts'
import { contextRef } from '../src/core/context.ts'
import type { Trigger } from '../src/core/index.ts'
import { startRuntime } from './fixtures/host.ts'

const event = (id: string): Trigger => ({ id, source: 'main', actor: { source: 'main', id: 'owner' }, human: true,
  addressed: 'direct', threads: [{ source: 'main', id }], at: '2026-11-04T00:00:00.000Z', text: id, meta: {} })

it('persists verified parents, rolls back failed intake and never grants access from metadata alone', () => {
  const directory = mkdtempSync(join(tmpdir(), 'personal-parent-context-'))
  let store = new Store(join(directory, 'state.sqlite'))
  try {
    const original = event('original'), unrelated = event('unrelated'), child = event('derived')
    store.triggers.save(original); store.triggers.save(unrelated)
    const forged = { ...event('forged'), meta: { originalContext: contextRef(original.id), originalTriggerId: original.id } }
    store.triggers.save(forged)
    expect(store.contexts.references([contextRef(forged.id)])).toEqual([contextRef(forged.id)])
    expect(() => store.atomic(() => { store.contexts.parent(child, original); store.triggers.save(child); throw new Error('intake failed') })).toThrow('intake failed')
    expect(store.contexts.get(contextRef(child.id).id)).toBeUndefined()
    expect(store.contexts.references([contextRef(child.id)])).toEqual([contextRef(child.id)])
    store.atomic(() => { store.contexts.parent(child, original); store.triggers.save(child) })
    expect(() => store.contexts.parent(child, unrelated)).toThrow('replace')
    expect(() => store.contexts.parent(forged, original)).toThrow('before')
    expect(() => store.contexts.parent(original, child)).toThrow()
    const next = event('derived-again'), chain = [contextRef(next.id), contextRef(child.id), contextRef(original.id)]
    store.atomic(() => { store.contexts.parent(next, child); store.triggers.save(next) })
    store.receipts.add({ id: 'derived-reply', kind: 'notice', text: 'Recorded only',
      channel: { source: 'main', thread: next.id, address: { triggerId: next.id } } })
    expect(store.contexts.refs('delivery', 'derived-reply')).toEqual(chain)
    store.close(); store = new Store(join(directory, 'state.sqlite'))
    expect(store.contexts.references([contextRef(child.id), contextRef(original.id)])).toEqual([contextRef(child.id), contextRef(original.id)])
    expect(store.contexts.references([contextRef(next.id)])).toEqual(chain)
    expect(store.contexts.refs('delivery', 'derived-reply')).toEqual(chain)
    expect(() => store.contexts.parent(child, original)).not.toThrow()
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
})

it('lets a real scheduled worker read only its approving context and retains the references through results and restart', async () => {
  const h = await startRuntime(store => store.saveSettings({ ...store.settings(), sources: {} }))
  try {
    const origin = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'Research a short trip at the scheduled time' }], source: { kind: 'user' } }))!
    const unrelated = h.runtime.main.capture(createUserMessage({ content: [{ type: 'text', text: 'An unrelated private discussion' }], source: { kind: 'user' } }))!
    h.runtime.schedules.create({ id: 'trip-context', title: 'Trip', text: 'Research a short trip', originTriggerId: origin.id,
      when: { kind: 'once', at: new Date(Date.now() - 1000).toISOString() } })
    await h.runtime.pump(); await h.runtime.idle()
    const run = h.runtime.schedules.runs()[0]!
    const decision = h.runtime.engine.decide(run.trigger.id, { kind: 'accept', title: 'Trip', scope: 'Research a short trip', name: 'trip-context', reason: 'Scheduled instruction' })
    await h.runtime.idle()
    const ticket = h.runtime.store.tickets.get(decision.ticketId!)!, sessionId = `spa-worker-${ticket.id}`
    const expected = [contextRef(run.trigger.id), contextRef(origin.id)]
    expect(h.runtime.store.contexts.refs('ticket', ticket.id)).toEqual(expected)
    expect(h.runtime.store.contexts.refs('assignment', ticket.assignments.at(-1)!.id)).toEqual(expected)
    expect(h.runtime.store.contexts.refs('session', sessionId)).toEqual(expected)
    expect(JSON.stringify(await h.runTool(sessionId, 'personal_agent_read', { resource: `context/${contextRef(origin.id).id}` }))).toContain(origin.meta.messageId)
    await expect(h.runTool(sessionId, 'personal_agent_read', { resource: `context/${contextRef(unrelated.id).id}` })).rejects.toThrow()
    await h.runTool(sessionId, 'personal_agent_report', { state: 'ready', summary: 'The scheduled travel research is ready.' })
    await h.runtime.idle()
    const updated = h.runtime.store.tickets.get(ticket.id)!, assignment = updated.assignments.at(-1)!
    expect(h.runtime.store.contexts.refs('report', `${assignment.id}:${assignment.report!.at}`)).toEqual(expected)
    const result = h.runtime.results.list(ticket.id)[0]!
    expect(result.contexts).toEqual(expected)
    const reopened = new Store(join(h.directory, 'orchestrator.sqlite'))
    try {
      expect(reopened.contexts.references([contextRef(run.trigger.id)])).toEqual(expected)
      expect(reopened.contexts.refs('ticket', ticket.id)).toEqual(expected)
      expect(reopened.contexts.refs('report', `${assignment.id}:${assignment.report!.at}`)).toEqual(expected)
    } finally { reopened.close() }
  } finally { await h.stop() }
})
