// @vitest-environment jsdom
/** Identity editing retains drafts and requires an exact preview before catalog publication. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Identities, IdentityConflict, IdentityFilesSchema } from '../src/personal/identities.ts'
import { Store } from '../src/app/store.ts'
import { zh } from '../src/client/locales.ts'
import { at, click, field, find, mount, remount, text, type, usePanel } from './fixtures/panel.tsx'
usePanel()
let root: string, store: Store, identities: Identities, failDetail: boolean
beforeEach(() => {
  failDetail = false
  root = mkdtempSync(join(tmpdir(), 'spa-identity-panel-')); store = new Store(join(root, 'state.sqlite'))
  identities = new Identities(store, join(root, 'drafts'), () => 44_000)
  const fallback = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/super-personal-agent/api/', ''), method = init?.method ?? 'GET'
    if (!path.startsWith('personal/identities')) return fallback(input, init)
    if (failDetail && method === 'GET' && path.startsWith('personal/identities/')) return new Response(JSON.stringify({ error: 'Temporary read failure' }), { status: 503 })
    const body = JSON.parse(String(init?.body ?? '{}'))
    try {
      let result: unknown
      if (path === 'personal/identities') result = identities.list()
      else if (path === 'personal/identities/preview') result = identities.preview(IdentityFilesSchema.parse(body))
      else {
        const id = path.split('/')[2]!
        if (method === 'PUT') result = identities.publish(IdentityFilesSchema.parse(body.files), Number(body.baseRevision), String(body.previewDigest))
        else if (path.endsWith('/export')) result = { directory: await identities.exportDraft(id) }
        else if (path.endsWith('/import')) result = await identities.importDraft(id)
        else result = identities.get(id)
      }
      if (result === undefined) return new Response(JSON.stringify({ error: 'Identity not found' }), { status: 404 })
      return new Response(JSON.stringify(result), { status: 200 })
    } catch (error) { return new Response(JSON.stringify({ error: String(error) }), { status: error instanceof IdentityConflict ? 409 : 400 }) }
  })
  at({ page: 'settings', query: { group: 'identities' } })
})
afterEach(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
it('creates a role with preview, saves its version and preserves unsaved text when changing tabs', async () => {
  await mount()
  expect(text()).toContain(zh['identity.activationUnavailable'])
  await type(field<HTMLInputElement>(zh['identity.newId']), 'writer')
  await click(zh['identity.create'])
  await type(field<HTMLTextAreaElement>('AGENTS.md'), 'Help write clear prose')
  expect((find(zh['identity.publish']) as HTMLButtonElement).disabled).toBe(true)
  await click(zh['identity.preview'])
  expect(text()).toContain('common@1 → writer@1')
  await click(zh['identity.publish'])
  expect(identities.get('writer')?.files['AGENTS.md']).toBe('Help write clear prose')
  await type(field<HTMLTextAreaElement>('SOUL.md'), 'An unsaved personality')
  await remount()
  await type(field<HTMLSelectElement>(zh['identity.select']), 'writer')
  expect(field<HTMLTextAreaElement>('SOUL.md').value).toBe('An unsaved personality')
  expect(identities.get('writer')?.files['SOUL.md']).toBe('')
})
it('invalidates a preview after editing and requires another preview when the parent changes', async () => {
  await mount()
  await type(field<HTMLInputElement>(zh['identity.newId']), 'assistant')
  await click(zh['identity.create'])
  await click(zh['identity.preview'])
  await type(field<HTMLTextAreaElement>('SOUL.md'), 'Calm')
  expect((find(zh['identity.publish']) as HTMLButtonElement).disabled).toBe(true)
  await click(zh['identity.preview'])
  const common = identities.get('common')!, files = { ...common.files, 'SOUL.md': 'Shared change' }
  identities.publish(files, 1, identities.preview(files).digest)
  await click(zh['identity.publish'])
  expect(identities.get('assistant')).toBeUndefined()
  expect(field<HTMLTextAreaElement>('SOUL.md').value).toBe('Calm')
  expect((find(zh['identity.publish']) as HTMLButtonElement).disabled).toBe(true)
  await click(zh['identity.preview'])
  await click(zh['identity.publish'])
  expect(identities.get('assistant')?.sources[0]?.revision).toBe(2)
})

it('adopts a newer parent through preview without requiring a meaningless text edit', async () => {
  const files = { 'agent.yaml': 'id: researcher\nname: Researcher\nparent: common\n', 'AGENTS.md': 'Research', 'SOUL.md': '' }
  identities.publish(files, 0, identities.preview(files).digest)
  const common = identities.get('common')!, next = { ...common.files, 'SOUL.md': 'Shared style v2' }
  identities.publish(next, 1, identities.preview(next).digest)
  await mount()
  await type(field<HTMLSelectElement>(zh['identity.select']), 'researcher')
  expect(text()).toContain(zh['identity.parentChanged'])
  await click(zh['identity.preview'])
  expect((find(zh['identity.publish']) as HTMLButtonElement).disabled).toBe(false)
  await click(zh['identity.publish'])
  expect(identities.get('researcher')!.revision).toBe(2)
  expect(identities.get('researcher')!.sources[0]!.revision).toBe(2)
})

it('keeps the saved version editable when the detail refresh fails after publication', async () => {
  await mount()
  await type(field<HTMLTextAreaElement>('SOUL.md'), 'Saved despite read outage')
  await click(zh['identity.preview'])
  failDetail = true
  await click(zh['identity.publish'])
  expect(identities.get('common')!.revision).toBe(2)
  expect(field<HTMLTextAreaElement>('SOUL.md').disabled).toBe(false)
  expect((find(zh['identity.reload']) as HTMLButtonElement).disabled).toBe(false)
  failDetail = false
  await click(zh['identity.reload'])
  expect(field<HTMLTextAreaElement>('SOUL.md').value).toBe('Saved despite read outage')
  expect(identities.get('common')!.revision).toBe(2)
})
