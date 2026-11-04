/** Resolves optional source accounts without mutating the Host environment. */
import type { Context } from '@deepseek-ai/cordis'
import { delimiter } from 'node:path'
import { UserError } from '../core/index.ts'
import { SETUP_FIELDS, resolveDeployment, resolveFeishuBot, workerProbe, type Deployment, type Machine } from '../deployment.ts'
import { agentVariables, cleanWorkerPath, verifyEnvironment, workerBin, writeEnvironment } from '../infra/environment.ts'
import type { Settings, SettingsBlock } from '../policy.ts'
import { SetupError, type SetupProblem } from '../setup.ts'

export interface SetupHost {
  readonly context: Context
  readonly machine: Machine
  readonly lifetime: AbortSignal
  restart(): void
}
const setupFields = (settings: Settings) => JSON.stringify(Object.entries(SETUP_FIELDS).map(([id, keys]) =>
  [settings.sources[id]?.enabled ?? false, ...keys.map(key => settings.sources[id]?.config[key] ?? '')]))
export const setupChanged = (before: Settings, after: Settings): boolean => setupFields(before) !== setupFields(after)

/** Runtime readiness is independent of optional source accounts. */
export class Setup {
  private resolved?: Deployment
  problem?: SetupProblem
  githubProblem?: SetupProblem
  feishuProblem?: SetupProblem
  private readonly path: string
  private readonly variables: Record<string, string | undefined>
  constructor(private readonly host: SetupHost) {
    this.path = cleanWorkerPath(process.env.PATH ?? '')
    this.variables = agentVariables(host.machine.stateDir)
  }
  /** Account probes bypass every known plugin's CLI shims. */
  get commandEnvironment(): NodeJS.ProcessEnv { return { ...this.variables, PATH: this.path } }
  /** Child overrides, scoped to this plugin's execution provider. */
  get workerEnvironment(): NodeJS.ProcessEnv {
    return { ...this.variables, PATH: [workerBin(this.host.machine.stateDir), this.path].join(delimiter) }
  }
  get deployment(): Deployment {
    if (!this.resolved) throw new Error(`super-personal-Agent is waiting for setup: ${this.problem?.detail ?? 'setup has not run'}`)
    return this.resolved
  }
  configured(): boolean { return this.resolved !== undefined }
  async run(settings: Settings): Promise<boolean> {
    this.problem = this.githubProblem = this.feishuProblem = undefined
    try { this.resolved = await this.resolve(settings); return true }
    catch (error) {
      if (!(error instanceof SetupError)) throw error
      this.problem = error.problem
      return false
    }
  }
  check(): void {
    if (this.configured() && !this.githubProblem && !this.feishuProblem) throw new UserError('setupComplete')
    this.restart()
  }
  restart(): void { setTimeout(this.host.restart, 0) }
  /** Validate only the enabled source being saved. */
  async checkAccounts(block: SettingsBlock, settings: Settings): Promise<void> {
    if (!settings.sources[block.slice(7)]?.enabled) return
    if (block === 'source:github') await resolveDeployment(this.host.machine, settings.sources.github?.config, this.probe(), this.path)
    else if (block === 'source:feishu') await resolveFeishuBot(this.host.machine, settings.sources.feishu?.config, this.probe(), this.path)
  }
  async blockCommands(blocked: readonly string[]): Promise<void> {
    if (this.resolved) await writeEnvironment(this.resolved, blocked)
  }
  private probe() {
    const { context, machine, lifetime } = this.host
    return workerProbe(context.subprocess, machine.stateDir, machine.stateDir, lifetime, this.commandEnvironment)
  }
  private async resolve(settings: Settings): Promise<Deployment> {
    const { context, machine, lifetime } = this.host
    let resolved: Deployment = { ...machine, repository: '' }
    if (settings.sources.github?.enabled) {
      try { resolved = await resolveDeployment(machine, settings.sources.github.config, this.probe(), this.path) }
      catch (error) { if (!(error instanceof SetupError)) throw error; this.githubProblem = error.problem }
    }
    if (settings.sources.feishu?.enabled) {
      try { resolved.feishu = await resolveFeishuBot(machine, settings.sources.feishu.config, this.probe(), this.path) }
      catch (error) { if (!(error instanceof SetupError)) throw error; this.feishuProblem = error.problem }
    }
    try {
      await writeEnvironment(resolved, settings.executor.blockedCommands)
      try { await verifyEnvironment(resolved, context.subprocess, lifetime, this.workerEnvironment) }
      catch (error) {
        if (!(error instanceof SetupError) || error.problem.code !== 'gitTooOld') throw error
        this.githubProblem = { ...error.problem, place: 'github' }
        const { github: _github, ...local } = resolved
        resolved = { ...local, repository: '' }
        await writeEnvironment(resolved, settings.executor.blockedCommands)
      }
    } catch (error) {
      if (error instanceof SetupError) throw error
      throw new SetupError('environmentFailed', { output: error instanceof Error ? error.message : String(error) })
    }
    return resolved
  }
}
