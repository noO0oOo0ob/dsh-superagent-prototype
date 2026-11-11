/** Bundled expert installation preserves user settings and captured task resources. */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { Store } from '../src/app/store.ts'
import { Experts } from '../src/experts/catalog.ts'
import { BUNDLED_EXPERT_IDS, bundledExperts } from '../src/experts/bundled.ts'
import { startRuntime, feishu } from './fixtures/host.ts'

const cleanups: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn() })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bundled-experts-')), store = new Store(join(root, 'db'))
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  const catalog = new Experts(store, join(root, 'snapshots'), () => ({ maxBytes: 100000, maxFiles: 100, maxPromptChars: 10000 }))
  return { catalog, store }
}
it('installs five complete compatible packages with fifteen lazy skills', () => {
  const { catalog } = fixture()
  catalog.installBundled(bundledExperts())
  expect(catalog.choices().map(item => item.id).sort()).toEqual([...BUNDLED_EXPERT_IDS].sort())
  for (const entry of catalog.list()) {
    expect(entry).toMatchObject({ enabled: true, revision: 1, snapshot: { defaults: [], issues: [], mcp: {} } })
    expect(entry.snapshot.skills).toHaveLength(3)
    expect(entry.snapshot.skills.every(skill => !skill.preload && skill.modelInvocable)).toBe(true)
    const binding = catalog.select({ id: entry.snapshot.id, digest: entry.snapshot.digest, reason: 'Requested specialty' })!
    const root = catalog.materialize(binding)
    expect(readFileSync(join(root, 'AGENTS.md'))).toEqual(Buffer.from(entry.snapshot.files['AGENTS.md']!, 'base64'))
    for (const skill of entry.snapshot.skills) expect(readFileSync(join(root, skill.directory, 'SKILL.md'), 'utf8')).toContain(skill.content)
  }
})
it('preserves disabled packages, edits and accepted snapshots on startup and upgrades', () => {
  const { catalog } = fixture(), packages = bundledExperts()
  catalog.installBundled(packages.slice(0, 1))
  const first = catalog.list()[0]!, selection = { id: first.snapshot.id, digest: first.snapshot.digest, reason: 'Research' }
  const captured = catalog.select(selection)!
  const input = { directory: first.directory, format: 'portable' as const, agents: 'User-owned instructions' }
  const preview = catalog.preview(input)
  catalog.save(input, preview.digest, first.revision)
  catalog.installBundled(packages)
  catalog.installBundled(packages)
  expect(catalog.list()).toHaveLength(5)
  expect(catalog.list().find(item => item.snapshot.id === first.snapshot.id)).toMatchObject({ enabled: false, revision: 2, snapshot: { agents: 'User-owned instructions' } })
  expect(readFileSync(join(catalog.materialize(captured), 'AGENTS.md'))).toEqual(Buffer.from(first.snapshot.files['AGENTS.md']!, 'base64'))
  expect(catalog.select(null)).toBeUndefined()
})
it('rolls back the installation batch when a bundled resource is missing or mismatched', () => {
  const { catalog } = fixture(), packages = bundledExperts()
  expect(() => catalog.installBundled([packages[0]!, { id: 'missing', directory: '/missing/bundled-expert' }])).toThrow()
  expect(catalog.list()).toEqual([])
  expect(() => catalog.installBundled([{ ...packages[0]!, id: 'wrong-id' }])).toThrow('Invalid bundled expert')
  expect(catalog.list()).toEqual([])
})
it('starts with bundled experts and loads only the chosen expert into its Worker', async () => {
  const h = await startRuntime(); cleanups.push(() => h.stop())
  const catalog = await h.runTool(h.runtime.masterId, 'personal_agent_experts', {})
  expect(catalog).toMatchObject({ experts: expect.arrayContaining(BUNDLED_EXPERT_IDS.map(id => expect.objectContaining({ id }))) })
  const chosen = h.runtime.experts.list().find(entry => entry.snapshot.id === 'builtin-writing')!
  const request = feishu('901', '写一封项目进展邮件'); h.runtime.receive(request); await h.runtime.idle()
  const response = await h.route({ kind: 'accept', trigger_id: request.id, title: 'Project update', worktree_name: 'update', acknowledgement: '整理项目进展邮件。',
    expert: { id: chosen.snapshot.id, digest: chosen.snapshot.digest, reason: 'Requested writing' } })
  await h.runtime.idle()
  const ticketId = (response.ticket as { ticket_id: string }).ticket_id, session = `spa-worker-${ticketId}`
  expect(h.promptSections.get(session)!({})).toContain(chosen.snapshot.agents)
  expect(h.promptSections.get(h.runtime.masterId)!({})).not.toContain(chosen.snapshot.agents)
  for (const skill of chosen.snapshot.skills) {
    expect(h.skills.get(session)?.has(`builtin-writing-${skill.name}`)).toBe(true)
    expect(h.promptSections.get(session)!({})).not.toContain(skill.content)
  }
  expect(h.skills.get(session)?.has('builtin-data-data-quality')).toBe(false)
  expect(chosen.snapshot).toMatchObject({ name: '写作表达专家', skills: expect.any(Array) })
  expect({ id: chosen.snapshot.id, name: chosen.snapshot.name, agents: chosen.snapshot.agents, soul: chosen.snapshot.soul,
    skills: chosen.snapshot.skills.map(({ name, description, preload }) => ({ name, description, preload })) }).toMatchSnapshot()
})
