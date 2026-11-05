/** Group targeting keeps bot-specific decisions durable across retries and role changes. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Store } from '../src/app/store.ts'
import { GroupTargets } from '../src/messaging/group-targets.ts'
import { ConnectorConfigSchema } from '../src/personal/config.ts'
import { ImEventSchema, type ConnectorService } from '../src/connectors/protocol.ts'

const cleanups: (() => void)[] = []
afterEach(() => { for (const fn of cleanups.splice(0).reverse()) fn() })
const account = (id: string) => ConnectorConfigSchema.parse({ id, provider: 'feishu', channel: 'feishu', enabled: true, intake: 'account', botId: id, fingerprint: (id === 'one' ? 'a' : 'b').repeat(64) })
const event = (id = 'one', messageId = 'm1', fields = {}) => ImEventSchema.parse({ version: 1, channel: 'feishu', botId: id, fingerprint: account(id).fingerprint,
  eventId: messageId, messageId, actor: { kind: 'user', id: 'owner' }, conversation: { kind: 'group', id: 'chat' },
  mentionedAccount: false, at: '2026-11-05T10:00:00Z', text: '/new', reply: { messageId, conversationId: 'chat', actorId: 'owner' },
  groupScope: { tenantId: 'tenant', groupId: 'chat' }, ...fields })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'spa-groups-')), store = new Store(join(root, 'store.sqlite'))
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  let configs = [account('one'), account('two')]
  const targeting = new GroupTargets(store, () => configs)
  const receive = vi.fn(async () => {}), replyOwner = vi.fn<NonNullable<ConnectorService['replyOwner']>>(async () => 'user')
  const intake = (id = 'one', messageId = 'm1', fields = {}) => targeting.accept(account(id), event(id, messageId, fields), replyOwner, () => {}, receive)
  const setDefault = (connectorId: string | null) => { const group = targeting.groups()[0]!; return targeting.setDefault(group.id, group.revision, connectorId) }
  return { store, targeting, receive, replyOwner, intake, setDefault, configure: (next: typeof configs) => { configs = next } }
}
it('handles one or two explicit bot mentions independently and deduplicates each bot event', async () => {
  const h = fixture()
  await h.intake('one', 'm1', { mentionedAccount: true })
  await h.intake('two', 'm1', { mentions: [{ id: 'peer', key: '@bot' }] })
  expect(h.receive).toHaveBeenCalledTimes(1)
  await h.intake('one', 'm2', { mentionedAccount: true })
  await h.intake('two', 'm2', { mentionedAccount: true })
  await h.intake('two', 'm2', { mentionedAccount: true })
  expect(h.receive).toHaveBeenCalledTimes(3)
})
it('never treats an arbitrary parentId as a reply to this bot and lets explicit mentions win', async () => {
  const h = fixture(), reply = { ...event().reply, parentId: 'parent' }
  await h.intake('one', 'm1', { reply }); expect(h.receive).not.toHaveBeenCalled()
  h.replyOwner.mockResolvedValueOnce('self')
  await h.intake('one', 'm2', { reply: { ...reply, messageId: 'm2' } }); expect(h.receive).toHaveBeenCalledOnce()
  h.replyOwner.mockResolvedValueOnce('other')
  await h.intake('one', 'm3', { mentionedAccount: true, reply: { ...reply, messageId: 'm3' } })
  expect(h.replyOwner).toHaveBeenCalledTimes(2)
  expect(h.receive).toHaveBeenCalledTimes(2)
})
it('uses one explicit default for a verified group and never substitutes another bot', async () => {
  const h = fixture(); await h.intake(); await h.intake('two')
  expect(h.receive).not.toHaveBeenCalled()
  h.setDefault('one')
  await h.intake('one', 'm2'); await h.intake('two', 'm2')
  expect(h.receive).toHaveBeenCalledOnce()
  h.configure([account('two')])
  await h.intake('two', 'm3'); expect(h.receive).toHaveBeenCalledOnce()
})
it('keeps an original decision through restart and a default change', async () => {
  const h = fixture(); await h.intake(); h.setDefault('one')
  const restarted = new GroupTargets(h.store, () => [account('one'), account('two')])
  await restarted.accept(account('one'), event(), h.replyOwner, () => {}, h.receive)
  expect(h.receive).not.toHaveBeenCalled()
  await h.intake('one', 'm2'); expect(h.receive).toHaveBeenCalledOnce()
})
it('preserves pending acceptance after an intake failure and serializes duplicate callbacks', async () => {
  const h = fixture(); h.receive.mockRejectedValueOnce(new Error('storage unavailable'))
  await expect(h.intake('one', 'm1', { mentionedAccount: true })).rejects.toThrow('storage unavailable')
  await Promise.all([h.intake('one', 'm1', { mentionedAccount: true }), h.intake('one', 'm1', { mentionedAccount: true })])
  expect(h.receive).toHaveBeenCalledTimes(2)
})
it('does not fall back to the default when reply ownership cannot be checked', async () => {
  const h = fixture(); await h.intake(); h.setDefault('one')
  h.replyOwner.mockRejectedValueOnce(new Error('offline'))
  await h.intake('one', 'm2', { reply: { ...event('one', 'm2').reply, parentId: 'parent' } })
  expect(h.receive).not.toHaveBeenCalled()
  expect(h.targeting.decisions()[0]).toMatchObject({ reason: 'reply-unverified', accepted: false })
})
it('refuses stale group edits, unobserved accounts and groups without provider scope', async () => {
  const h = fixture(); await h.intake('one', 'm1', { groupScope: undefined })
  expect(h.targeting.groups()).toEqual([])
  await h.intake('one', 'm2'); const group = h.targeting.groups()[0]!
  expect(() => h.setDefault('two')).toThrow('not observed')
  h.setDefault('one')
  expect(() => h.targeting.setDefault(group.id, group.revision, null)).toThrow('changed')
})
it('does not accept a callback after its account authorization is revoked', async () => {
  const h = fixture(), pending = Promise.withResolvers<'self'>()
  h.replyOwner.mockReturnValueOnce(pending.promise)
  let allowed = true
  const accepting = h.targeting.accept(account('one'), event('one', 'm1', { reply: { ...event().reply, parentId: 'parent' } }), h.replyOwner,
    () => { if (!allowed) throw new Error('revoked') }, h.receive)
  allowed = false; pending.resolve('self')
  await expect(accepting).rejects.toThrow('revoked')
  expect(h.receive).not.toHaveBeenCalled()
})

it('freezes a group message default before another bot receives its delayed callback', async () => {
  const h = fixture(); await h.intake(); await h.intake('two'); h.setDefault('one')
  await h.intake('one', 'new-command'); h.setDefault('two')
  await h.intake('two', 'new-command')
  expect(h.receive).toHaveBeenCalledOnce()
  const restarted = new GroupTargets(h.store, () => [account('one'), account('two')])
  await restarted.accept(account('two'), event('two', 'new-command'), h.replyOwner, () => {}, h.receive)
  expect(h.receive).toHaveBeenCalledOnce()
})
it('marks a default unavailable as soon as its binding is disabled or replaced', async () => {
  const h = fixture(); await h.intake(); h.setDefault('one')
  h.configure([{ ...account('one'), enabled: false }, account('two')])
  expect(h.targeting.view()[0]).toMatchObject({ defaultAvailable: false, accounts: [expect.objectContaining({ available: false })] })
})
