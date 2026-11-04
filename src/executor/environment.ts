/** A subprocess provider scoped to Personal Agent presets; the Host backend remains shared. */
import type { Context } from '@deepseek-ai/cordis'
import { SubprocessRuntime, type SubprocessHandle, type SubprocessSpawnSpec, type SubprocessTerminalHandle, type SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import type {} from '../app/runtime.ts'

/** Applies account overrides only to this preset's processes and cancels them when the preset unloads. */
export class PersonalAgentSubprocess extends SubprocessRuntime {
  private readonly stopped = new AbortController()
  private readonly handles = new Set<SubprocessHandle>()
  constructor(ctx: Context) {
    super(ctx)
    ctx.effect(() => async () => {
      this.stopped.abort()
      const handles = [...this.handles]
      for (const handle of handles) handle.terminate()
      await Promise.all(handles.map(handle => handle.waitForExit()))
    })
  }
  private get execution() { return this.ctx.superPersonalAgent.execution }
  resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string> {
    const path = this.execution.environment().PATH!
    return this.execution.backend.resolveExecutable(command, { ...env, PATH: path }, signal)
  }
  terminalEnvironment(signal?: AbortSignal) { return this.execution.backend.terminalEnvironment(signal) }
  spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    const signal = AbortSignal.any([this.stopped.signal, ...spec.signal ? [spec.signal] : []])
    const handle = this.execution.backend.spawn({ ...spec, signal, env: { ...spec.env, ...this.execution.environment() } })
    this.handles.add(handle)
    // A completed parent may leave descendants. Retain the handle until its entire managed range ends.
    void handle.waitForExit().then(() => this.handles.delete(handle), () => { /* Retry observation during disposal. */ })
    return handle
  }
  spawnTerminal(_spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    return Promise.reject(new Error('Personal Agent presets support shell commands, not interactive terminals.'))
  }
}

export const name = 'dsh-super-personal-agent-environment'
export const inject = ['superPersonalAgent']
export function apply(ctx: Context): void { new PersonalAgentSubprocess(ctx) }
