/** A stable conversation is a timeline, not a subscription broadcast to every task. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { Conversations } from '../src/messaging/conversations.ts'
import { MessageDelivery } from '../src/messaging/delivery.ts'
import { Store } from '../src/app/store.ts'
import type { Trigger } from '../src/core/index.ts'

const cleanup: (() => void)[] = []
afterEach(() => { for (const fn of cleanup.splice(0)) fn() })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'spa-conversation-')), store = new Store(join(root, 'state.sqlite'))
  cleanup.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const manager = new Conversations(store, new MessageDelivery(store))
  const incoming = (id: string, chat = 'chat'): Trigger => ({ id, source: 'im-native', actor: { source: 'im-native', id: 'alice' },
    human: true, addressed: 'direct', text: 'Hello', at: '2026-11-04T01:00:00Z', threads: [{ source: 'im-native', id: chat }],
    channel: { source: 'im-native', thread: chat, address: {} }, meta: { conversationVersion: 1, fingerprint: 'account', conversationId: chat,
      conversationType: 'dm', messageId: id, reply: { messageId: id } } })
  const receive = (id: string, chat?: string) => { const trigger = manager.prepare(incoming(id, chat)); store.triggers.save(trigger); manager.link(trigger); return trigger }
  return { store, manager, incoming, receive }
}
it('keeps sequential messages in the same dialogue and isolates other accounts and chats', () => {
  const h = fixture(), first = h.receive('one'), second = h.receive('two'), other = h.receive('three', 'another')
  expect(first.meta.dialogueSessionId).toBe(second.meta.dialogueSessionId)
  expect(other.meta.dialogueSessionId).not.toBe(first.meta.dialogueSessionId)
  expect(h.manager.authorize(String(first.meta.dialogueSessionId), second.id)).toEqual(second)
  expect(() => h.manager.authorize(String(first.meta.dialogueSessionId), other.id)).toThrow('changed')
  expect(h.store.contexts.refs('session', String(first.meta.dialogueSessionId))).toHaveLength(2)
})
it('resets only dialogue context while preserving history, source identity and repeated command outcomes', () => {
  const h = fixture(), first = h.receive('one'), command = h.receive('new-1'), before = String(first.meta.dialogueSessionId)
  const reset = h.manager.reset(command), next = h.receive('two')
  expect(reset.before).toBe(before)
  expect(next.meta.dialogueSessionId).toBe(reset.after)
  expect(h.manager.history(reset.after).map(trigger => trigger.id)).toEqual(['two'])
  expect(() => h.manager.authorize(before, first.id)).toThrow('changed')
  expect(h.manager.prepare(h.incoming('one'))).toEqual(first)
  const second = h.manager.reset(h.receive('new-2'))
  expect(h.manager.reset(command)).toEqual(reset)
  expect(h.manager.forTrigger(next)?.sessionId).toBe(second.after)
  expect(h.store.triggers.get(first.id)).toEqual(first)
})
it('persists the current generation across restarts', () => {
  const h = fixture(), original = h.receive('new')
  const reset = h.manager.reset(original)
  const restored = new Conversations(h.store, new MessageDelivery(h.store))
  expect(restored.prepare(h.incoming('after')).meta.dialogueSessionId).toBe(reset.after)
  expect(restored.isDialogue(reset.before)).toBe(true)
  expect(restored.forSession(reset.before)).toBeUndefined()
})
