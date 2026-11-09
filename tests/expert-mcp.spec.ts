/** MCP packages preserve namespaces and resolve root/environment references without shell evaluation. */
import { expect, it } from 'vitest'
import { mcpConfig, mcpIssues } from '../src/experts/mcp.ts'
it('maps stdio arguments and environment with task-local namespaces', () => {
  const input = { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server.js'], env: { TOKEN: '${TEST_TOKEN}' } }
  const value = mcpConfig('maps', input, '/snapshot', 'worker-a', 1000, { TEST_TOKEN: 'secret' })
  expect(value).toMatchObject({ transport: 'stdio', command: 'node', args: ['/snapshot/server.js'], env: { TOKEN: 'secret' }, cwd: '/snapshot', failOnStartupError: true })
  expect(value.serverName).not.toBe(mcpConfig('maps', input, '/snapshot', 'worker-b', 1000, { TEST_TOKEN: 'secret' }).serverName)
  expect(() => mcpConfig('maps', input, '/snapshot', 'worker-a', 1000, {})).toThrow('TEST_TOKEN')
})
it('maps HTTP while rejecting unsupported semantics instead of dropping them', () => {
  expect(mcpConfig('search', { type: 'http', url: 'https://example.com/mcp' }, '/snapshot', 'a', 1000)).toMatchObject({ transport: 'streamable-http' })
  expect(mcpIssues({ search: { type: 'sse', url: 'https://example.com' } })).not.toEqual([])
  expect(mcpIssues({ search: { url: 'https://example.com', auth: { type: 'oauth' } } })).not.toEqual([])
  expect(() => mcpConfig('bad', { command: 'node', cwd: '..' }, '/snapshot', 'a', 1000)).toThrow('cwd')
})

it('connects a package MCP server in a real DSH scope and removes its tools on disposal', async () => {
  const { createServer } = await import('node:http')
  const { Context } = await import('@deepseek-ai/cordis')
  const { createScope } = await import('@deepseek-ai/dsh-scope')
  const { default: SystemPrompt } = await import('@deepseek-ai/dsh-system-prompt')
  const { default: ToolRuntime } = await import('@deepseek-ai/dsh-tools')
  const { apply } = await import('@deepseek-ai/dsh-mcp-client')
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return }
    let body = ''; for await (const chunk of req) body += String(chunk)
    const message = JSON.parse(body) as { id?: number; method: string; params?: { protocolVersion?: string } }
    if (message.id === undefined) { res.writeHead(202).end(); return }
    const result = message.method === 'initialize'
      ? { protocolVersion: message.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'offline-test', version: '1' } }
      : message.method === 'tools/list' ? { tools: [{ name: 'lookup', description: 'Local test', inputSchema: { type: 'object', properties: {} } }] }
      : { content: [{ type: 'text', text: 'Local result' }] }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test address')
  const ctx = new Context(), owner = {}, other = {}
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const fork = ctx.plugin({ inject: ['tools'], async apply(inner) {
      const scope = createScope(inner, owner)
      await apply(scope.ctx, mcpConfig('maps', { url: `http://127.0.0.1:${address.port}/mcp` }, '/snapshot', 'worker', 1000))
    } })
    await fork
    expect(ctx.tools.schemas(owner).map(tool => tool.name)).toHaveLength(1)
    expect(ctx.tools.schemas(other)).toEqual([])
    await fork.dispose()
    expect(ctx.tools.schemas(owner)).toEqual([])
  } finally {
    await ctx.fiber.dispose()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
