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
