/** External packages keep instructions and resources without executing host-specific components. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readExpertPackage } from '../src/experts/package.ts'
const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function fixture(format = 'claude') {
  const root = mkdtempSync(join(tmpdir(), 'expert-package-')); roots.push(root)
  const put = (path: string, text: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  const name = format === 'portable' ? 'plugin.json' : `.${format}-plugin/plugin.json`
  put(name, JSON.stringify({ name: 'travel', description: 'Travel planning', version: '1.0.0', ...(format === 'portable' ? { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' } : {}) }))
  put('skills/itinerary/SKILL.md', '---\nname: itinerary\ndescription: Plan routes\n---\nCheck traffic and read references/check.md.')
  put('skills/itinerary/references/check.md', 'Check the transport schedule.')
  const read = () => readExpertPackage({ directory: root }, { maxBytes: 100000, maxFiles: 50, maxPromptChars: 10000 })
  return { root, put, read }
}
it.each(['claude', 'codex', 'portable'])('reads %s packages with visible default AGENTS and SOUL', format => {
  const h = fixture(format), result = h.read()
  expect(result.defaults).toEqual(['AGENTS.md', 'SOUL.md'])
  expect(result.agents).toContain('authorized task'); expect(result.soul).toContain('candid')
  expect(result.skills[0]?.name).toBe('itinerary')
  expect(result.files['skills/itinerary/references/check.md']).toBeDefined()
})
it('loads explicit persona files and preload skills, with content-sensitive snapshots', () => {
  const h = fixture(); h.put('AGENTS.md', 'Plan feasible travel.'); h.put('SOUL.md', 'Be warm.')
  h.put('personal-agent.yaml', 'schemaVersion: 1\nentry:\n  preloadSkills: [itinerary]\nrouting:\n  exclusions: [booking]\n')
  const first = h.read(); expect(first.defaults).toEqual([]); expect(first.skills[0]?.preload).toBe(true)
  h.put('SOUL.md', 'Be concise.'); expect(h.read().digest).not.toBe(first.digest)
  expect(first.soul).toBe('Be warm.')
})
it('uses a sole Claude agent body but reports unsupported fields', () => {
  const h = fixture(); h.put('agents/planner.md', '---\nname: planner\nmodel: sonnet\n---\nTravel specialist.')
  expect(h.read().agents).toBe('Travel specialist.'); expect(h.read().issues).toContain('Agent field model requires explicit host mapping')
})
it('does not concatenate multiple agents or execute hooks', () => {
  const h = fixture(); h.put('agents/a.md', 'A'); h.put('agents/b.md', 'B'); h.put('hooks/hooks.json', '{}')
  expect(h.read().issues).toEqual(expect.arrayContaining(['Multiple agents: configure entry.agent', 'Unsupported component: hooks']))
  h.put('personal-agent.yaml', 'schemaVersion: 1\nentry:\n  agent: ./agents/b.md\n')
  expect(h.read().agents).toBe('B')
})
it('rejects path escape, symlinks, empty required instructions and invalid preload', () => {
  const h = fixture(); h.put('personal-agent.yaml', 'schemaVersion: 1\ninstructions:\n  agents: ../secret\n')
  expect(h.read).toThrow('inside')
  h.put('personal-agent.yaml', 'schemaVersion: 1\nentry:\n  preloadSkills: [missing]\n'); expect(h.read).toThrow('Missing preload')
  h.put('personal-agent.yaml', 'schemaVersion: 1\n'); h.put('SOUL.md', ''); expect(h.read).toThrow('nonempty')
  h.put('SOUL.md', 'Friendly'); symlinkSync('/tmp', join(h.root, 'link')); expect(h.read).toThrow('symlink')
})
it('keeps output guidance separate from editable AGENTS across refreshes', () => {
  const h = fixture(); h.put('AGENTS.md', 'Duties'); h.put('output.md', 'Output guidance')
  h.put('personal-agent.yaml', 'schemaVersion: 1\noutput:\n  guidance: ./output.md\n')
  const first = h.read()
  const next = readExpertPackage({ directory: h.root, agents: first.agentsSource, soul: first.soul }, { maxBytes: 100000, maxFiles: 50, maxPromptChars: 10000 })
  expect(next.agents).toBe(first.agents); expect(next.agents.match(/Output guidance/g)).toHaveLength(1)
})
