/** Explicit source identity never silently merges task contexts. */
import { expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../src/app/store.ts'
import { Routing, RoutingConfigSchema } from '../src/personal/routing.ts'
import { key, type Ticket, type Trigger } from '../src/core/index.ts'
import { contextRef } from '../src/core/context.ts'
import { startRuntime, feishu } from './fixtures/host.ts'

it('requires both an explicit principal match and a directional conversation grant', () => {
  const directory = mkdtempSync(join(tmpdir(), 'spa-routing-')), store = new Store(join(directory, 'state.sqlite'))
  const origin: Trigger = { id: 'a', source: 'im-work', actor: { source: 'im-work', id: 'alice' }, human: true, at: '2026-11-04T00:00:00Z', text: 'Research',
    threads: [{ source: 'im-work', id: 'thread-a' }], meta: { conversationId: 'work-chat' } }
  const incoming: Trigger = { ...origin, id: 'b', source: 'im-home', actor: { source: 'im-home', id: 'alice' }, threads: [{ source: 'im-home', id: 'thread-b' }], meta: { conversationId: 'home-chat' } }
  const ticket: Ticket = { id: 'task', title: 'Research', decisionId: 'decision', origin: { triggerId: origin.id, triggerIds: [origin.id] },
    inputs: [], channels: [], assignments: [], undelivered: [], createdAt: origin.at, updatedAt: origin.at,
    mandate: { strength: 'explicit', policyVersion: 'policy', basis: { via: 'listed' }, actor: origin.actor, scope: 'Research' } }
  let config = RoutingConfigSchema.parse({}), revision = 0
  const routing = new Routing(store, () => ({ revision, routing: config }))
  try {
    store.triggers.save(origin); store.triggers.save(incoming)
    expect(() => routing.attach(ticket, incoming)).toThrow('another source')
    expect(routing.list()[0]!.allowed).toBe(false)
    config = RoutingConfigSchema.parse({ identities: [{ principalId: 'me', actor: origin.actor }, { principalId: 'me', actor: incoming.actor }] }); revision++
    expect(() => routing.attach(ticket, incoming)).toThrow('another source')
    config = RoutingConfigSchema.parse({ ...config, grants: [{ principalId: 'me', from: { source: incoming.source, conversation: 'home-chat' }, to: { source: origin.source, conversation: 'work-chat' } }] }); revision++
    expect(() => routing.attach(ticket, incoming)).not.toThrow()
    expect(routing.list().find(item => item.revision === revision)?.reason).toBe('explicit_identity_grant')
    const decisions = routing.list()
    expect(routing.permits(ticket, incoming)).toBe(true)
    expect(routing.permits(ticket, incoming)).toBe(true)
    expect(routing.list()).toEqual(decisions)
    config = RoutingConfigSchema.parse({ ...config, grants: [] }); revision++
    expect(routing.permits(ticket, incoming)).toBe(false)
    expect(routing.permits(ticket, origin)).toBe(true)
    expect(routing.permits({ ...ticket, origin: { ...ticket.origin, triggerIds: [origin.id, incoming.id] } }, incoming)).toBe(true)
    expect(() => routing.attach(ticket, { ...incoming, meta: { conversationId: 'another-chat' } })).toThrow()
    expect(() => routing.follow(ticket, { source: 'main', id: 'unknown' })).toThrow('unknown personal')
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
})

it('revokes followed-conversation fanout and fresh worker reads when a routing grant is removed', async () => {
  const h = await startRuntime()
  try {
    const { ticket, sessionId, trigger: origin } = await h.acceptedTicket(feishu('1', '@bot Research'))
    const incoming: Trigger = { id: 'home-1', source: 'im-home', actor: { source: 'im-home', id: 'home-owner' }, human: true,
      addressed: 'mention', threads: [{ source: 'im-home', id: 'home-thread' }], at: '2026-11-04T01:00:00Z', text: 'Private home context',
      meta: { conversationId: 'home-chat', fingerprint: 'a'.repeat(64) } }
    h.runtime.receive(incoming)
    const current = h.runtime.personal.view()
    const routing = RoutingConfigSchema.parse({ identities: [{ principalId: 'me', actor: origin.actor }, { principalId: 'me', actor: incoming.actor }],
      grants: [{ principalId: 'me', from: { source: incoming.source, conversation: 'home-chat', account: 'a'.repeat(64) }, to: { source: origin.source, conversation: origin.channel!.thread } }] })
    h.runtime.personal.save({ ...current.config, routing }, current.revision)
    await h.runTool(sessionId, 'personal_agent_thread_follow', { thread: 'im-home:home-thread', reason: 'Owner explicitly linked these conversations' })
    const allowed = { ...incoming, id: 'home-2', at: '2026-11-04T01:01:00Z', text: 'Allowed before grant removal' }
    h.runtime.receive(allowed)
    await h.runtime.idle()
    const recorded = h.runtime.store.tickets.get(ticket.id)!
    const input = recorded.inputs.find(item => item.kind === 'trigger' && item.triggerId === allowed.id)!
    expect(input).toMatchObject({ context: true })
    expect(await h.runTool(sessionId, 'personal_agent_read', { resource: `trigger/${allowed.id}` })).toMatchObject({ trigger_id: allowed.id })
    const before = h.runtime.routing.list()
    const latest = h.runtime.personal.view()
    h.runtime.personal.save({ ...latest.config, routing: { ...routing, grants: [] } }, latest.revision)
    h.deliveries.mockClear()
    const denied = { ...incoming, id: 'home-3', at: '2026-11-04T01:02:00Z', text: 'Private after grant removal' }
    expect(h.runtime.receive(denied)).toBe('stored')
    await h.runtime.idle()
    expect(h.runtime.store.triggers.disposition(denied.id)?.fanout).not.toContain(ticket.id)
    expect(h.runtime.store.tickets.get(ticket.id)!.inputs.some(item => item.kind === 'trigger' && item.triggerId === denied.id)).toBe(false)
    expect(h.relays(sessionId)).toEqual([])
    for (const resource of [`trigger/${allowed.id}`, `context/${contextRef(allowed.id).id}`, `ticket/${ticket.id}/input/${key(input.id)}`,
      `ticket/${ticket.id}/transcript`, `ticket/${ticket.id}/message/0`])
      await expect(h.runTool(sessionId, 'personal_agent_read', { resource })).rejects.toThrow()
    const inputs = await h.runTool(sessionId, 'personal_agent_read', { resource: `ticket/${ticket.id}/inputs` })
    expect(JSON.stringify(inputs)).not.toContain(allowed.id)
    const thread = await h.runTool(sessionId, 'personal_agent_read', { resource: 'thread/im-home:home-thread' })
    expect(JSON.stringify(thread)).not.toContain(allowed.text)
    expect(JSON.stringify(thread)).not.toContain(denied.text)
    expect(await h.runTool(sessionId, 'personal_agent_read', { resource: `trigger/${origin.id}` })).toMatchObject({ trigger_id: origin.id })
    expect(h.runtime.routing.list()).toEqual(before)
  } finally { await h.stop() }
})

it('requires exact account fingerprints in grants and does not reuse a conversation after an account switch', () => {
  const directory = mkdtempSync(join(tmpdir(), 'spa-routing-account-')), store = new Store(join(directory, 'state.sqlite'))
  const origin: Trigger = { id: 'work-before', source: 'im-work', actor: { source: 'im-work', id: 'owner' }, human: true,
    at: '2026-11-04T00:00:00Z', text: 'Original account', threads: [{ source: 'im-work', id: 'old-thread' }],
    meta: { conversationId: 'same-chat', fingerprint: 'a'.repeat(64) } }
  const replacement: Trigger = { ...origin, id: 'work-after', text: 'Replacement account', threads: [{ source: 'im-work', id: 'new-thread' }],
    meta: { conversationId: 'same-chat', fingerprint: 'b'.repeat(64) } }
  const ticket: Ticket = { id: 'account-task', title: 'Research', decisionId: 'decision', origin: { triggerId: origin.id, triggerIds: [origin.id] },
    inputs: [], channels: [], assignments: [], undelivered: [], createdAt: origin.at, updatedAt: origin.at,
    mandate: { strength: 'explicit', policyVersion: 'policy', basis: { via: 'listed' }, actor: origin.actor, scope: 'Research' } }
  let config = RoutingConfigSchema.parse({ identities: [{ principalId: 'me', actor: origin.actor }] })
  const routing = new Routing(store, () => ({ revision: 0, routing: config }))
  try {
    store.triggers.save(origin)
    expect(routing.permits(ticket, replacement)).toBe(false)
    const from = { source: replacement.source, conversation: 'same-chat' }, to = { source: origin.source, conversation: 'same-chat' }
    config = RoutingConfigSchema.parse({ ...config, grants: [{ principalId: 'me', from, to }] })
    expect(routing.permits(ticket, replacement)).toBe(false)
    config = RoutingConfigSchema.parse({ ...config, grants: [{ principalId: 'me', from: { ...from, account: 'b'.repeat(64) }, to: { ...to, account: 'a'.repeat(64) } }] })
    expect(routing.permits(ticket, replacement)).toBe(true)
    expect(routing.permits(ticket, { ...replacement, meta: { ...replacement.meta, fingerprint: 'c'.repeat(64) } })).toBe(false)
    expect(routing.permits(ticket, origin)).toBe(true)
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }) }
})

it('reads an explicit Main continuation without granting the worker access to other Main requests', async () => {
  const h = await startRuntime()
  try {
    const { ticket, sessionId } = await h.acceptedTicket(feishu('1', '@bot Research'))
    const continuation: Trigger = { id: 'main-continue', source: 'main', actor: { source: 'main', id: 'owner' }, human: true,
      addressed: 'direct', threads: [{ source: 'main', id: 'continue' }], at: '2026-11-04T01:00:00Z', text: 'Continue with this detail', meta: {} }
    const unrelated: Trigger = { ...continuation, id: 'main-private', threads: [{ source: 'main', id: 'private' }], text: 'Separate private request' }
    h.runtime.store.triggers.save(continuation); h.runtime.store.triggers.save(unrelated)
    h.runtime.engine.attach(ticket.id, continuation.id)
    await h.runtime.idle()
    expect(await h.runTool(sessionId, 'personal_agent_read', { resource: `trigger/${continuation.id}` })).toMatchObject({ trigger_id: continuation.id })
    expect(h.runtime.routing.permits(h.runtime.store.tickets.get(ticket.id)!, unrelated)).toBe(false)
    await expect(h.runTool(sessionId, 'personal_agent_thread_follow', { thread: 'main:private', reason: 'Read unrelated Main discussion' })).rejects.toThrow('another source')
    await expect(h.runTool(sessionId, 'personal_agent_read', { resource: `trigger/${unrelated.id}` })).rejects.toThrow()
  } finally { await h.stop() }
})

it('keeps legacy source routing but blocks an IM worker from following another personal conversation', async () => {
  const h = await startRuntime()
  try {
    const { ticket, sessionId } = await h.acceptedTicket(feishu('1', '@bot Research'))
    const incoming: Trigger = { id: 'personal-im', source: 'im-private', actor: { source: 'im-private', id: 'other' }, human: true,
      threads: [{ source: 'im-private', id: 'private' }], at: new Date().toISOString(), text: 'Private request', meta: { conversationId: 'private' } }
    h.runtime.store.triggers.save(incoming)
    expect(() => h.runtime.engine.attach(ticket.id, incoming.id)).toThrow('another source')
    await expect(h.runTool(sessionId, 'personal_agent_thread_follow', { thread: 'im-private:private', reason: 'Related topic' })).rejects.toThrow('another source')
    expect(h.runtime.store.tickets.get(ticket.id)!.inputs.some(item => item.kind === 'trigger' && item.triggerId === incoming.id)).toBe(false)
  } finally { await h.stop() }
})

it('rejects duplicate account bindings rather than inferring identity from display names', () => {
  expect(() => RoutingConfigSchema.parse({ identities: [{ principalId: 'one', actor: { source: 'im-home', id: 'u' } },
    { principalId: 'two', actor: { source: 'im-home', id: 'u' } }] })).toThrow('one principal')
})
