/** Scoped subprocess ownership, including descendants that survive their parent command. */
import { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { expect, it, vi } from 'vitest'
import * as environment from '../src/executor/environment.ts'

it('unloads only its owned process ranges and preserves the Host provider', async () => {
  const root = new Context()
  const empty = Promise.withResolvers<boolean>()
  const handle: SubprocessHandle = {
    stdin: undefined, stdout: undefined, stderr: undefined, control: undefined, collected: {},
    done: Promise.resolve({ exitCode: 0, signal: null }),
    terminate: vi.fn(() => empty.resolve(true)), waitForExit: vi.fn(() => empty.promise),
  }
  const host = { spawn: vi.fn((_spec: SubprocessSpawnSpec) => handle),
    resolveExecutable: vi.fn(async () => '/bin/sh'), terminalEnvironment: vi.fn(async () => ({ platform: 'posix' as const })) }
  root.reflect.provide('subprocess', host)
  root.reflect.provide('superPersonalAgent', { execution: { backend: host,
    environment: () => ({ PATH: '/personal/bin:/usr/bin', GIT_CONFIG_GLOBAL: '/personal/gitconfig', GH_TOKEN: undefined }) } })
  const scope = root.isolate('subprocess')
  const fiber = scope.plugin(environment)
  try {
    await vi.waitFor(() => expect(scope.get('subprocess')).toBeDefined())
    await scope.subprocess.resolveExecutable('sh', { PATH: '/original/bin', EXTRA: 'keep' })
    expect(host.resolveExecutable).toHaveBeenCalledWith('sh', { PATH: '/personal/bin:/usr/bin', EXTRA: 'keep' }, undefined)
    const result = scope.subprocess.spawn({ argv: ['sh'], cwd: '/tmp', graceMs: 2000,
      env: { GH_TOKEN: 'must-be-cleared', EXTRA: 'keep' },
      stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } } })
    await result.done
    expect(host.spawn.mock.calls[0]![0].env).toMatchObject({ PATH: '/personal/bin:/usr/bin', GH_TOKEN: undefined, EXTRA: 'keep' })
    await fiber.dispose()
    expect(handle.terminate).toHaveBeenCalledOnce()
    expect(host.spawn.mock.calls[0]![0].signal?.aborted).toBe(true)
    expect(root.subprocess).toBe(host)
    expect(scope.get('subprocess')).toBeUndefined()
  } finally { await fiber.dispose(); await root.fiber.dispose() }
})
