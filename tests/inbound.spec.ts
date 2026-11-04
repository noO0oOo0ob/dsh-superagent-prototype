/** Inbound artifacts remain tied to their persisted source and survive platform expiry. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Store } from '../src/app/store.ts'
import { ArtifactFiles } from '../src/messaging/files.ts'
import { InboundFiles } from '../src/messaging/inbound.ts'
import type { NativeFeishu } from '../src/connectors/native-feishu.mjs'
import type { Trigger } from '../src/core/index.ts'
const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach(fn => fn()) })
it('snapshots an authorized resource once and refuses an invented reference', async () => {
  const root = mkdtempSync(join(tmpdir(), 'spa-inbound-')), store = new Store(join(root, 'state.sqlite'))
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const readResource = vi.fn<NativeFeishu['readResource']>(async () => Buffer.from('# report'))
  const native: Pick<NativeFeishu, 'readResource'> = { readResource }
  const files = new ArtifactFiles(join(root, 'files'))
  const inbound = new InboundFiles(store, files, () => native, () => 1024)
  const trigger: Trigger = { id: 'input', source: 'im-one', actor: { source: 'im-one', id: 'alice' }, human: true,
    threads: [{ source: 'im-one', id: 'chat' }], at: '2026-11-04T00:00:00Z', text: '[report.md]', meta: {
      botId: 'bot', fingerprint: 'account', resources: [{ kind: 'file', key: 'key', fileName: '../../report.md' }],
      reply: { messageId: 'message', actorId: 'alice', conversationId: 'chat' } } }
  const first = await inbound.read(trigger, 'key', new AbortController().signal)
  expect(first.file.fileName).toBe('report.md')
  expect(first.file.mediaType).toBe('text/markdown')
  expect(first.bytes.toString()).toBe('# report')
  readResource.mockRejectedValue(new Error('recalled'))
  const restored = new InboundFiles(store, files, () => native, () => 1024)
  expect(await restored.read(trigger, 'key', new AbortController().signal)).toEqual(first)
  await expect(inbound.read(trigger, 'other', new AbortController().signal)).rejects.toThrow('not attached')
  expect(readResource).toHaveBeenCalledOnce()
  await expect(new InboundFiles(store, files, () => native, () => 2).read(trigger, 'key', new AbortController().signal)).rejects.toThrow('limit')
})
