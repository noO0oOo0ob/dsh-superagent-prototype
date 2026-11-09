/** Catalog decisions reject stale selections and preserve accepted package resources. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { family } from '../src/kv.ts'
import { ExpertBindingSchema } from '../src/experts/model.ts'
import { Store } from '../src/app/store.ts'
import { Experts } from '../src/experts/catalog.ts'
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).reverse().forEach(fn => fn()))
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'experts-')), store = new Store(join(root, 'db.sqlite'))
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const directory = join(root, 'package'); mkdirSync(join(directory, '.codex-plugin'), { recursive: true })
  writeFileSync(join(directory, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'travel', description: 'Travel planning' }))
  writeFileSync(join(directory, 'AGENTS.md'), 'Plan travel'); writeFileSync(join(directory, 'SOUL.md'), 'Friendly')
  const catalog = new Experts(store, join(root, 'snapshots'), () => ({ maxBytes: 100000, maxFiles: 100, maxPromptChars: 10000 }))
  return { catalog, directory, store }
}
it('keeps imported packages disabled until explicitly enabled and supports no expert', () => {
  const { catalog, directory } = fixture(), preview = catalog.preview({ directory })
  catalog.save({ directory }, preview.digest, 0)
  expect(catalog.choices()).toEqual([]); expect(catalog.select(null)).toBeUndefined()
  const selection = { id: 'travel', digest: preview.digest, reason: 'Travel task' }
  expect(() => catalog.select(selection)).toThrow('unavailable')
  catalog.enable('travel', 1, true)
  expect(catalog.select(selection)?.snapshot.agents).toBe('Plan travel')
  expect(() => catalog.select({ ...selection, digest: 'a'.repeat(64) })).toThrow('changed')
})
it('keeps task instructions and resources fixed across edits and refreshes', () => {
  const { catalog, directory } = fixture(), preview = catalog.preview({ directory })
  catalog.save({ directory }, preview.digest, 0); catalog.enable('travel', 1, true)
  const binding = catalog.select({ id: 'travel', digest: preview.digest, reason: 'Trip' })!
  writeFileSync(join(directory, 'SOUL.md'), 'New voice')
  expect(() => catalog.save({ directory }, preview.digest, 2)).toThrow('changed')
  const next = catalog.preview({ directory }); catalog.save({ directory }, next.digest, 2)
  const materialized = catalog.materialize(binding)
  expect(readFileSync(join(materialized, 'SOUL.md'), 'utf8')).toBe('Friendly')
  writeFileSync(join(materialized, 'SOUL.md'), 'tampered')
  expect(() => catalog.materialize(binding)).toThrow('modified')
})

it('preserves executable package resources', () => {
  const { catalog, directory } = fixture()
  writeFileSync(join(directory, 'server.sh'), '#!/bin/sh\nexit 0\n'); chmodSync(join(directory, 'server.sh'), 0o755)
  const preview = catalog.preview({ directory }); catalog.save({ directory }, preview.digest, 0); catalog.enable('travel', 1, true)
  const path = catalog.materialize(catalog.select({ id: 'travel', digest: preview.digest, reason: 'Trip' })!)
  expect(statSync(join(path, 'server.sh')).mode & 0o100).toBe(0o100)
})

it('reads stage-one snapshots without optional MCP metadata and retains their digest', () => {
  const { catalog, directory, store } = fixture(), preview = catalog.preview({ directory })
  const { optionalMcp: _optional, ...legacy } = preview
  store.set(family<unknown>('expert-package:')('travel'), { directory, revision: 2, enabled: true, snapshot: legacy })
  expect(catalog.list()[0]?.snapshot).toMatchObject({ optionalMcp: [], digest: legacy.digest })
  const selected = catalog.select({ id: 'travel', digest: legacy.digest, reason: 'Resume' })!
  expect(selected.snapshot.optionalMcp).toEqual([])
  const resumed = ExpertBindingSchema.parse({ snapshot: legacy, reason: 'Resume' })
  expect(readFileSync(join(catalog.materialize(resumed), 'SOUL.md'), 'utf8')).toBe('Friendly')
})
