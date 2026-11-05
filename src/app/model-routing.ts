/** Resolves image-capable execution routes without changing models on an existing Session. */
import type { Context } from '@deepseek-ai/cordis'
import type { ResolvedModelRoute, RoleModel } from '../models.ts'
import { resolveRoleModel } from './role-models.ts'

export type ModelRoutingCode = 'modlensUnavailable' | 'modelUnavailable' | 'capabilitiesUnknown' | 'visionRouteUnavailable'

/** A failed preflight leaves task creation and Session selection untouched. */
export class ModelRoutingError extends Error {
  constructor(readonly code: ModelRoutingCode, message: string, options?: ErrorOptions) { super(message, options); this.name = 'ModelRoutingError' }
}

/** Loaded tool registration is a runtime check; it does not claim that a vision engine has authenticated or read an image. */
export function modlensStatus(ctx: Context): { loaded: boolean; engine: 'not-checked' } {
  return { loaded: !!ctx.tools.get('modlens_read_image'), engine: 'not-checked' }
}

/** Require the installed plugin to be active before enabling model profiles or accepting new managed work. */
export function requireModlens(ctx: Context): void {
  if (!modlensStatus(ctx).loaded) throw new ModelRoutingError('modlensUnavailable',
    'ModLens is not loaded. Install and enable @liustack/modlens in this DSH profile, then configure its vision engine in Plugins.')
}

/** Resolve the original model or its validated ModLens provider. Unknown modalities and unavailable wrappers fail visibly.
 * @param ctx - Host services, outside the Worker's restricted tool scope.
 * @param requested - Base provider, exact model ID, and optional reasoning effort.
 * @param visionProvider - Explicit wrapper ID for a ModLens installation using a custom providerId.
 * @param signal - Cancellation of provider discovery and resolution.
 * @returns A serializable route to persist before dispatch; no model request is sent.
 */
export async function resolveVisionModel(ctx: Context, requested: RoleModel, visionProvider?: string, signal?: AbortSignal): Promise<ResolvedModelRoute> {
  signal?.throwIfAborted()
  let base: RoleModel
  let modalities: readonly string[] | undefined
  try {
    base = await resolveRoleModel(ctx, requested, signal)
    modalities = (await ctx.llm.resolveModelInfo(base.provider, base.model, signal)).inputModalities
  } catch (cause) {
    signal?.throwIfAborted()
    throw new ModelRoutingError('modelUnavailable', `Cannot resolve ${requested.provider}/${requested.model}. Check the provider and model settings.`, { cause })
  }
  if (modalities?.includes('image')) {
    const wrapped = base.provider === 'deepseek-modlens' || base.provider.startsWith('modlens-') || base.provider === visionProvider
    if (wrapped) requireModlens(ctx)
    return { requested: { ...requested }, effective: base, vision: wrapped ? 'modlens' : 'native' }
  }
  if (!modalities?.includes('text')) throw new ModelRoutingError('capabilitiesUnknown',
    `${base.provider}/${base.model} has no declared input capabilities. Declare text/image support in the DSH provider before selecting it.`)
  requireModlens(ctx)
  const provider = visionProvider ?? (base.provider === 'deepseek-official' ? 'deepseek-modlens' : `modlens-${base.provider}`)
  try {
    const effective = await resolveRoleModel(ctx, { ...base, provider }, signal)
    const info = await ctx.llm.resolveModelInfo(effective.provider, effective.model, signal)
    if (!info.inputModalities?.includes('image')) throw new Error('The wrapper does not declare image input')
    return { requested: { ...requested }, effective, vision: 'modlens' }
  } catch (cause) {
    signal?.throwIfAborted()
    throw new ModelRoutingError('visionRouteUnavailable',
      `ModLens route ${provider}/${base.model} is unavailable. Check its families/discover configuration or specify its custom provider ID.`, { cause })
  }
}
