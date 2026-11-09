/** Exports an existing identity publication as a disabled, self-contained expert package. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IdentityVersion } from '../personal/identities.ts'
import { GENERAL_AGENTS, GENERAL_SOUL } from './model.ts'
import type { Experts } from './catalog.ts'
/** Flatten the exact published ancestry separately for responsibilities and personality. */
export function legacyExpertInstructions(version: IdentityVersion) {
  const collect = (file: 'AGENTS.md' | 'SOUL.md', fallback: string) => version.sources
    .filter(source => source.files[file].trim()).map(source => `## ${source.id}@${source.revision}\n\n${source.files[file]}`).join('\n\n') || fallback
  return { agents: collect('AGENTS.md', GENERAL_AGENTS), soul: collect('SOUL.md', GENERAL_SOUL) }
}
/** Exclusive exports preserve edited drafts and never activate or overwrite an existing expert. */
export function migrateIdentity(version: IdentityVersion, directory: string, experts: Experts) {
  if (experts.list().some(entry => entry.snapshot.id === version.id)) throw new Error('An expert with this ID exists; export and rename the legacy draft explicitly')
  const root = join(directory, `${version.id}-v${version.revision}`), instructions = legacyExpertInstructions(version)
  mkdirSync(directory, { recursive: true, mode: 0o700 }); mkdirSync(root, { mode: 0o700 })
  mkdirSync(join(root, '.codex-plugin'))
  const files: Record<string, string> = {
    '.codex-plugin/plugin.json': JSON.stringify({ name: version.id, version: `1.0.${version.revision}`, description: version.definition.name }, null, 2) + '\n',
    'AGENTS.md': instructions.agents + '\n', 'SOUL.md': instructions.soul + '\n',
    'personal-agent.yaml': 'schemaVersion: 1\ninstructions:\n  agents: ./AGENTS.md\n  soul: ./SOUL.md\n',
  }
  for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content, { flag: 'wx', mode: 0o600 })
  const source = { directory: root }, preview = experts.preview(source)
  return { directory: root, entry: experts.save(source, preview.digest, 0), unmapped: ['model', 'preset', 'capabilities'] }
}
