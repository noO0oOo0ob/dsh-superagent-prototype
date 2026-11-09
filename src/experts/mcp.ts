/** Converts supported package MCP definitions to scoped DSH client configuration. */
import { createHash } from 'node:crypto'
import { isAbsolute, resolve, sep } from 'node:path'
import { z } from 'zod'
import type { Config } from '@deepseek-ai/dsh-mcp-client'
const server = z.object({ type: z.enum(['stdio', 'http', 'streamable-http']).optional(), command: z.string().optional(),
  args: z.array(z.string()).optional(), env: z.record(z.string(), z.string()).optional(), cwd: z.string().optional(),
  url: z.string().optional(), headers: z.record(z.string(), z.string()).optional() }).strict()
/** Unknown transports, auth extensions and fields remain visible compatibility issues. */
export function mcpIssues(definitions: Record<string, unknown>): string[] {
  return Object.entries(definitions).flatMap(([name, value]) => {
    const parsed = server.safeParse(value)
    if (!parsed.success) return [`MCP ${name}: unsupported configuration (${parsed.error.issues.map(issue => issue.message).join('; ')})`]
    const item = parsed.data
    if (item.command && item.url || !item.command && !item.url) return [`MCP ${name}: specify exactly one command or URL`]
    if (item.command && item.type && item.type !== 'stdio' || item.url && item.type === 'stdio') return [`MCP ${name}: transport does not match configuration`]
    return []
  })
}
/** Resolve references without shell expansion; credentials are not included in prompts. */
export function mcpConfig(name: string, value: unknown, root: string, session: string, timeoutMs: number, environment: NodeJS.ProcessEnv = process.env): Config {
  const problems = mcpIssues({ [name]: value }); if (problems.length) throw new Error(problems.join('; '))
  const input = server.parse(value)
  const expand = (value: string): string => value.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
    if (['CLAUDE_PLUGIN_ROOT', 'CODEX_PLUGIN_ROOT', 'PLUGIN_ROOT'].includes(key)) return root
    const resolved = environment[key]
    if (resolved === undefined) throw new Error(`MCP ${name}: missing environment variable ${key}`)
    return resolved
  })
  const values = (items: Record<string, string> = {}) => Object.fromEntries(Object.entries(items).map(([key, value]) => [key, expand(value)]))
  const shared = { serverName: `exp_${createHash('sha256').update(`${session}:${name}`).digest('hex').slice(0, 24)}`, toolCallTimeoutMs: timeoutMs, failOnStartupError: true }
  if (input.command) {
    const cwd = resolve(root, expand(input.cwd ?? '.'))
    if (cwd !== root && !cwd.startsWith(root + sep)) throw new Error(`MCP ${name}: cwd must remain in the package snapshot`)
    const command = expand(input.command)
    return { ...shared, transport: 'stdio', command: command.includes('/') && !isAbsolute(command) ? resolve(root, command) : command,
      args: (input.args ?? []).map(expand), env: values(input.env), cwd }
  }
  const url = new URL(expand(input.url!))
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error(`MCP ${name}: unsupported URL protocol`)
  return { ...shared, transport: 'streamable-http', url: url.href, headers: values(input.headers) }
}
