/** Card callbacks cannot borrow another sender, message or conversation generation. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Store } from '../src/app/store.ts'
import { MessageDelivery } from '../src/messaging/delivery.ts'
import { Conversations } from '../src/messaging/conversations.ts'
import { MessageActions } from '../src/messaging/actions.ts'
import type { Trigger } from '../src/core/index.ts'
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach(fn => fn()))
it('requires the original actor and delivered card, executes once, and rejects old contexts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'spa-actions-')), store = new Store(join(root, 'state.sqlite'))
  cleanup.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  let permitted = true
  const delivery = new MessageDelivery(store), conversations = new Conversations(store, delivery), actions = new MessageActions(store, conversations, delivery, () => permitted)
  const trigger = conversations.prepare({ id: 'input', source: 'im-native', threads: [{ source: 'im-native', id: 'chat' }],
    actor: { source: 'im-native', id: 'alice' }, human: true, at: '2026-11-04T01:00:00Z', text: '/menu',
    channel: { source: 'im-native', thread: 'chat', address: {} }, meta: { conversationVersion: 1, botId: 'bot',
      fingerprint: 'account', conversationId: 'chat', conversationType: 'group', messageId: 'original' } } satisfies Trigger)
  store.triggers.save(trigger)
  const menu = actions.menu(trigger), callback = { operator: { open_id: 'alice' }, context: { open_message_id: 'card', open_chat_id: 'chat' },
    action: { value: { spaAction: menu[0]!.actionId } } }, run = vi.fn()
  expect(actions.receive('bot', callback, run).toast.type).toBe('error')
  await delivery.deliver({ id: 'menu', channel: trigger.channel!, text: 'Menu', kind: 'reply',
    blocks: [{ type: 'card', title: 'Menu', text: 'Choose', actions: menu }] },
    { supported: ['card'], send: async () => ({ providerMessageIds: ['card'] }) }, new AbortController().signal)
  expect(actions.receive('other-bot', callback, run).toast.type).toBe('error')
  expect(actions.receive('bot', { ...callback, operator: { open_id: 'bob' } }, run).toast.type).toBe('error')
  permitted = false
  expect(actions.receive('bot', callback, run).toast.type).toBe('error')
  expect(run).not.toHaveBeenCalled()
  permitted = true
  expect(actions.receive('bot', callback, run).toast.type).toBe('success')
  expect(actions.receive('bot', callback, run).toast.type).toBe('info')
  expect(run).toHaveBeenCalledOnce()
  expect(run.mock.calls[0]![0]).toMatchObject({ text: '/tasks', meta: { virtual: true } })
  conversations.reset(trigger)
  expect(actions.receive('bot', { ...callback, action: { value: { spaAction: menu[2]!.actionId } } }, run).toast.type).toBe('error')
  expect(run).toHaveBeenCalledOnce()
})
