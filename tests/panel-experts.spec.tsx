// @vitest-environment jsdom
/** Expert UI previews effective instructions before saving and explicitly enabling. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { Store } from '../src/app/store.ts'
import { Experts, ExpertImportSchema } from '../src/experts/catalog.ts'
import { at, click, field, mount, text, type, usePanel } from './fixtures/panel.tsx'
import { zh } from '../src/client/locales.ts'
usePanel()
let root: string, store: Store, experts: Experts, directory: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'expert-panel-')); store = new Store(join(root, 'db'))
  directory = join(root, 'travel'); mkdirSync(join(directory, '.codex-plugin'), { recursive: true })
  writeFileSync(join(directory, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'travel', description: 'Plan trips' }))
  experts = new Experts(store, join(root, 'snapshots'), () => ({ maxBytes: 100000, maxFiles: 100, maxPromptChars: 10000 }))
  const fallback = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/super-personal-agent/api/', ''), method = init?.method ?? 'GET'
    if (!path.startsWith('personal/experts')) return fallback(input, init)
    const body = JSON.parse(String(init?.body ?? '{}'))
    const result = method === 'GET' ? experts.list() : path.endsWith('/preview') ? experts.preview(ExpertImportSchema.parse(body))
      : method === 'PUT' ? experts.enable(path.split('/')[2]!, Number(body.revision), Boolean(body.enabled))
      : experts.save(ExpertImportSchema.parse(body.source), String(body.digest), Number(body.revision))
    return new Response(JSON.stringify(result), { status: 200 })
  })
  at({ page: 'settings', query: { group: 'experts' } })
})
afterEach(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
it('requires preview, shows default instructions, and keeps save separate from enable', async () => {
  await mount(); await type(field<HTMLInputElement>(zh['experts.directory']), directory)
  await click(zh['experts.preview'])
  expect(text()).toContain(zh['experts.defaults'])
  expect(field<HTMLTextAreaElement>(zh['experts.soul']).value).toContain('candid')
  await type(field<HTMLTextAreaElement>(zh['experts.soul']), 'A warm adviser')
  expect(text()).not.toContain(zh['experts.save'])
  await click(zh['experts.preview']); await click(zh['experts.save'])
  expect(experts.list()[0]?.enabled).toBe(false)
  expect(experts.list()[0]?.snapshot.soul).toBe('A warm adviser')
  await click(zh['experts.enable']); expect(experts.choices()[0]?.id).toBe('travel')
})
