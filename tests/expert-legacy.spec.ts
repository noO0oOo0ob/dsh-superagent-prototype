/** Migration uses published ancestry, preserving both instruction kinds without activating an expert. */
import { expect, it } from 'vitest'
import { legacyExpertInstructions } from '../src/experts/legacy.ts'
import type { IdentityVersion } from '../src/personal/identities.ts'
it('flattens the two instruction streams independently and supplies nonempty defaults', () => {
  const version: IdentityVersion = { version: 1, id: 'travel', revision: 1, savedAt: '', digest: '', text: '',
    definition: { id: 'travel', name: 'Travel', parent: 'common' }, effective: { capabilities: [] },
    files: { 'agent.yaml': '', 'AGENTS.md': 'Child methods', 'SOUL.md': 'Child style' }, sources: [
      { id: 'common', revision: 2, files: { 'agent.yaml': '', 'AGENTS.md': 'Shared methods', 'SOUL.md': 'Shared style' } },
      { id: 'travel', revision: 1, files: { 'agent.yaml': '', 'AGENTS.md': 'Child methods', 'SOUL.md': 'Child style' } },
    ] }
  const result = legacyExpertInstructions(version)
  expect(result.agents).toContain('Shared methods'); expect(result.agents).toContain('Child methods'); expect(result.agents).not.toContain('style')
  expect(result.soul).toContain('Shared style'); expect(result.soul).not.toContain('methods')
  expect(legacyExpertInstructions({ ...version, sources: [] }).soul).toBeTruthy()
})
