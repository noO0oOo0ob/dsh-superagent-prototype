/** Conversation personality changes activate at explicit generation/turn boundaries. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Store } from '../src/app/store.ts'
import { Experts } from '../src/experts/catalog.ts'
import { ExpertPreferences } from '../src/experts/preferences.ts'
it('keeps current dialogue/Main instructions stable and applies edits to a new generation/turn', () => {
  const root = mkdtempSync(join(tmpdir(), 'expert-prefs-')), store = new Store(join(root, 'db'))
  try {
    const experts = new Experts(store, join(root, 'snapshots'), () => ({ maxBytes: 10000, maxFiles: 100, maxPromptChars: 10000 }))
    const prefs = new ExpertPreferences(store, experts, () => 10000)
    const oldMain = prefs.main('main'), oldChat = prefs.dialogue('chat-v0', 'feishu-a')
    prefs.save({ main: { agents: 'Coordinate', soul: 'Very concise' }, accounts: [{ source: 'feishu-a', persona: { agents: 'Help with trips', soul: 'Warm' } }] }, 0)
    expect(prefs.main('main')).toBe(oldMain); expect(prefs.main('main', true)).toContain('Very concise')
    expect(prefs.dialogue('chat-v0', 'feishu-a')).toBe(oldChat); expect(prefs.dialogue('chat-v1', 'feishu-a')).toContain('Warm')
    expect(prefs.dialogue('other', 'feishu-b')).not.toContain('Warm')
    expect(prefs.select(null, 'feishu-a')).toBeUndefined()
    expect(() => prefs.save({}, 0)).toThrow('changed')
  } finally { store.close(); rmSync(root, { recursive: true, force: true }) }
})
it('enforces source restrictions while keeping automatic no-match general and fixed mode explicit', () => {
  const root = mkdtempSync(join(tmpdir(), 'expert-policy-')), store = new Store(join(root, 'db'))
  try {
    const experts = new Experts(store, join(root, 'snapshots'), () => ({ maxBytes: 100000, maxFiles: 100, maxPromptChars: 10000 }))
    const source = { directory: join(process.cwd(), 'skills/create-expert/assets/travel-planner'), format: 'codex' as const }
    const preview = experts.preview(source); experts.save(source, preview.digest, 0); experts.enable(preview.id, 1, true)
    const prefs = new ExpertPreferences(store, experts, () => 10000), persona = { agents: 'Help', soul: 'Warm' }
    prefs.save({ accounts: [{ source: 'a', persona, allowed: [], mode: 'auto' }, { source: 'b', persona, defaultExpert: preview.id, mode: 'auto' }, { source: 'c', persona, defaultExpert: preview.id, mode: 'fixed' }] }, 0)
    const selection = { id: preview.id, digest: preview.digest, reason: 'Trip' }
    expect(prefs.choices('a').experts).toEqual([]); expect(() => prefs.select(selection, 'a')).toThrow('not allowed')
    expect(prefs.select(null, 'b')).toBeUndefined(); expect(prefs.choices('b').defaultExpert).toBe(preview.id)
    expect(prefs.select(null, 'c')?.snapshot.id).toBe(preview.id)
    experts.enable(preview.id, 2, false); expect(() => prefs.select(null, 'c')).toThrow('unavailable')
  } finally { store.close(); rmSync(root, { recursive: true, force: true }) }
})
