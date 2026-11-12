/** Markdown artifacts and comment reply destinations are deterministic, durable and owner-scoped. */
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { Store } from '../src/app/store.ts'
import { FeishuDocuments, documentBatches } from '../src/messaging/feishu-documents.ts'
import { MessageDelivery } from '../src/messaging/delivery.ts'
import type { OutboundMessage } from '../src/core/index.ts'
import type { NativeFeishu } from '../src/connectors/native-feishu.mjs'

const cleanups: (() => void)[] = []
afterEach(() => { for (const fn of cleanups.splice(0).reverse()) fn() })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'spa-docs-')), store = new Store(join(root, 'state.sqlite'))
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const call = vi.fn<NativeFeishu['documentRequest']>(async (_bot, _fingerprint, request) => {
    if (request.url === '/open-apis/docx/v1/documents') return { document: { document_id: 'doc1' } }
    if (request.url.endsWith('/convert')) return { first_level_block_ids: ['text'], blocks: [{ block_id: 'text', block_type: 2, text: { elements: [{ text_run: { content: 'Hello' } }] } }] }
    if (request.url.endsWith('/metas/batch_query')) {
      const data = request.data as { request_docs: { doc_token: string }[] }
      return { metas: [{ doc_token: data.request_docs[0]!.doc_token, url: `https://tenant.feishu.cn/docx/${data.request_docs[0]!.doc_token}` }] }
    }
    return {}
  })
  const native = { accounts: () => [{ id: 'bot', fingerprint: 'fingerprint', channel: 'feishu' as const }], documentRequest: call, allowsCommand: vi.fn(() => true) }
  const materialize = vi.fn(async (id: string) => ({ bytes: Buffer.from('# Hello'), file: { digest: 'a'.repeat(64), size: 7, fileName: id === 'pdf' ? 'plan.pdf' : 'plan.md', mediaType: id === 'pdf' ? 'application/pdf' : 'text/markdown' } }))
  const host = { store, native: () => native, results: { materialize }, ledger: new MessageDelivery(store), signal: new AbortController().signal,
    maxBytes: () => 100000, limits: () => ({ contextChars: 24000, commentPages: 10 }), allowed: () => true, receive: vi.fn(), attach: vi.fn(), busy: () => false }
  const docs = new FeishuDocuments(host), route = { actorId: 'owner', conversationId: 'chat', messageId: 'message' }
  const message: OutboundMessage = { id: 'message', kind: 'notice', text: 'Ready', channel: { source: 'im-bot', thread: 'chat', address: {} } }
  return { docs, host, call, native, materialize, route, message }
}
it('converts only Markdown files, shares with the requester, and reuses the publication after restart', async () => {
  const h = fixture(), inline = { type: 'text' as const, text: '# Inline', format: 'markdown' as const }
  expect(await h.docs.publish('bot', 'fingerprint', h.route, h.message, inline)).toBe(inline)
  expect(await h.docs.publish('bot', 'fingerprint', h.route, h.message, { type: 'file', artifactId: 'pdf' })).toEqual({ type: 'file', artifactId: 'pdf' })
  expect(h.call).not.toHaveBeenCalled()
  const block = { type: 'file' as const, artifactId: 'md' }
  const result = await h.docs.publish('bot', 'fingerprint', h.route, h.message, block)
  expect(result).toEqual({ type: 'link', label: 'plan', url: 'https://tenant.feishu.cn/docx/doc1' })
  expect(h.call.mock.calls.find(([, , request]) => request.url.endsWith('/members'))![2]).toMatchObject({ data: { member_id: 'owner', perm: 'view' } })
  expect(h.call).toHaveBeenCalledTimes(5)
  await new FeishuDocuments(h.host).publish('bot', 'fingerprint', h.route, h.message, block)
  expect(h.call).toHaveBeenCalledTimes(5)
})
it('stops uncertain document creation until a recorded operator reconciliation', async () => {
  const h = fixture(), block = { type: 'file' as const, artifactId: 'md' }
  h.call.mockRejectedValueOnce(new Error('connection reset'))
  await expect(h.docs.publish('bot', 'fingerprint', h.route, h.message, block)).rejects.toMatchObject({ outcome: 'unknown' })
  const restored = new FeishuDocuments(h.host)
  await expect(restored.publish('bot', 'fingerprint', h.route, h.message, block)).rejects.toThrow('unknown')
  expect(h.call).toHaveBeenCalledTimes(1)
  const record = restored.list()[0]!
  expect(() => restored.reconcile(record.id, 'write-0', 'verified')).toThrow('stage changed')
  restored.reconcile(record.id, 'create', 'Verified in Feishu that no document was created')
  await restored.publish('bot', 'fingerprint', h.route, h.message, block)
  expect(restored.list()[0]!.recovery).toHaveLength(1)
  expect(h.call).toHaveBeenCalledTimes(6)
})
it('retries an explicitly rejected stage without repeating successful create or write operations', async () => {
  const h = fixture(), original = h.call.getMockImplementation()!, block = { type: 'file' as const, artifactId: 'md' }
  h.call.mockImplementation(async (...args) => {
    if (args[2].url.endsWith('/members')) throw Object.assign(new Error('permission'), { outcome: 'failed' })
    return original(...args)
  })
  await expect(h.docs.publish('bot', 'fingerprint', h.route, h.message, block)).rejects.toMatchObject({ outcome: 'failed' })
  h.call.mockImplementation(original)
  await h.docs.publish('bot', 'fingerprint', h.route, h.message, block)
  expect(h.call.mock.calls.filter(([, , request]) => request.url === '/open-apis/docx/v1/documents')).toHaveLength(1)
  expect(h.call.mock.calls.filter(([, , request]) => request.url.endsWith('/descendant'))).toHaveLength(1)
})
it('batches complete subtrees and preserves image URLs without silently losing them', () => {
  const blocks = Array.from({ length: 1001 }, (_, i) => ({ block_id: String(i), block_type: 2 }))
  const batches = documentBatches({ first_level_block_ids: blocks.map(item => item.block_id), blocks, block_id_to_image_urls: [] })
  expect(batches.map(batch => batch.descendants.length)).toEqual([1000, 1])
  const image = documentBatches({ first_level_block_ids: ['image'], blocks: [{ block_id: 'image', block_type: 27, image: {} }], block_id_to_image_urls: [{ block_id: 'image', image_url: 'https://example.com/image.png' }] })
  expect(image[0]!.descendants[0]).toMatchObject({ block_type: 2, text: { elements: [{ text_run: { content: 'https://example.com/image.png' } }] } })
  expect(() => documentBatches({ first_level_block_ids: ['missing'], blocks: [], block_id_to_image_urls: [] })).toThrow('invalid-document')
})

it('recovers an applied create without creating a duplicate document', async () => {
  const h = fixture(), block = { type: 'file' as const, artifactId: 'md' }
  h.call.mockRejectedValueOnce(new Error('response lost'))
  await expect(h.docs.publish('bot', 'fingerprint', h.route, h.message, block)).rejects.toThrow()
  const record = h.docs.list()[0]!
  expect(() => h.docs.reconcile(record.id, 'create', 'Verified', 'confirm_applied')).toThrow('document ID')
  h.docs.reconcile(record.id, 'create', 'Verified document in Feishu', 'confirm_applied', 'existingDoc')
  expect(await h.docs.publish('bot', 'fingerprint', h.route, h.message, block)).toMatchObject({ url: 'https://tenant.feishu.cn/docx/existingDoc' })
  expect(h.call.mock.calls.filter(([, , request]) => request.url === '/open-apis/docx/v1/documents')).toHaveLength(1)
})
