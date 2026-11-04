/** Application composition root and lifecycle manager for dsh-super-personal-agent. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-subprocess'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { lockSync } from 'proper-lockfile'
import { Engine, key, threadKey, reasonText, type EngineForSettings, type ReceiveResult, type Ticket, type Trigger } from '../core/index.ts'
import { allowedSender, settingsPolicy, policyEffects, policyVersion } from '../policy.ts'
import { SourceRegistry } from '../sources/registry.ts'
import { Commands } from '../infra/commands.ts'
import type { Deployment, Machine } from '../deployment.ts'
import { environmentOf, ticketEnvironment, type Variable } from './execution-environment.ts'
import type { SetupProblem } from '../setup.ts'
import { DshExecutor, sourceTrigger, triggerMessage, workerSessionId } from '../executor/dsh.ts'
import { ticketCard } from './cards.ts'
import { MasterAssessor } from './assessment.ts'
import { z } from 'zod'
import { runAsWorker } from '../infra/environment.ts'
import { RepositoryRegistry, type RepositorySelection, type PreparedRepository } from '../personal/repositories.ts'
import { Vault } from '../personal/vault.ts'
import { KV, family } from '../kv.ts'
import { Store } from './store.ts'
import { evalsHealth } from './views/overview.ts'
import { TextCache } from './cache.ts'
import { Effects } from './effects.ts'
import { Prompts } from './prompts.ts'
import { registerHttp, type HttpHost } from './http.ts'
import type { LinkTarget } from './views/records.ts'
import { candidateCard, repliedTo, sourceLink, type LinkHost } from './links.ts'
import { eventNotice, followupNotice } from './notices.ts'
import { pullEndNotices } from '../sources/github-pull.ts'
import { HealthBoard } from '../infra/health.ts'
import { Outbox } from './outbox.ts'
import { Passes } from './passes.ts'
import { Setup } from './setup.ts'
import { feishuSettings } from '../sources/feishu.ts'
import { health, type Health, type SourceContext, type SourceHost } from '../sources/host.ts'
import { Sessions } from './sessions.ts'
import { Settings } from './settings.ts'
import { sourceContextOf, type SourceContextDeps } from './source-context.ts'
import type { ResourceHost } from './resources.ts'
import { mainTools, type MainToolsHost } from './tools/main.ts'
import { executorTools, type ExecutorToolsHost } from './tools/executor.ts'
import { MainInput } from './main-input.ts'
import { createNativeFeishu, type NativeFeishu, type NativeAccount } from '../connectors/native-feishu.mjs'
import { nativeConnectorConfigs } from '../connectors/native-accounts.ts'
import { nativeDelivery } from '../connectors/native-delivery.ts'
import { ArtifactFiles } from '../messaging/files.ts'
import { MessageDelivery } from '../messaging/delivery.ts'
import { Results } from './results.ts'
import { Connectors } from './connectors.ts'
import { ticketContexts } from '../core/context.ts'
import { Hooks } from '../personal/hooks.ts'
import { Schedules } from '../personal/schedules.ts'
import { personalTools } from './personal-tools.ts'
import { scheduledPolicy } from './personal-policy.ts'
import { Routing } from '../personal/routing.ts'
import { PersonalSettings } from '../personal/config.ts'

// Source plugins interact with dsh-super-personal-agent exclusively through the `SourceHost` service interface.
declare module '@deepseek-ai/cordis' { interface Context { superPersonalAgent: SourceHost & { readonly execution: { backend: Context['subprocess']; environment(): NodeJS.ProcessEnv } } } }
const selectedResources = family<RepositorySelection[]>('personal-selected-resources:')
const preparedResources = family<PreparedRepository[]>('personal-prepared-resources:')
const now = (): string => new Date().toISOString()

/**
 * Composition root of dsh-super-personal-agent that connects `Store`, `Setup`, `Engine`, `SourceRegistry`, `Effects`, `Outbox`, `Passes`, `Sessions`, `Settings`, `Prompts`, `DshExecutor`, and `MasterAssessor`.
 * Exposes the `SourceHost` service on the Cordis context for source plugins and coordinates startup, setup checks, HTTP route registration, and graceful shutdown.
 * Locks the state directory before opening SQLite so concurrent processes cannot corrupt or double-migrate state.
 */
export class Runtime extends Service implements SourceHost {
  readonly store: Store
  readonly setup: Setup
  readonly execution: { backend: Context['subprocess']; environment(): NodeJS.ProcessEnv }
  readonly prompts: Prompts
  readonly effects: Effects
  readonly sources: SourceRegistry
  readonly commands: Commands
  readonly sessions: Sessions
  readonly settings: Settings
  readonly executor: DshExecutor
  readonly assessor: MasterAssessor
  readonly outbox: Outbox
  readonly engine: Engine
  readonly passes: Passes
  readonly ready: Promise<void>
  readonly main: MainInput
  readonly results: Results
  readonly messageDelivery: MessageDelivery
  readonly schedules: Schedules
  readonly hooks: Hooks
  readonly vault: Vault
  readonly repositories: RepositoryRegistry
  readonly routing: Routing
  readonly personal: PersonalSettings
  readonly connectors: Connectors
  nativeFeishu?: NativeFeishu
  private readonly board = new HealthBoard()
  private readonly runtimeHealth = this.board.claim('runtime', { state: 'starting', detail: '' })
  readonly masterId: string
  private readonly sourceLinks = new TextCache(200_000)
  private readonly stopped = new AbortController()
  private readonly disposers: (() => void)[] = []
  private releaseLock?: () => Promise<void>
  private closingFlag = false
  private stopping?: Promise<void>
  private readonly sourceDeps: SourceContextDeps
  private readonly toolHost: MainToolsHost & ExecutorToolsHost
  /** Non-zero while a main-Session tool is executing an Engine command, suppressing self-triggered domain event notices. */
  private quiet = 0
  constructor(ctx: Context, readonly machine: Machine, restart: () => void) {
    super(ctx, 'superPersonalAgent')
    const runtime = this
    // Lock the state directory before opening the database so another process cannot migrate or write concurrently.
    mkdirSync(machine.stateDir, { recursive: true, mode: 0o700 })
    const compromised = (error: Error) => { this.runtimeHealth.set({ state: 'error', detail: error.message }); this.stopped.abort() }
    const release = lockSync(machine.stateDir, { stale: 30_000, onCompromised: compromised })
    this.releaseLock = async () => { release() }
    let opened: Store | undefined
    try {
      const report = (error: unknown) => { ctx.logger.warn('dsh-super-personal-agent: %s', String(error)) }
      const store = opened = this.store = new Store(join(machine.stateDir, 'orchestrator.sqlite'), report)
      this.personal = new PersonalSettings(store)
      this.hooks = new Hooks({ store, config: () => this.personal.view().config.hooks, signal: this.lifetime })
      this.vault = new Vault(store, () => this.personal.view().config.vault)
      this.repositories = new RepositoryRegistry({ stateDir: machine.stateDir, git: (args, cwd, signal) =>
        runAsWorker(ctx.subprocess, ['git', ...args], cwd, AbortSignal.any([signal, AbortSignal.timeout(90_000)]), this.setup.workerEnvironment) })
      this.routing = new Routing(store, () => { const view = this.personal.view(); return { revision: view.revision, routing: view.config.routing } })
      const setup = this.setup = new Setup({ context: ctx, machine, lifetime: this.lifetime, restart })
      this.execution = { backend: ctx.subprocess, environment: () => setup.workerEnvironment }
      const deployed = () => setup.configured()
        ? environmentOf({ deployment: setup.deployment, sources: this.sources, settings: store.settings() }) : undefined
      const feishu = () => setup.configured() && !!setup.deployment.feishu
      const prompts = this.prompts = new Prompts(store, () => machine.promptMaxChars.get(), deployed, feishu)
      const masterId = this.masterId = store.get(KV.runtime.masterId) ?? `spa-main-${key(machine.stateDir)}`
      store.set(KV.runtime.masterId, masterId)
      const commands = this.commands = new Commands(() => setup.deployment, setup.commandEnvironment, this.lifetime)
      const board = this.board
      const effects = this.effects = new Effects(store, board)
      effects.handle('vault', async ({ id }) => { await this.vault.publish(id) })
      const sources = this.sources = new SourceRegistry(() => store.settings(), board, kind => {
        // Sync source member lists once startup completes when a source plugin loads dynamically.
        if (kind.policy?.sync) void this.ready?.then(() => this.settings.syncable().includes(kind.kind) ? this.settings.sync(kind.kind) : undefined)
          .catch(() => { /* sync() records its failure in health. */ })
        return () => {}
      })
      const links: LinkHost = { store, links: this.sourceLinks, commands, sources, lifetime: this.lifetime }
      const link = (trigger: Trigger, signal?: AbortSignal) => sourceLink(links, trigger, signal)
      const environment = (ticket: Ticket) => this.ticketEnvironment(ticket)
      const resources: ResourceHost = { store, pages: new TextCache(4_000_000), prompts, commands, masterId, context: ctx,
        get results() { return runtime.results },
        permitsRead: (ticket, trigger) => {
          if (this.routing.permits(ticket, trigger)) return true
          const allowed = ticketContexts(ticket).filter(ref => { const child = store.triggers.get(ref.triggerId); return !!child && this.routing.permits(ticket, child) })
          return store.contexts.references(allowed).some(ref => ref.triggerId === trigger.id && !allowed.some(own => own.id === ref.id))
        },
        repositories: () => this.personal.view().config.repositories,
        selectedResources: id => ({ selected: store.get(selectedResources(id)) ?? [], prepared: store.get(preparedResources(id)) ?? [] }),
        promptVersion: id => this.sessions.promptVersion(id), mayRead: (id, revision) => this.sessions.mayRead(id, revision),
        feishuPageSize: () => feishuSettings(sources).readPageSize, sourceLink: link }
      const sessions = this.sessions = new Sessions({ context: ctx, store, prompts, effects, health: board.claim('models'), masterId,
        lifetime: this.lifetime,
        closing: () => this.closing(), environment,
        tools: (agent, ticket) => ticket ? executorTools(this.toolHost, ticket) : [...mainTools(this.toolHost, agent), ...this.main.tools(), ...personalTools({ store, schedules: this.schedules, currentRequest: () => this.main.currentRequest(), requestPass: () => this.passes.request() })] })
      const policyChanged: EngineForSettings['policyChanged'] = (from, to, effects) => { this.engine.policyChanged(from, to, effects) }
      this.settings = new Settings({ store, sources, engine: { policyChanged }, health: board, context: ctx, lifetime: this.lifetime, sessions,
        sourceHost: this, setup, requestPass: () => { this.passes.request() } })
      this.executor = new DshExecutor({ context: ctx, get engine() { return runtime.engine }, store, effects, health: board.claim('worker'), machine,
        lifetime: this.lifetime, sessions, closing: () => this.closing(), paused: () => this.paused(), environment, workerEnvironment: () => setup.workerEnvironment, sourceLink: link,
        canDeliver: (ticket, trigger) => this.routing.permits(ticket, trigger),
        prepareResources: async (ticket, signal) => {
          const selected = store.get(selectedResources(ticket.id)) ?? []
          if (!selected.length) return []
          const prepared = await this.repositories.prepare(ticket.id, ticket.execution!.directory, selected, signal)
          store.set(preparedResources(ticket.id), prepared)
          return prepared
        },
        repliedTo: trigger => repliedTo({ store, sources }, trigger) })
      this.assessor = new MasterAssessor({ get engine() { return runtime.engine }, commands, get deployment() { return setup.deployment }, effects,
        settings: () => store.settings(), paused: () => this.paused(), threadContext: trigger => sources.threadContext(trigger),
        deliver: (id, text) => sessions.prompt(masterId, id, text, 'steer'), candidateCard: candidate => candidateCard(links, candidate) })
      const outbox = this.outbox = new Outbox({ store, effects, sources, commands, paused: () => this.paused(),
        current: message => !message.attentionId || store.tickets.get(message.ticketId ?? '')?.attention?.id === message.attentionId,
        onStatus: (message, status) => {
          const ticket = message.ticketId ? store.tickets.get(message.ticketId) : undefined
          if (!ticket) return
          const at = now()
          this.hooks.record({ version: 1, kind: 'delivery.status', id: key('delivery', message.id, status, at), at,
            taskId: ticket.id, contexts: store.contexts.references(ticketContexts(ticket)), deliveryId: message.id, status })
        } })
      this.messageDelivery = new MessageDelivery(store)
      this.results = new Results({ files: new ArtifactFiles(join(machine.stateDir, 'artifacts')), store, effects, outbox, masterId, vault: this.vault, port: ctx.webServer.port,
        onSaved: result => this.hooks.record({ version: 1, kind: 'result.saved', id: key('hook-result', result.id), at: result.at,
          taskId: result.ticketId, resultId: result.id, contexts: result.contexts, artifactIds: this.vault.list(result.id).map(item => item.id) }) })
      const { assessor, executor } = this
      const policy = () => scheduledPolicy(settingsPolicy(store.settings(), sources), this.schedules)
      const engine = this.engine = new Engine({ repo: store, scope: sources, policy, assessor, executor,
        resolveReply: target => this.results.replyMessage(target),
        beforeReceive: trigger => {
          if (trigger.source !== 'schedule') return
          const origin = this.schedules.originFor(trigger)
          if (!origin) throw new Error('Scheduled input is not authorized')
          store.contexts.parent(trigger, origin)
        },
        permitsInput: (ticket, trigger) => this.routing.permits(ticket, trigger),
        beforeFollow: (ticket, thread) => this.routing.follow(ticket, thread),
        beforeAttach: (ticket, trigger) => this.routing.attach(ticket, trigger),
        outbox, prepareTicket: (ticket, outcome) => {
          const ids = z.array(z.string()).parse(outcome.audit?.resource_ids ?? [])
          const selection = this.repositories.select(this.personal.view().config.repositories, ids)
          store.set(selectedResources(ticket.id), selection)
          return executor.prepare(ticket, outcome)
        }, emit: event => {
          const task = 'ticketId' in event.data ? store.tickets.get(event.data.ticketId) : undefined
          const state = event.type === 'ticket.created' ? 'created' : event.type === 'ticket.resumed' ? 'resumed'
            : event.type === 'ticket.ended' ? event.data.outcome : event.type === 'assignment.started' ? 'running'
            : event.type === 'assignment.reported' ? task?.assignments.at(-1)?.report?.state === 'progress' ? 'running' : task?.assignments.at(-1)?.report?.state : undefined
          if (task && state) this.hooks.record({ version: 1, kind: 'task.state', id: key('hook-state', task.id, state, event.at, JSON.stringify(event.data), task.assignments.at(-1)?.report?.summary ?? ''),
            at: event.at, taskId: task.id, state, ...('assignmentId' in event.data ? { assignmentId: event.data.assignmentId } : {}), contexts: store.contexts.references(ticketContexts(task)) })
          if (event.type === 'assignment.reported') this.results.record(store.tickets.get(event.data.ticketId)!, event.data.replyTo)
          // Notify the main Session only about domain events it did not initiate itself.
          const notice = this.quiet ? undefined : eventNotice(event, id => store.tickets.get(id))
          if (notice) sessions.notify(...notice)
          // A person's message that reached an open ticket is the ticket's; the main Session hears of it in the same transaction,
          // and of one for an ended ticket once it resumes, unless it routed the message there itself.
          const followed = !this.quiet && (event.type === 'trigger.received' || event.type === 'ticket.resumed' || event.type === 'trigger.followup')
          const followup = followed ? followupNotice(store, sources, event.data.triggerId) : undefined
          if (followup) sessions.relay(followup.id, followup.text)
          // Notify the ticket's conversations whenever it ends via a pull request.
          const ended = event.type === 'ticket.ended' ? store.tickets.get(event.data.ticketId) : undefined
          if (ended && setup.configured() && setup.deployment.github) {
            const request = store.triggers.get(ended.origin.triggerId)?.text ?? ''
            for (const message of pullEndNotices(ended, request, setup.deployment.repository)) outbox.send(message)
          }
        } })
      // Update the `evals` health entry on every pass if an evaluation failed as unavailable within the last hour.
      const evals = board.claim('evals', { state: 'ready', detail: 'No unavailable Eval in the last hour' })
      const evaluateDue = async () => {
        if (!this.paused()) this.schedules.pass()
        engine.evaluateDue(); evals.set(evalsHealth(store))
        await this.connectors?.refresh()
        if (!this.paused()) await this.hooks.pass()
      }
      const passes = this.passes = new Passes({ engine: { receive: trigger => engine.receive(trigger), evaluateDue }, effects,
        health: this.runtimeHealth, lifetime: this.lifetime, configured: () => setup.configured(), closing: () => this.closing() })
      this.schedules = new Schedules({ store, receive: trigger => passes.receive(trigger), options: () => this.personal.view().config.scheduler,
        authorize: origin => origin.human && sources.scope(origin).listened
          && settingsPolicy(store.settings(), sources).gate(origin, store.threads.get(threadKey(origin.threads[0]!)) ?? { key: threadKey(origin.threads[0]!), ref: origin.threads[0]!, createdAt: origin.at, subscriptions: [], correlated: [], pending: [], meta: {} }, []).admissible })
      this.disposers.push(sources.register({ kind: 'schedule', defaultEnabled: true, title: { zh: '定时任务', en: 'Schedules' },
        description: { zh: '来自已批准计划的独立任务。', en: 'Independent tasks from approved schedules.' }, schema: z.object({}).strict(), fields: [], health: [],
        scope: ({ meta }) => typeof meta.executionId === 'string' && !!this.schedules.run(meta.executionId)
          ? { listened: true, observed: false } : { listened: false, reason: 'unknown_schedule' } }))
      this.main = new MainInput({ context: ctx, store, sources, sessions, engine, masterId, requestPass: () => passes.request() })
      this.connectors = new Connectors({ store, sources, personal: this.personal, lifetime: this.lifetime, receive: trigger => passes.receive(trigger),
        policyChanged: (before, after) => engine.policyChanged(policyVersion(before), policyVersion(after),
          policyEffects(store.tickets.open(), before, after, settings => ({ scope: input => sources.scope(input, settings) }))) })

      this.sourceDeps = { store, engine, outbox, commands, sources, get ready() { return runtime.ready },
        get deployment() { return setup.deployment }, configured: () => setup.configured(),
        get setupProblem() { return setup.problem }, get feishuProblem() { return setup.feishuProblem }, get githubProblem() { return setup.githubProblem }, receive: trigger => passes.receive(trigger) }
      this.toolHost = { artifactLimit: () => this.personal.view().config.artifacts.maxBytes, context: ctx, engine, store, prompts, sessions, settings: this.settings, assessor, resources,
        get github() { return runtime.context({ kind: 'github', health: ['github'] }) },
        requestPass: () => { passes.request() }, sendReplies: () => outbox.sent(),
        quietly: run => { this.quiet++; try { return run() } finally { this.quiet-- } } }
      this.ready = this.initialize()
    } catch (error) {
      // Release the database and state lock if initialization fails so an in-process restart can reacquire them.
      try { opened?.close() } finally { release() }
      throw error
    }
  }
  get health(): Readonly<Record<string, Health>> { return this.board.all }
  /** Native accounts are independent of any installed IM plugin. */
  private async startNativeFeishu(): Promise<void> {
    if (!this.ctx.get('credentials')) return
    const native = await createNativeFeishu({ context: this.ctx, stateDir: this.machine.stateDir, lifetime: this.lifetime, logger: this.ctx.logger,
      onAccounts: accounts => this.syncNativeAccounts(accounts) })
    this.nativeFeishu = native
    nativeDelivery(native, this.messageDelivery, this.results)
    this.disposers.push(this.connectors.bind(native.service))
    await native.start()
  }
  private async syncNativeAccounts(accounts: NativeAccount[]): Promise<void> {
    const current = this.personal.view(), existing = current.config.connectors
    const connectors = nativeConnectorConfigs(existing, accounts)
    if (JSON.stringify(connectors) !== JSON.stringify(existing)) this.personal.save({ ...current.config, connectors }, current.revision)
    await this.connectors.refresh()
  }
  /** Aborted when dsh-super-personal-agent stops or loses its state directory lock, cancelling running reads and subprocesses. */
  get lifetime(): AbortSignal { return this.stopped.signal }
  context(kind: { kind: string; health: readonly string[] }): SourceContext { return sourceContextOf(this.sourceDeps, kind) }
  /** Resolved deployment; throws while waiting for setup (`!configured()`). */
  get deployment(): Deployment { return this.setup.deployment }
  configured(): boolean { return this.setup.configured() }
  get setupProblem(): SetupProblem | undefined { return this.setup.problem }
  /** Account problem confined to the optional GitHub Source. */
  get githubProblem(): SetupProblem | undefined { return this.setup.githubProblem }
  /** Why the Feishu bot is unavailable even though the Source configures a CLI. */
  get feishuProblem(): SetupProblem | undefined { return this.setup.feishuProblem }
  links(): LinkTarget {
    const resolved = this.setup.configured() ? this.setup.deployment : undefined
    const links = resolved ? { repository: resolved.repository, ...(resolved.feishu ? { feishu: resolved.feishu } : {}) } : {}
    return channel => this.sources.link(channel, links)
  }
  ticketEnvironment(ticket: Ticket): Variable[] {
    const trigger = sourceTrigger(this, ticket)
    const { setup: { deployment }, sources } = this
    return ticketEnvironment({ deployment, sources, settings: this.store.settings(), ticket, ...trigger ? { trigger } : {} })
  }
  checkSetup(): void { this.setup.check() }
  receive(trigger: Trigger): ReceiveResult { return this.passes.receive(trigger) }
  idle(): Promise<void> { return this.passes.idle() }
  pump(): Promise<void> { return this.passes.pump() }
  sendReplies(): Promise<void> { return this.outbox.sent() }
  private closing(): boolean { return this.closingFlag }
  /** Hold evaluation, dispatch, and outbound delivery while paused or awaiting setup; sources still record incoming triggers. */
  private paused(): boolean { return !this.setup.configured() || this.store.settings().paused }
  private async initialize(): Promise<void> {
    // Register management HTTP routes before setup completes so operators can fix setup problems in the UI.
    this.disposers.push(registerHttp(this.ctx, this.httpHost()))
    if (!await this.setup.run(this.store.settings())) {
      this.runtimeHealth.set({ ...health('paused', 'setupPending'), at: now() })
      return
    }
    this.sessions.install()
    this.main.install()
    this.executor.install()
    await this.sessions.ensure(this.masterId, this.machine.stateDir, 'dsh-super-personal-agent orchestrator', 'orchestrator')
    await this.main.restore()
    await this.startNativeFeishu()
    await this.connectors.refresh()
    for (const id of this.settings.syncable()) await this.settings.sync(id).catch(() => { /* sync() records its failure in health. */ })
    // If stop() was called while awaiting setup, session creation, or policy sync, do not start background loops.
    if (this.closing()) return
    this.executor.resume()
    this.passes.start()
    this.effects.start()
    this.runtimeHealth.set({ state: 'ready', detail: 'Orchestrator is ready', at: now() })
  }
  private httpHost(): HttpHost {
    const runtime = this
    const { store, sources, prompts, sessions, settings, engine, executor, health, machine, masterId, ready, sourceLinks, setup, passes } = this
    return { store, sources, prompts, sessions, settings, engine, executor, health, machine, masterId, ready, sourceLinks, results: this.results,
      personal: this.personal, connectors: this.connectors, get nativeFeishu() { return runtime.nativeFeishu }, messageDelivery: this.messageDelivery, vault: this.vault, routing: this.routing, schedules: this.schedules, hooks: this.hooks, effects: this.effects,
      get deployment() { return setup.deployment },
      get setupProblem() { return setup.problem }, get feishuProblem() { return setup.feishuProblem }, get githubProblem() { return setup.githubProblem },
      configured: () => setup.configured(), links: () => runtime.links(), ticketEnvironment: ticket => runtime.ticketEnvironment(ticket),
      checkSetup: () => { setup.check() }, requestPass: () => { passes.request() }, models: () => this.ctx.sessionController.modelCatalog() }
  }
  /** Idempotent stop; concurrent or repeated calls share the same shutdown promise. */
  stop(): Promise<void> { return this.stopping ??= this.shutdown() }
  private async shutdown(): Promise<void> {
    this.closingFlag = true; const passes = this.passes.stop(); this.stopped.abort()
    this.main.dispose()
    try {
      await this.connectors.stop()
      await this.nativeFeishu?.close()
      this.assessor.stop()
      const ids = [this.masterId, ...this.store.tickets.list().map(ticket => workerSessionId(ticket.id))]
      const agents = ids.map(id => this.ctx.agents.get(id as SessionId)).filter((agent): agent is Agent => agent !== undefined)
      for (const agent of agents) agent.cancel({ kind: 'user' }, { keepInbox: true })
      await Promise.allSettled([passes, this.effects.drain(), ...agents.map(agent => agent.whenIdle())])
      // The workers' jobs and subagents stop too: their ends would start worker turns without the tool limits released below.
      await this.executor.shutdown()
      this.executor.dispose()
      this.sessions.dispose()
      for (const dispose of this.disposers.reverse()) dispose()
      await this.ctx.sessionPersistence.flush()
    } finally {
      // Close the database before releasing the directory lock so another process cannot open the database mid-write; a compromised lock may already be released.
      try { this.store.close() } finally {
        const unreleased = (error: unknown) => { this.ctx.logger.warn('dsh-super-personal-agent could not release its state directory lock: %s',
          String(error)) }
        await this.releaseLock?.().catch(unreleased)
      }
    }
  }
}
