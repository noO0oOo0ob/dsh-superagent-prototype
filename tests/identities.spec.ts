/** Identity publications retain exact files and inherited versions without activating Sessions. */
import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile, readFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { Store } from '../src/app/store.ts'
import { Identities, type IdentityFiles } from '../src/personal/identities.ts'
const cleanups: (() => void)[] = []
afterEach(() => { for (const fn of cleanups.splice(0).reverse()) fn() })
const files = (id: string, parent = 'common', extra = ''): IdentityFiles => ({ 'agent.yaml': `id: ${id}\nname: ${id}\nparent: ${parent}\n${extra}`, 'AGENTS.md': `Duties for ${id}`, 'SOUL.md': `Style for ${id}` })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'spa-identities-')), store = new Store(join(root, 'state.sqlite'))
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  let budget = 44_000
  const identities = new Identities(store, join(root, 'identity-drafts'), () => budget)
  const publish = (input: IdentityFiles, revision = 0) => { const preview = identities.preview(input); return identities.publish(input, revision, preview.digest) }
  return { root, store, identities, publish, budget: (value: number) => { budget = value } }
}
it('publishes immutable files, source revisions and intersected capabilities', () => {
  const h = fixture(), common = h.identities.get('common')!
  h.publish({ ...common.files, 'agent.yaml': 'id: common\nname: Shared\ncapabilities: [read, web]\n' }, common.revision)
  const role = h.publish(files('research', 'common', 'capabilities: [read, shell]\n'))
  expect(role.effective.capabilities).toEqual(['read'])
  expect(role.sources.map(source => [source.id, source.revision])).toEqual([['common', 2], ['research', 1]])
  expect(role.text).toContain('Duties for research')
  expect(h.identities.list().activation).toBe('catalog-only')
  h.publish({ ...role.files, 'SOUL.md': 'Different style' }, 1)
  expect(h.identities.get('research', 1)?.files['SOUL.md']).toBe('Style for research')
})
it('rejects unknown parents, cycles, arbitrary structured keys and malformed YAML', () => {
  const h = fixture()
  expect(() => h.identities.preview(files('a', 'missing'))).toThrow('Parent identity')
  h.publish(files('a')); h.publish(files('b', 'a'))
  expect(() => h.identities.preview(files('a', 'b'))).toThrow('cycle')
  expect(() => h.identities.preview(files('a', 'common', 'admin: true\n'))).toThrow()
  expect(() => h.identities.preview({ ...files('a'), 'agent.yaml': 'id: [\n' })).toThrow('YAML')
})
it('refuses stale identity versions and a parent changed after the preview', () => {
  const h = fixture(), input = files('a'), preview = h.identities.preview(input), common = h.identities.get('common')!
  h.publish({ ...common.files, 'SOUL.md': 'Updated shared style' }, common.revision)
  expect(() => h.identities.publish(input, 0, preview.digest)).toThrow('preview')
  h.publish(input)
  expect(() => h.identities.publish(input, 0, h.identities.preview(input).digest)).toThrow('changed')
})
it('keeps the published parent ancestry until the child is explicitly republished', () => {
  const h = fixture(); h.publish(files('parent')); h.publish(files('child', 'parent'))
  const common = h.identities.get('common')!
  h.publish({ ...common.files, 'SOUL.md': 'New common' }, common.revision)
  expect(h.identities.get('child')!.sources[0]!.revision).toBe(1)
  expect(h.identities.list().identities.find(identity => identity.id === 'parent')!.outdatedParents).toEqual(['common'])
})
it('imports edited files only as a draft, preserving the published revision and user edits', async () => {
  const h = fixture(); h.publish(files('research'))
  const directory = await h.identities.exportDraft('research')
  await writeFile(join(directory, 'SOUL.md'), 'Local edit')
  const draft = await h.identities.importDraft('research')
  expect(draft.files['SOUL.md']).toBe('Local edit')
  expect(h.identities.get('research')!.files['SOUL.md']).toBe('Style for research')
  await expect(h.identities.exportDraft('research')).rejects.toThrow('edited')
  expect(await readFile(join(directory, 'SOUL.md'), 'utf8')).toBe('Local edit')
})
it('enforces the configured prompt budget before publishing', () => {
  const h = fixture(); h.budget(10)
  expect(() => h.identities.preview(files('large'))).toThrow('budget')
})

it('rejects stale exported drafts and retains the old directory when exporting a newer version', async () => {
  const h = fixture(), role = h.publish(files('a')), directory = await h.identities.exportDraft('a')
  await writeFile(join(directory, 'SOUL.md'), 'Unpublished local edit')
  h.publish({ ...role.files, 'SOUL.md': 'Another owner edit' }, 1)
  await expect(h.identities.importDraft('a')).rejects.toThrow('exported draft version changed')
  const next = await h.identities.exportDraft('a')
  expect(next).not.toBe(directory)
  expect(await readFile(join(directory, 'SOUL.md'), 'utf8')).toBe('Unpublished local edit')
})
it('rejects symbolic links and changed directory identity without modifying published data', async () => {
  const h = fixture(); h.publish(files('a'))
  const directory = await h.identities.exportDraft('a')
  await writeFile(join(directory, 'agent.yaml'), files('b')['agent.yaml'])
  await expect(h.identities.importDraft('a')).rejects.toThrow('ID does not match')
  await writeFile(join(directory, 'agent.yaml'), files('a')['agent.yaml'])
  const outside = join(h.root, 'outside'); await writeFile(outside, 'Outside')
  rmSync(join(directory, 'SOUL.md')); await symlink(outside, join(directory, 'SOUL.md'))
  await expect(h.identities.importDraft('a')).rejects.toThrow()
  expect(h.identities.get('a')!.revision).toBe(1)
})
it('resolves structured child overrides and inherited text into a reproducible preview', () => {
  const h = fixture()
  h.publish(files('base', 'common', 'model: {provider: sample, model: example}\npreset: research\ncapabilities: [read, web]\n'))
  const preview = h.identities.preview(files('child', 'base', 'model: null\ncapabilities: [read, shell]\n'))
  expect({ ...preview, digest: '<content hash>' }).toMatchSnapshot()
  expect(h.identities.preview(preview.files).digest).toBe(preview.digest)
})

it('does not let an earlier export replace the current exported revision', async () => {
  const h = fixture(), role = h.publish(files('a'))
  const older = h.identities.exportDraft('a').catch(error => error)
  h.publish({ ...role.files, 'SOUL.md': 'Version two' }, 1)
  const current = await h.identities.exportDraft('a')
  expect(await older).toBeInstanceOf(Error)
  await writeFile(join(current, 'SOUL.md'), 'Current local edit')
  const draft = await h.identities.importDraft('a')
  expect(draft).toMatchObject({ baseRevision: 2, files: { 'SOUL.md': 'Current local edit' } })
})
