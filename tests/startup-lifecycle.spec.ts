/** Plugin activation must not wait on a preset that consumes its own service. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import * as plugin from '../src/index.ts'
import * as environment from '../src/executor/environment.ts'

const state = vi.hoisted(() => ({ disposePresets: [] as (() => Promise<void>)[], stop: vi.fn() }))
vi.mock('../src/app/runtime.ts', async () => {
  const { Service } = await import('@deepseek-ai/cordis')
  return { Runtime: class extends Service {
    readonly ready: Promise<void>
    readonly execution = { backend: {}, environment: () => ({ PATH: '/usr/bin' }) }
    constructor(ctx: Context) {
      super(ctx, 'superPersonalAgent')
      const scope = ctx.root.isolate('subprocess')
      const ready = Promise.withResolvers<void>()
      const preset = scope.plugin(environment)
      const consumer = scope.inject(['subprocess'], () => { ready.resolve() })
      state.disposePresets.push(async () => { await consumer.dispose(); await preset.dispose(); ready.resolve() })
      this.ready = ready.promise
    }
    configured() { return true }
    async stop() { state.stop() }
  } }
})

it('activates the scoped subprocess provider before awaiting Main Session readiness', async () => {
  const root = new Context()
  for (const name of plugin.inject) root.reflect.provide(name, {})
  const boot = root.plugin(plugin, { stateDir: '/srv/personal-agent' })
  try {
    await vi.waitFor(() => expect(boot.state).toBe(2), { timeout: 500 })
    await boot
    expect(root.get('superPersonalAgent')).toBeDefined()
  } finally {
    for (const dispose of state.disposePresets.splice(0)) await dispose()
    await boot.dispose()
    await root.fiber.dispose()
  }
  expect(state.stop).toHaveBeenCalledOnce()
})
