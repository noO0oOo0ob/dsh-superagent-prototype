/** Reads external plugin directories without executing hooks or modifying their sources. */
import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, posix } from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { ModelProfileIdSchema } from '../models.ts'
import { mcpIssues } from './mcp.ts'
import { ExpertId, GENERAL_AGENTS, GENERAL_SOUL, type ExpertSnapshot } from './model.ts'
const object = z.record(z.string(), z.unknown())
const paths = z.union([z.string(), z.array(z.string())])
const extension = z.object({
  schemaVersion: z.literal(1),
  instructions: z.object({ agents: z.string().optional(), soul: z.string().optional() }).strict().optional(),
  routing: z.object({ description: z.string().min(1).optional(), examples: z.array(z.string()).default([]), exclusions: z.array(z.string()).default([]) }).strict().optional(),
  entry: z.object({ agent: z.string().optional(), preloadSkills: z.array(z.string()).default([]) }).strict().optional(),
  execution: z.object({ modelProfile: ModelProfileIdSchema.optional() }).strict().optional(),
  requirements: z.object({ mcp: z.object({ required: z.array(z.string()).default([]), optional: z.array(z.string()).default([]) }).strict() }).strict().optional(),
  output: z.object({ guidance: z.string() }).strict().optional(),
}).strict()
/** Bound imports so a directory cannot exhaust the host while being inspected. */
export interface PackageLimits { maxBytes: number; maxFiles: number; maxPromptChars: number }
export interface PackageInput { directory: string; format?: ExpertSnapshot['format']; agents?: string; soul?: string }
function relative(value: string): string {
  if (isAbsolute(value) || value.includes('\\') || value.split('/').includes('..')) throw new Error(`Package path must stay inside its directory: ${value}`)
  return posix.normalize(value.replace(/^\.\//, ''))
}
/** Snapshot all included resources, rejecting links and special files before reading. */
function readFiles(root: string, limits: PackageLimits): { files: Record<string, string>; executables: string[] } {
  if (!isAbsolute(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error('Choose an absolute regular package directory')
  const result: Record<string, string> = {}, executables: string[] = []; let bytes = 0, count = 0
  const walk = (dir: string) => {
    for (const name of readdirSync(join(root, dir)).sort()) {
      if (['.git', 'node_modules', '.DS_Store'].includes(name)) continue
      if (++count > limits.maxFiles) throw new Error('Package exceeds configured import limits')
      if (name === '.env' || name.startsWith('.env.')) throw new Error('Do not include dotenv credential files in expert packages')
      const path = dir ? `${dir}/${name}` : name, stat = lstatSync(join(root, path))
      if (stat.isSymbolicLink()) throw new Error(`Package symlink is unsupported: ${path}`)
      if (stat.isDirectory()) { walk(path); continue }
      if (!stat.isFile()) throw new Error(`Not a regular package file: ${path}`)
      bytes += stat.size
      if (bytes > limits.maxBytes || count > limits.maxFiles) throw new Error('Package exceeds configured import limits')
      if (stat.mode & 0o111) executables.push(path)
      result[path] = readFileSync(join(root, path)).toString('base64')
    }
  }
  walk(''); return { files: result, executables }
}
function markdown(text: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text)
  return match ? { meta: object.parse(parse(match[1]!)), body: match[2]!.trim() } : { meta: {}, body: text.trim() }
}
/** Normalize one selected format, preserving unsupported component diagnostics. */
export function readExpertPackage(input: PackageInput, limits: PackageLimits): ExpertSnapshot {
  const { files, executables } = readFiles(input.directory, limits)
  const text = (path: string) => {
    const key = relative(path), value = files[key]
    if (value === undefined) throw new Error(`Missing package file: ${key}`)
    return Buffer.from(value, 'base64').toString('utf8')
  }
  const candidates = (['portable', 'codex', 'claude'] as const).filter(format => files[{ portable: 'plugin.json', codex: '.codex-plugin/plugin.json', claude: '.claude-plugin/plugin.json' }[format]])
  const format = input.format ?? (candidates.includes('portable') ? 'portable' : candidates.length === 1 ? candidates[0] : undefined)
  if (!format || !candidates.includes(format)) throw new Error('Choose a supported manifest format explicitly when multiple manifests exist')
  const manifest = object.parse(JSON.parse(text({ portable: 'plugin.json', codex: '.codex-plugin/plugin.json', claude: '.claude-plugin/plugin.json' }[format])))
  if (format === 'portable' && manifest.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') throw new Error('Unsupported portable plugin schema')
  const id = ExpertId.parse(manifest.name)
  const ext = files['personal-agent.yaml'] ? extension.parse(parse(text('personal-agent.yaml'))) : undefined
  if (ext?.entry?.agent && ext.instructions?.agents) throw new Error('Choose entry.agent or instructions.agents, not both')
  const issues: string[] = [], defaults: string[] = []
  const listing = (value: unknown, fallback: string[]): string[] => {
    if (value === undefined) return fallback
    const parsed = paths.parse(value); return typeof parsed === 'string' ? [parsed] : parsed
  }
  const under = (path: string, root: string) => path === relative(root) || path.startsWith(`${relative(root).replace(/\/$/, '')}/`)
  const skillRoots = format === 'portable' ? ['skills'] : format === 'claude' ? ['skills', ...listing(manifest.skills, [])] : listing(manifest.skills, ['skills'])
  if (manifest.skills !== undefined && format !== 'portable') for (const root of listing(manifest.skills, [])) {
    if (!Object.keys(files).some(path => under(path, root))) throw new Error(`Missing declared skill path: ${root}`)
  }
  const skillPaths = Object.keys(files).filter(path => path.endsWith('/SKILL.md') && skillRoots.some(root => under(path, root)))
  if (!skillPaths.length && format === 'claude' && manifest.skills === undefined && files['SKILL.md']) skillPaths.push('SKILL.md')
  const skills = skillPaths.map(path => {
    const { meta, body } = markdown(text(path))
    const name = ExpertId.parse(meta.name ?? posix.basename(posix.dirname(path)))
    if (meta.context !== undefined || meta.agent !== undefined) issues.push(`Skill ${name}: context/agent execution semantics require adaptation`)
    return { name, description: z.string().min(1).parse(meta.description), content: body, directory: posix.dirname(path),
      preload: ext?.entry?.preloadSkills.includes(name) ?? false, modelInvocable: meta['disable-model-invocation'] !== true }
  })
  if (new Set(skills.map(skill => skill.name)).size !== skills.length) throw new Error('Duplicate skill names')
  for (const name of ext?.entry?.preloadSkills ?? []) if (!skills.some(skill => skill.name === name)) throw new Error(`Missing preload skill: ${name}`)
  const agents = format === 'claude' ? Object.keys(files).filter(path => path.endsWith('.md') && listing(manifest.agents, ['agents']).some(root => under(path, root))) : []
  let agentsText = input.agents
  if (agentsText === undefined) {
    const selected = ext?.instructions?.agents ?? ext?.entry?.agent ?? (files['AGENTS.md'] !== undefined ? 'AGENTS.md' : agents.length === 1 ? agents[0] : undefined)
    if (selected) {
      const md = markdown(text(selected)); agentsText = md.body
      if (selected !== ext?.instructions?.agents && selected !== 'AGENTS.md') {
        for (const key of Object.keys(md.meta)) if (!['name', 'description'].includes(key)) issues.push(`Agent field ${key} requires explicit host mapping`)
      }
    } else if (agents.length > 1) issues.push('Multiple agents: configure entry.agent')
  }
  if (agentsText === undefined) { agentsText = GENERAL_AGENTS; defaults.push('AGENTS.md') }
  const soul = input.soul ?? (ext?.instructions?.soul ? text(ext.instructions.soul) : files['SOUL.md'] !== undefined ? text('SOUL.md') : undefined)
  if (soul === undefined) defaults.push('SOUL.md')
  const finalAgents = agentsText + (ext?.output ? `\n\n${text(ext.output.guidance)}` : '')
  if (!finalAgents.trim() || !(soul ?? GENERAL_SOUL).trim()) throw new Error('AGENTS and SOUL must both be nonempty')
  if (finalAgents.length + (soul ?? GENERAL_SOUL).length + skills.filter(skill => skill.preload).reduce((n, skill) => n + skill.content.length, 0) > limits.maxPromptChars) throw new Error('Expert instructions exceed prompt budget')
  let mcp: Record<string, unknown> = {}
  const mcpSource = format === 'portable' ? files['mcp.json'] ? './mcp.json' : undefined : manifest.mcpServers ?? (format === 'claude' && files['.mcp.json'] ? './.mcp.json' : undefined)
  if (mcpSource !== undefined) {
    if (typeof mcpSource === 'string') mcp = object.parse(object.parse(JSON.parse(text(mcpSource))).mcpServers)
    else mcp = object.parse(mcpSource)
  }
  for (const component of ['hooks', 'commands', 'lspServers', 'apps', 'settings', 'outputStyles', 'monitors']) {
    if (manifest[component] !== undefined || Object.keys(files).some(path => path.startsWith(`${component}/`)) || files[`.${component === 'apps' ? 'app' : component}.json`]) issues.push(`Unsupported component: ${component}`)
  }
  const extensions = manifest.extensions ? object.parse(manifest.extensions) : undefined
  const overlay = format === 'portable' && files['.codex-plugin/plugin.json'] ? object.parse(JSON.parse(text('.codex-plugin/plugin.json'))) : undefined
  const openai = extensions?.['com.openai'] ? object.parse(extensions['com.openai']) : overlay
  if (openai?.hooks || openai?.apps) issues.push('OpenAI hooks/apps require host-specific integration')
  for (const name of ext?.requirements?.mcp.required ?? []) if (!(name in mcp)) throw new Error(`Missing required MCP: ${name}`)
  const optional = ext?.requirements?.mcp.optional ?? []
  if (optional.some(name => ext?.requirements?.mcp.required.includes(name))) throw new Error('An MCP server cannot be both required and optional')
  issues.push(...mcpIssues(mcp))
  const value = { schemaVersion: 1 as const, id, name: typeof manifest.displayName === 'string' ? manifest.displayName : id,
    version: typeof manifest.version === 'string' ? manifest.version : 'unversioned', format,
    description: ext?.routing?.description ?? z.string().min(1).parse(manifest.description),
    examples: ext?.routing?.examples ?? [], exclusions: ext?.routing?.exclusions ?? [], agentsSource: agentsText, agents: finalAgents, soul: soul ?? GENERAL_SOUL,
    defaults, skills, files, executables, issues, mcp, optionalMcp: ext?.requirements?.mcp.optional ?? [], ...(ext?.execution?.modelProfile ? { modelProfile: ext.execution.modelProfile } : {}) }
  return { ...value, digest: createHash('sha256').update(JSON.stringify(value)).digest('hex') }
}
