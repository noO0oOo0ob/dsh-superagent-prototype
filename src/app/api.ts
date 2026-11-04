/** Type-only management API contract between the web panel and host routes, imported by the panel without bundling host code. */
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PromptConfig, Prompts } from './prompts.ts'
import type { PromptsView, StateView, TicketPageView } from './http.ts'
import type { HistoryView } from './settings-history.ts'
import type { OverviewView } from './views/overview.ts'
import type { SettingsView } from './views/settings.ts'
import type { SourceStatusView } from './views/sources.ts'
import type { DecisionListView, SearchView, ThreadDetailView, ThreadListView } from './views/threads.ts'
import type { TicketListView } from './views/tickets.ts'
import type { PersonalConfig } from '../personal/config.ts'
import type { VaultExport } from '../personal/vault.ts'
import type { RouteDecision } from '../personal/routing.ts'
import type { ScheduleRecord, ScheduleRun } from '../personal/schedules.ts'
import type { HookDelivery, HookEvent } from '../personal/hooks.ts'
import type { ImDelivery } from './connectors.ts'

export const TICKET_FILTERS = ['open', 'person', 'working', 'idle', 'ended'] as const
export const THREAD_FILTERS = ['subscribed', 'evaluating', 'recent', 'all'] as const
export type TicketFilter = typeof TICKET_FILTERS[number]
export type ThreadFilter = typeof THREAD_FILTERS[number]
interface Paged { offset?: number; limit?: number }
/** Whether a context update was already injected into the main Session or is still pending delivery. */
type Delivery = 'injected' | 'pending'

export interface Api {
  'GET personal': { response: { revision: number; config: PersonalConfig; connectors: Record<string, { state: string; detail: string }>; deliveries: ImDelivery[]; vault: VaultExport[]; routeDecisions: RouteDecision[]; schedules: ScheduleRecord[]; runs: ScheduleRun[]; hooks: HookDelivery[] } }
  'PUT personal': { body: { revision: number; config: unknown }; response: { revision: number; config: PersonalConfig } }
  'GET personal/bots': { response: { bots: unknown[] } }
  'POST personal/deliveries/:id': { body: { action: 'confirm_sent' | 'retry'; note: string }; response: { recorded: true } }
  'POST personal/schedules': { body: { spec: unknown }; response: ScheduleRecord }
  'PUT personal/schedules/:id': { body: { spec: unknown; revision: number }; response: ScheduleRecord }
  'POST personal/schedules/:id': { body: { action: 'pause' | 'resume' | 'stop' }; response: ScheduleRecord }
  'POST personal/runs/:id/retry': { response: ScheduleRun }
  'POST personal/hooks/:id': { body: { action: 'retry' | 'replay' }; response: HookDelivery }
  'GET personal/hooks': { response: HookEvent[] }
  'POST personal/vault/:id': { response: { queued: boolean } }
  'GET state': { response: StateView }
  'GET overview': { response: OverviewView }
  'GET search': { query: { q: string }; response: SearchView }
  'GET sources': { response: SourceStatusView[] }
  'GET settings': { response: SettingsView }
  'POST sources/:id/labels': { response: { added: string[] } }
  'GET threads': { query?: Paged & { filter?: ThreadFilter }; response: ThreadListView }
  'GET threads/:key': { query?: { limit?: number; before?: string; around?: string }; response: ThreadDetailView }
  'POST threads/:key/unsubscribe': { response: { removed: boolean; thread: string; context_delivery: Delivery } }
  'POST triggers/:id/requeue': { response: { queued: boolean } }
  'GET decisions': { query?: Paged & { kind?: string; window?: '24h' }; response: DecisionListView }
  'POST decisions/:id/dismiss': { response: { dismissed: true } }
  'GET tickets': { query?: Paged & { state?: TicketFilter }; response: TicketListView }
  'GET tickets/:id': { response: TicketPageView }
  'POST tickets/:id/retry': { response: { retried: true } }
  'POST tickets/:id/stop': { response: { stopped: true } }
  'POST executor/pause': { body: { paused: boolean }; response: { paused: boolean } }
  'PUT settings/:block': { body: { value: unknown; revision: number }; response: { revision: number; restarting: boolean } }
  'GET policy/history': { response: HistoryView }
  'POST policy-sync/:id': { response: { policy: unknown } }
  'POST setup/check': { response: { restarting: true } }
  'GET models': { response: ModelCatalog }
  'GET prompts': { query?: { revision?: number; offset?: number }; response: PromptsView }
  'PUT prompts': { body: { config: PromptConfig; baseRevision: number }; response: { revision: number; context_delivery: Delivery } }
  'POST prompts/preview': { body: PromptConfig; response: ReturnType<Prompts['preview']> }
}
type Path<K> = K extends `${string} ${infer P}` ? P : never
type Params<P> = P extends `${string}:${infer Name}/${infer Rest}` ? Record<Name, string> & Params<Rest>
  : P extends `${string}:${infer Name}` ? Record<Name, string> : unknown
export type RouteParams<K extends keyof Api> = Params<Path<K>>
export type ApiRequest<K extends keyof Api> = RouteParams<K> & Omit<Api[K], 'response'>
export type ApiResponse<K extends keyof Api> = Api[K]['response']
