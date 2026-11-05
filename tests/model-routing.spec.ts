import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { modlensStatus, requireModlens, resolveVisionModel } from '../src/app/model-routing.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
function fixture(modalities?: string[], loaded = true) {
  const ctx = new Context(); contexts.push(ctx)
  const resolve = vi.fn(async value => value)
  const info = vi.fn(async (provider: string) => ({ inputModalities: provider.startsWith('modlens-') || provider === 'deepseek-modlens' ? ['text', 'image'] : modalities }))
  ctx.reflect.provide('llm', { resolveCallConfig: resolve, resolveModelInfo: info })
  ctx.reflect.provide('tools', { get: () => loaded ? {} : undefined })
  return { ctx, resolve, info }
}
it('keeps native image models on their original provider even if the vision engine is absent', async () => {
  const { ctx, resolve } = fixture(['text', 'image'], false)
  const requested = { provider: 'native', model: 'flash', reasoningEffort: 'low' }
  expect(await resolveVisionModel(ctx, requested)).toEqual({ requested, effective: requested, vision: 'native' })
  expect(resolve).toHaveBeenCalledOnce()
  expect(modlensStatus(ctx)).toEqual({ loaded: false, engine: 'not-checked' })
  expect(() => requireModlens(ctx)).toThrow(expect.objectContaining({ code: 'modlensUnavailable' }))
})
it.each([['catboss', 'modlens-catboss'], ['deepseek-official', 'deepseek-modlens']])('resolves %s to %s without changing the model or effort', async (provider, wrapped) => {
  const { ctx } = fixture(['text'])
  const requested = { provider, model: 'text-model', reasoningEffort: 'high' }
  expect(await resolveVisionModel(ctx, requested)).toEqual({ requested, effective: { ...requested, provider: wrapped }, vision: 'modlens' })
})
it('validates a custom wrapper ID through the provider registry', async () => {
  const { ctx, info } = fixture(['text'])
  info.mockImplementation(async provider => ({ inputModalities: provider === 'my-vision' ? ['text', 'image'] : ['text'] }))
  expect((await resolveVisionModel(ctx, { provider: 'custom', model: 'm' }, 'my-vision')).effective.provider).toBe('my-vision')
})
it('does not wrap an already wrapped model a second time', async () => {
  const { ctx, resolve } = fixture(['text'])
  expect((await resolveVisionModel(ctx, { provider: 'modlens-catboss', model: 'm' })).vision).toBe('modlens')
  expect(resolve).toHaveBeenCalledOnce()
})
it.each([undefined, [], ['audio']])('rejects unknown text/image capabilities %j instead of guessing from a name', async modalities => {
  const { ctx } = fixture(modalities)
  await expect(resolveVisionModel(ctx, { provider: 'p', model: 'deepseek-text' })).rejects.toMatchObject({ code: 'capabilitiesUnknown' })
})
it('distinguishes a missing plugin, an unavailable model and an unavailable wrapper', async () => {
  const missing = fixture(['text'], false)
  await expect(resolveVisionModel(missing.ctx, { provider: 'p', model: 'm' })).rejects.toMatchObject({ code: 'modlensUnavailable' })
  const { ctx, resolve, info } = fixture(['text'])
  const cause = new Error('provider removed')
  resolve.mockRejectedValueOnce(cause)
  await expect(resolveVisionModel(ctx, { provider: 'p', model: 'm' })).rejects.toMatchObject({ code: 'modelUnavailable', cause })
  info.mockResolvedValue({ inputModalities: ['text'] })
  await expect(resolveVisionModel(ctx, { provider: 'p', model: 'm' })).rejects.toMatchObject({ code: 'visionRouteUnavailable' })
})
it('propagates cancellation without turning it into a configuration problem', async () => {
  const { ctx, resolve } = fixture(['text'])
  const controller = new AbortController(); controller.abort(new Error('cancelled'))
  await expect(resolveVisionModel(ctx, { provider: 'p', model: 'm' }, undefined, controller.signal)).rejects.toThrow('cancelled')
  expect(resolve).not.toHaveBeenCalled()
})
