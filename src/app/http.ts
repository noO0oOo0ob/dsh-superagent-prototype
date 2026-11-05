/** Loopback-only management HTTP routes with same-origin enforcement for the web panel. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { THREAD_FILTERS, TICKET_FILTERS, type Api, type ApiResponse, type RouteParams } from './api.ts'
import { sourceSkills } from './context.ts'
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import { PromptConflict, SKILL_NAME, SKILL_PREFIX, TEAM_SECTIONS, builtInBase, builtInParts, defaultPrompts, savePrompts, type Prompts }
  from './prompts.ts'
import { policyVersion } from '../policy.ts'
import { SettingsConflict, type Settings } from './settings.ts'
import { SetupError, type SetupProblem } from '../setup.ts'
import { WorkerModelsSchema, type WorkerModels } from '../models.ts'
import type { inspectWorkerModels } from './worker-models.ts'
import { UserError, type EngineForPeople, type Ticket } from '../core/index.ts'
import type { Deployment, Machine } from '../deployment.ts'
import type { DshExecutor } from '../executor/dsh.ts'
import type { Health } from '../sources/host.ts'
import type { SourceRegistry } from '../sources/registry.ts'
import type { Sessions } from './sessions.ts'
import type { Store } from './store.ts'
import type { TextCache } from './cache.ts'
import type { LinkTarget, ViewHost } from './views/records.ts'
import type { Variable } from './execution-environment.ts'
import { policyHistory } from './settings-history.ts'
import { overview } from './views/overview.ts'
import { settingsView } from './views/settings.ts'
import { sourcesStatus, type SetupState } from './views/sources.ts'
import { decisionList, search, threadDetail, threadList } from './views/threads.ts'
import { executorLoad, ticketDetail, ticketList } from './views/tickets.ts'
import { resultHtml, type Results } from './results.ts'
import { PersonalConflict, type PersonalSettings } from '../personal/config.ts'
import type { Vault } from '../personal/vault.ts'
import type { Routing } from '../personal/routing.ts'
import { ScheduleConflict, type Schedules } from '../personal/schedules.ts'
import type { Hooks } from '../personal/hooks.ts'
import type { Effects } from './effects.ts'
import type { NativeFeishu } from '../connectors/native-feishu.mjs'
import type { MessageDelivery } from '../messaging/delivery.ts'
import type { Connectors } from './connectors.ts'

export interface HttpHost {
  readonly store: Store
  /** Feishu message links resolved since startup, used by search to match AppLink URLs. */
  readonly sourceLinks: Pick<TextCache, 'entries'>
  readonly sources: SourceRegistry
  readonly prompts: Pick<Prompts, 'current' | 'version' | 'history' | 'preview' | 'save' | 'defaultChanged'>
  readonly sessions: Pick<Sessions, 'status' | 'notify' | 'delivery'>
  readonly settings: Pick<Settings, 'view' | 'save' | 'pause' | 'sync' | 'refreshLabels'>
  readonly engine: EngineForPeople
  readonly executor: Pick<DshExecutor, 'activeCount'>
  readonly health: Record<string, Health>
  readonly machine: Machine
  readonly masterId: string
  readonly results?: Results
  readonly personal?: PersonalSettings
  readonly connectors?: Connectors
  readonly nativeFeishu?: NativeFeishu
  readonly messageDelivery?: MessageDelivery
  readonly vault?: Vault
  readonly routing?: Routing
  readonly schedules?: Schedules
  readonly hooks?: Hooks
  readonly effects?: Effects
  /** Resolves once startup finishes or setup determines what is still missing. */
  readonly ready: Promise<void>
  /** Resolved deployment; throws if read while waiting for setup (`!configured()`). */
  readonly deployment: Deployment
  readonly setupProblem?: SetupProblem | undefined
  readonly feishuProblem?: SetupProblem | undefined
  readonly githubProblem?: SetupProblem | undefined
  configured(): boolean
  links(): LinkTarget
  ticketEnvironment(ticket: Ticket): Variable[]
  checkSetup(): void
  requestPass(): void
  models(): Promise<ModelCatalog>
  workerModels(config?: WorkerModels): ReturnType<typeof inspectWorkerModels>
}
/**
 * Represents a client-facing 400 or 404 error raised during management route parsing or lookup.
 * Route handlers throw it when request bodies are malformed or target records are missing, and registerHttp serializes its status and message in the HTTP response.
 */
class RouteError extends Error { constructor(readonly status: 400 | 404, message: string) { super(message) } }
async function readBody(req: IncomingMessage, maxBytes = 128 * 1024): Promise<unknown> {
  let size = 0; const chunks: Buffer[] = []
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk); size += bytes.length
    if (size > maxBytes) throw new RouteError(400, `Request exceeds ${maxBytes} bytes`)
    chunks.push(bytes)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new RouteError(400, 'The request body is not JSON') }
}
function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value))
}
export function sameOrigin(req: Pick<IncomingMessage, 'headers'>, port: number): boolean {
  const host = req.headers.host
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return false
  return req.headers['x-super-personal-agent-request'] === '1' && (req.headers.origin === undefined || req.headers.origin === `http://${host}`)
}
/** Allows local result navigation from either supported loopback origin, without allowing cross-origin embedding. */
export function resultNavigationAllowed(headers: IncomingMessage['headers'], port: number): boolean {
  const allowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`])
  if (!allowed.has(`http://${headers.host}`) || headers.origin !== undefined && !allowed.has(headers.origin)) return false
  const site = headers['sec-fetch-site']
  if (site === undefined || site === 'none' || site === 'same-origin') return true
  try { return typeof headers.referer === 'string' && allowed.has(new URL(headers.referer).origin)
    && headers['sec-fetch-mode'] === 'navigate' && headers['sec-fetch-dest'] === 'document' }
  catch { return false }
}
/** Maps errors to HTTP status codes and structured payloads that the panel localizes in the interface language. */
function failure(error: unknown): [number, Record<string, unknown>] {
  if (error instanceof z.ZodError) {
    const issues = error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
    return [400, { error: `Invalid settings: ${issues.map(issue => issue.path).join(', ')}`, issues }]
  }
  if (error instanceof SetupError) return [400, { error: error.message, setup: error.problem }]
  if (error instanceof RouteError) return [error.status, { error: error.message }]
  if (error instanceof UserError) return [error.missing ? 404 : 400, { error: error.message, code: error.code, values: error.values }]
  if (error instanceof ScheduleConflict || error instanceof PersonalConflict || error instanceof SettingsConflict || error instanceof PromptConflict) return [409, { error: error.message }]
  return [500, { error: error instanceof Error ? error.message : String(error) }]
}

function machineView({ stateDir, promptMaxChars, admissionContextMaxPages, admissionContextTimeoutMs }: Machine) {
  return { stateDir, promptMaxChars: promptMaxChars.get(), admissionContextMaxPages: admissionContextMaxPages.get(),
    admissionContextTimeoutMs: admissionContextTimeoutMs.get() }
}
function setupView(runtime: HttpHost) {
  const resolved = runtime.configured() ? runtime.deployment : undefined
  return {
    machine: machineView(runtime.machine), problem: runtime.setupProblem ?? null, feishuProblem: runtime.feishuProblem ?? null, githubProblem: runtime.githubProblem ?? null,
    accounts: resolved ? { repository: resolved.repository, agent: resolved.github?.login ?? '', feishu: resolved.feishu ? { appId: resolved.feishu.appId, brand: resolved.feishu.brand, botId: resolved.feishu.botId, name: resolved.feishu.name } : null } : null,
  }
}
/** Build the `/super-personal-agent/api/state` response consumed by the management panel and `scripts/dsh-super-personal-agent status` (`docs/006-deployment.md`). */
export function stateView(runtime: HttpHost) {
  const settings = runtime.store.settings()
  return { setup: setupView(runtime), load: { ...executorLoad(runtime.store, runtime.executor.activeCount()),
    maxWorkers: settings.executor.maxWorkers },
    masterId: runtime.masterId, paused: settings.paused, health: runtime.health }
}
const views = (runtime: HttpHost): ViewHost => ({ store: runtime.store, sources: runtime.sources, links: runtime.links() })
const setupState = (runtime: HttpHost): SetupState => ({ deployment: runtime.configured() ? runtime.deployment : undefined,
  problem: runtime.setupProblem, feishuProblem: runtime.feishuProblem, githubProblem: runtime.githubProblem })
export type StateView = ReturnType<typeof stateView>
/** Builds a ticket's detail view; `environment` is empty while waiting for setup because it requires the resolved deployment. */
function ticketPage(runtime: HttpHost, id: string) {
  const detail = ticketDetail(views(runtime), id), ticket = runtime.store.tickets.get(id)
  if (!detail || !ticket) throw new RouteError(404, 'Ticket not found')
  return { ...detail, environment: runtime.configured() ? runtime.ticketEnvironment(ticket) : [] }
}
export type TicketPageView = ReturnType<typeof ticketPage>
function promptsView(runtime: HttpHost, revision: number | undefined, offset: number) {
  const current = runtime.prompts.current()
  const shown = revision === undefined || revision === current.revision ? current : runtime.prompts.version(revision)
  // Each built-in part with the key of its text, which an override records as its base, and for the overrides shown whose
  // built-in text changed since, the text they were edited from when known.
  const parts = Object.entries(builtInParts()).map(([key, part]) => ({ key, ...part, base: builtInBase(part.text) }))
  return { masterId: runtime.masterId, current: shown, defaults: defaultPrompts(), sections: TEAM_SECTIONS, skillName: SKILL_NAME.source,
    builtin: Object.keys(sourceSkills), skillPrefix: SKILL_PREFIX, parts, defaultChanged: runtime.prompts.defaultChanged(shown.config),
    ...runtime.sessions.status(), ...runtime.prompts.history(offset) }
}
export type PromptsView = ReturnType<typeof promptsView>

interface Input<K extends keyof Api> {
  params: RouteParams<K>; query: Record<string, string>; body: (maxBytes?: number) => Promise<unknown>
}
type Routes = { [K in keyof Api]: (input: Input<K>) => ApiResponse<K> | Promise<ApiResponse<K>> }
const offset = z.coerce.number().int().nonnegative().catch(0)
const limit = (fallback: number, max: number) => z.coerce.number().int().positive().catch(fallback).transform(value => Math.min(max, value))
const TicketsQuery = z.object({ state: z.enum(TICKET_FILTERS).catch('open'), offset, limit: limit(20, 1000) })
const ThreadsQuery = z.object({ filter: z.enum(THREAD_FILTERS).catch('subscribed'), offset, limit: limit(20, 1000) })
const ThreadQuery = z.object({ limit: limit(50, 100), before: z.string().optional(), around: z.string().optional() })
const DecisionsQuery = z.object({ kind: z.string().default(''), window: z.literal('24h').optional().catch(undefined), offset,
  limit: limit(30, 200) })
const count = z.coerce.number().int().nonnegative()
const PromptsQuery = z.object({ revision: count.optional(), offset: count.default(0) })
const SourceBlock = z.templateLiteral(['source:', z.string().regex(/^[a-z][a-z0-9-]*$/)])
const SettingsBlockSchema = z.union([z.enum(['policy', 'eval', 'executor']), SourceBlock])
const SaveRequest = z.object({ value: z.unknown(), revision: z.number().int().nonnegative() })

function routes(runtime: HttpHost): Routes {
  const { store } = runtime
  const ticket = (id: string) => { if (!store.tickets.get(id)) throw new RouteError(404, 'Ticket not found'); return id }
  const promptBody = (input: { body: (maxBytes?: number) => Promise<unknown> }) => input.body(4 * runtime.machine.promptMaxChars.get() + 4096)
  return {
    'GET personal': () => {
      if (!runtime.personal || !runtime.connectors) throw new RouteError(404, 'Personal runtime is unavailable')
      return { ...runtime.personal.view(), connectors: runtime.connectors.status(), deliveries: runtime.connectors.pending(), vault: runtime.vault?.list() ?? [],
        routeDecisions: runtime.routing?.list() ?? [], schedules: runtime.schedules?.list() ?? [], runs: runtime.schedules?.runs() ?? [], hooks: runtime.hooks?.deliveries() ?? [] }
    },
    'PUT personal': async ({ body }) => {
      if (!runtime.personal || !runtime.connectors) throw new RouteError(404, 'Personal runtime is unavailable')
      const value = z.object({ revision: z.number().int().nonnegative(), config: z.unknown() }).strict().parse(await body())
      const saved = runtime.personal.save(value.config, value.revision)
      await runtime.connectors.refresh()
      return saved
    },
    'POST personal/feishu': async ({ body }) => {
      if (!runtime.nativeFeishu) throw new RouteError(404, 'Native Feishu requires the DSH credentials service')
      const input = z.object({ endpoint: z.string().min(1).max(100), payload: z.unknown() }).strict().parse(await body(64_000))
      return runtime.nativeFeishu.rpc(input.endpoint, input.payload)
    },
    'GET personal/messages': () => runtime.messageDelivery?.list() ?? [],
    'POST personal/messages/:id': async ({ params, body }) => {
      if (!runtime.messageDelivery) throw new RouteError(404, 'Message center unavailable')
      const input = z.object({ partId: z.string(), action: z.enum(['confirm_sent', 'retry']), note: z.string().trim().min(1).max(2000) }).strict().parse(await body())
      runtime.messageDelivery.reconcile(params.id, input.partId, input.action, input.note)
      runtime.effects?.enqueue('reply', params.id, {})
      return { recorded: true }
    },
    'GET personal/providers': () => runtime.connectors?.definitions() ?? [],
    'POST personal/providers/:id': async ({ params, body }) => {
      if (!runtime.connectors) throw new RouteError(404, 'Connectors are unavailable')
      const input = z.object({ endpoint: z.string().min(1).max(100), payload: z.unknown() }).strict().parse(await body(64_000))
      return runtime.connectors.manage(params.id, input.endpoint, input.payload)
    },
    'GET personal/bots': async () => ({ bots: await runtime.connectors?.discover() ?? [] }),
    'POST personal/deliveries/:id': async ({ params, body }) => {
      if (!runtime.connectors) throw new RouteError(404, 'Connectors are unavailable')
      const value = z.object({ action: z.enum(['confirm_sent', 'retry']), note: z.string().trim().min(1).max(1000) }).strict().parse(await body())
      runtime.connectors.reconcile(params.id, value.action, value.note)
      runtime.effects?.enqueue('reply', params.id, {})
      runtime.requestPass()
      return { recorded: true }
    },
    'POST personal/schedules': async ({ body }) => {
      if (!runtime.schedules) throw new RouteError(404, 'Schedules unavailable')
      const value = z.object({ spec: z.unknown() }).strict().parse(await body())
      const record = runtime.schedules.create(value.spec); runtime.requestPass(); return record
    },
    'PUT personal/schedules/:id': async ({ params, body }) => {
      if (!runtime.schedules) throw new RouteError(404, 'Schedules unavailable')
      const value = z.object({ spec: z.unknown(), revision: z.number().int().positive() }).strict().parse(await body())
      const record = runtime.schedules.update(params.id, value.spec, value.revision); runtime.requestPass(); return record
    },
    'POST personal/schedules/:id': async ({ params, body }) => {
      if (!runtime.schedules) throw new RouteError(404, 'Schedules unavailable')
      const value = z.object({ action: z.enum(['pause', 'resume', 'stop']) }).strict().parse(await body())
      const record = runtime.schedules[value.action](params.id); runtime.requestPass(); return record
    },
    'POST personal/runs/:id/retry': ({ params }) => {
      if (!runtime.schedules) throw new RouteError(404, 'Schedules unavailable')
      const record = runtime.schedules.retry(params.id); runtime.requestPass(); return record
    },
    'GET personal/hooks': () => runtime.hooks?.list() ?? [],
    'POST personal/hooks/:id': async ({ params, body }) => {
      if (!runtime.hooks) throw new RouteError(404, 'Hooks unavailable')
      const value = z.object({ action: z.enum(['retry', 'replay']) }).strict().parse(await body())
      const record = runtime.hooks[value.action](params.id); runtime.requestPass(); return record
    },
    'POST personal/vault/:id': ({ params }) => {
      const result = runtime.results?.get(params.id)
      if (!result) throw new RouteError(404, 'Result not found')
      const intent = runtime.vault?.enqueue(result)
      if (intent) runtime.effects?.enqueue('vault', intent.id, { id: intent.id })
      return { queued: !!intent }
    },
    'GET state': () => stateView(runtime),
    'GET overview': () => overview(views(runtime), runtime.health, policyVersion(store.settings()),
      executorLoad(store, runtime.executor.activeCount()), runtime.setupProblem ?? runtime.githubProblem ?? runtime.feishuProblem),
    'GET search': ({ query }) => search(views(runtime), query.q ?? '', runtime.sourceLinks),
    'GET sources': () => sourcesStatus(views(runtime), runtime.health, setupState(runtime)),
    'GET settings': () => settingsView(store, runtime.sources, runtime.health, setupState(runtime), runtime.machine.stateDir),
    'POST sources/:id/labels': ({ params }) => runtime.settings.refreshLabels(params.id),
    'GET threads': ({ query }) => {
      const { filter, offset, limit } = ThreadsQuery.parse(query)
      return threadList(views(runtime), filter, offset, limit)
    },
    'GET threads/:key': ({ params, query }) => {
      const { limit, before, around } = ThreadQuery.parse(query)
      const detail = threadDetail(views(runtime), params.key, before, limit, around)
      if (!detail) throw new RouteError(404, 'Thread not found')
      return detail
    },
    'POST threads/:key/unsubscribe': async ({ params }) => {
      const removed = runtime.engine.unsubscribe(params.key)
      return { removed, thread: params.key, context_delivery: await runtime.sessions.delivery(`subscription:${params.key}`) }
    },
    'POST triggers/:id/requeue': ({ params }) => {
      const queued = runtime.engine.reevaluate(params.id)
      runtime.requestPass()
      return { queued }
    },
    'GET decisions': ({ query }) => {
      const { kind, window, offset, limit } = DecisionsQuery.parse(query)
      const since = window ? new Date(Date.now() - 86_400_000).toISOString() : ''
      return decisionList(views(runtime), kind.split(',').filter(Boolean), offset, limit, since)
    },
    'POST decisions/:id/dismiss': ({ params }) => { runtime.engine.dismiss(params.id); return { dismissed: true } },
    'GET tickets': ({ query }) => {
      const { state, offset, limit } = TicketsQuery.parse(query)
      return ticketList(views(runtime), state, offset, limit)
    },
    'GET tickets/:id': ({ params }) => ticketPage(runtime, params.id),
    'POST tickets/:id/retry': ({ params }) => { const id = ticket(params.id); runtime.engine.retryTicket(id); return { retried: true } },
    'POST tickets/:id/stop': ({ params }) => { const id = ticket(params.id); runtime.engine.stopTicket(id); return { stopped: true } },
    'POST executor/pause': async ({ body }) => runtime.settings.pause(z.object({ paused: z.boolean() }).parse(await body()).paused, 'panel'),
    'PUT settings/:block': async ({ params, body }) => {
      const block = SettingsBlockSchema.parse(params.block)
      const known = !block.startsWith('source:') || runtime.sources.instances().some(instance => `source:${instance.id}` === block)
      if (!known) throw new RouteError(404, 'Source not found')
      const request = SaveRequest.parse(await body())
      return runtime.settings.save(block, request.value, request.revision, 'panel')
    },
    'GET policy/history': () => policyHistory(store, runtime.sources, policyVersion(store.settings())),
    'POST policy-sync/:id': async ({ params }) => ({ policy: await runtime.settings.sync(params.id) }),
    'POST setup/check': () => { runtime.checkSetup(); return { restarting: true } },
    'GET models': () => runtime.models(),
    'GET worker-models': () => runtime.workerModels(),
    'POST worker-models/check': async input => runtime.workerModels(WorkerModelsSchema.parse(await promptBody(input))),
    'GET prompts': ({ query }) => { const { revision, offset } = PromptsQuery.parse(query); return promptsView(runtime, revision, offset) },
    'PUT prompts': async input => {
      const request = z.object({ config: z.unknown(), baseRevision: z.number().int().nonnegative() }).parse(await promptBody(input))
      return savePrompts(runtime, request.config, request.baseRevision, 'panel')
    },
    'POST prompts/preview': async input => runtime.prompts.preview(await promptBody(input)),
  }
}
function decoded(segment: string): string {
  try { return decodeURIComponent(segment) } catch { throw new RouteError(400, 'A path segment has a malformed escape') }
}
function match(table: Routes, method: string, segments: string[]) {
  for (const [route, run] of Object.entries(table)) {
    const [verb, path] = route.split(' ') as [string, string]
    const pattern = path.split('/')
    const fits = pattern.length === segments.length && pattern.every((part, index) => part.startsWith(':') || part === segments[index])
    if (verb !== method || !fits) continue
    const params: Record<string, string> = {}
    pattern.forEach((part, index) => { if (part.startsWith(':')) params[part.slice(1)] = decoded(segments[index]!) })
    return { run: run as (input: Input<keyof Api>) => unknown, params }
  }
  return undefined
}
export function registerHttp(ctx: Context, runtime: HttpHost): () => void {
  if (ctx.webServer.host !== '127.0.0.1') throw new Error('Orchestrator management requires a loopback Web server')
  const table = routes(runtime)
  const disposers = [
    ctx.webServer.register({ kind: 'prefix', path: '/super-personal-agent', handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname.startsWith('/super-personal-agent/artifact/') && req.method === 'GET') {
        if (!resultNavigationAllowed(req.headers, ctx.webServer.port)) { json(res, 403, { error: 'Local artifact navigation required' }); return }
        await runtime.ready
        try {
          const artifact = await runtime.results?.materialize(url.pathname.slice('/super-personal-agent/artifact/'.length))
          if (!artifact) { json(res, 404, { error: 'Artifact not found' }); return }
          res.writeHead(200, { 'content-type': artifact.file.mediaType, 'content-length': artifact.bytes.length,
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(artifact.file.fileName)}`,
            'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" })
          res.end(artifact.bytes)
        } catch (error) { json(res, 404, { error: 'Artifact is unavailable' }) }
        return
      }
      if (url.pathname.startsWith('/super-personal-agent/result/') && req.method === 'GET') {
        if (!resultNavigationAllowed(req.headers, ctx.webServer.port)) {
          json(res, 403, { error: 'Local result navigation required' }); return
        }
        await runtime.ready
        const result = runtime.results?.get(url.pathname.slice('/super-personal-agent/result/'.length))
        if (!result) { json(res, 404, { error: 'Result not found' }); return }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'", 'referrer-policy': 'no-referrer' })
        res.end(resultHtml(result, runtime.vault?.list(result.id))); return
      }
      if (!url.pathname.startsWith('/super-personal-agent/api/')) { res.writeHead(404); res.end(); return }
      if (!sameOrigin(req, ctx.webServer.port)) { json(res, 403, { error: 'Same-origin management request required' }); return }
      try {
        await runtime.ready
        const route = match(table, req.method ?? 'GET', url.pathname.slice('/super-personal-agent/api/'.length).split('/'))
        if (!route) throw new RouteError(404, 'Unknown operation')
        const query = Object.fromEntries(url.searchParams)
        json(res, 200, await route.run({ params: route.params as never, query, body: maxBytes => readBody(req, maxBytes) }))
      } catch (error) { json(res, ...failure(error)) }
    } })]
  return () => { for (const dispose of disposers) dispose() }
}
