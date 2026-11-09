// @vitest-environment jsdom
/** Legacy identity UI preserves history and migrates explicitly without activation. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Identities } from '../src/personal/identities.ts'
import { Experts } from '../src/experts/catalog.ts'
import { migrateIdentity } from '../src/experts/legacy.ts'
import { Store } from '../src/app/store.ts'
import { zh } from '../src/client/locales.ts'
import { at, click, field, mount, text, usePanel } from './fixtures/panel.tsx'
usePanel()
let root: string, store: Store, identities: Identities, experts: Experts
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spa-identity-panel-')); store = new Store(join(root, 'state.sqlite'))
  identities = new Identities(store, join(root, 'drafts'), () => 44000)
  experts = new Experts(store, join(root, 'snapshots'), () => ({ maxBytes: 100000, maxFiles: 100, maxPromptChars: 44000 }))
  const fallback = globalThis.fetch
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/super-personal-agent/api/', '')
    if (!path.startsWith('personal/identities')) return fallback(input, init)
    const id = path.split('/')[2] ?? 'common'
    const result = path === 'personal/identities' ? identities.list() : path.endsWith('/expert') ? migrateIdentity(identities.get(id)!, join(root, 'exports'), experts) : identities.get(id)
    return new Response(JSON.stringify(result), { status: 200 })
  })
  at({ page: 'settings', query: { group: 'identities' } })
})
afterEach(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
it('shows old files read-only and imports their effective instructions into a disabled expert', async () => {
  await mount()
  expect(field<HTMLTextAreaElement>('SOUL.md').readOnly).toBe(true)
  expect(text()).not.toContain(zh['identity.create'])
  await click(zh['identity.migrate'])
  expect(experts.list()).toHaveLength(1)
  expect(experts.list()[0]?.enabled).toBe(false)
  expect(experts.list()[0]?.snapshot.agents).toBeTruthy()
  expect(experts.list()[0]?.snapshot.soul).toBeTruthy()
  expect(identities.get('common')?.revision).toBe(1)
})
