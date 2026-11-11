/** Rich publication recovery never resends successful content or hides missing files. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Store } from '../src/app/store.ts'
import { MessageDelivery, DeliveryFailure, deliveryState, type DeliveryAdapter } from '../src/messaging/delivery.ts'
import { attributedBlocks } from '../src/messaging/attribution.ts'
import { prepareFeishuBlocks } from '../src/connectors/native-delivery.ts'
import { PublicationSchema } from '../src/messaging/content.ts'
import type { OutboundMessage } from '../src/core/index.ts'

const cleanup: (() => void)[] = []
afterEach(() => { for (const fn of cleanup.splice(0)) fn() })
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'spa-delivery-')), store = new Store(join(root, 'state.sqlite'))
  cleanup.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const center = new MessageDelivery(store)
  const message: OutboundMessage = { id: 'publication', kind: 'notice', text: 'Ready', channel: { source: 'im-account', thread: 'chat', address: { chat: 'chat' } },
    blocks: [{ type: 'text', text: 'Ready', format: 'markdown' }, { type: 'image', artifactId: 'chart' }, { type: 'file', artifactId: 'report' }] }
  const send = vi.fn<DeliveryAdapter['send']>(async (_block, options) => ({ providerMessageIds: [options.id] }))
  const adapter: DeliveryAdapter = { supported: ['text', 'image', 'file'], send }
  const signal = new AbortController().signal
  return { store, center, message, send, adapter, signal }
}
it('retries only the failed file after ordered text and image succeeded, including after restart', async () => {
  const h = setup()
  h.send.mockImplementation(async (block, options) => {
    if (block.type === 'file') { options.uploaded('uploaded-file'); throw new DeliveryFailure('failed', 'permission-denied') }
    return { providerMessageIds: [options.id] }
  })
  await expect(h.center.deliver(h.message, h.adapter, h.signal)).rejects.toThrow('not completely')
  expect(deliveryState(h.center.get(h.message.id)!)).toBe('partial')
  expect(h.send.mock.calls.map(([part]) => part.type)).toEqual(['text', 'image', 'file'])
  h.send.mockClear().mockImplementation(async (_block, options) => {
    expect(options.resourceKey).toBe('uploaded-file'); return { providerMessageIds: ['final-file'] }
  })
  const restored = new MessageDelivery(h.store)
  await restored.deliver(h.message, h.adapter, h.signal)
  await restored.deliver(h.message, h.adapter, h.signal)
  expect(h.send).toHaveBeenCalledTimes(1)
  expect(deliveryState(restored.get(h.message.id)!)).toBe('sent')
})
it('blocks unknown outcomes until explicit reconciliation and shares concurrent publication attempts', async () => {
  const h = setup()
  h.send.mockRejectedValueOnce(new Error('network timeout'))
  const one = h.center.deliver(h.message, h.adapter, h.signal), two = h.center.deliver(h.message, h.adapter, h.signal)
  expect(two).toBe(one)
  await expect(one).rejects.toThrow()
  await expect(h.center.deliver(h.message, h.adapter, h.signal)).rejects.toThrow()
  expect(h.send).toHaveBeenCalledTimes(1)
  const first = h.center.get(h.message.id)!.parts[0]!
  h.center.reconcile(h.message.id, first.id, 'confirm_sent', 'Verified original text in the conversation')
  await h.center.deliver(h.message, h.adapter, h.signal)
  expect(h.send.mock.calls.map(([part]) => part.type)).toEqual(['text', 'image', 'file'])
})
it('rejects changed destinations and explicitly preserves unsupported media instead of dropping them', async () => {
  const h = setup()
  h.message.blocks!.push({ type: 'video', artifactId: 'clip' })
  await expect(h.center.deliver(h.message, h.adapter, h.signal)).rejects.toThrow()
  expect(h.center.get(h.message.id)!.parts.at(-1)).toMatchObject({ state: 'unsupported', error: 'unsupported-video' })
  await expect(h.center.deliver({ ...h.message, channel: { ...h.message.channel, thread: 'other' } }, h.adapter, h.signal)).rejects.toThrow('destination changed')
  const parsed = PublicationSchema.parse({ mode: 'publish', blocks: h.message.blocks })
  expect(parsed.mode === 'publish' && parsed.blocks.length).toBe(4)
})

it('retains captured attribution and retries only the final signature after a partial send', async () => {
  const h = setup()
  h.message.attribution = { kind: 'expert', id: 'writer', name: 'Writer', digest: 'c'.repeat(64) }
  h.message.blocks = attributedBlocks(h.message.blocks!, h.message.attribution)
  h.adapter.prepare = blocks => prepareFeishuBlocks(blocks, 3500)
  h.send.mockImplementation(async (block, options) => {
    if (block.type === 'text' && block.text.includes('From expert:')) throw new DeliveryFailure('failed', 'send-failed')
    return { providerMessageIds: [options.id] }
  })
  await expect(h.center.deliver(h.message, h.adapter, h.signal)).rejects.toThrow('not completely')
  expect(h.center.get(h.message.id)?.attribution).toEqual(h.message.attribution)
  expect(h.send.mock.calls.map(([block]) => block.type)).toEqual(['text', 'image', 'file', 'text'])
  const restored = new MessageDelivery(h.store)
  h.send.mockClear().mockImplementation(async (_block, options) => ({ providerMessageIds: [options.id] }))
  await restored.deliver(h.message, h.adapter, h.signal)
  await restored.deliver(h.message, h.adapter, h.signal)
  expect(h.send).toHaveBeenCalledTimes(1)
  expect(h.send.mock.calls[0]![0]).toMatchObject({ type: 'text', text: '— 来自专家 / From expert: Writer' })
})
