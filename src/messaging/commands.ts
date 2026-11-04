/** Deterministic IM commands, persisted with their reply before returning the platform acknowledgement. */
import { key, threadKey, UserError, type Engine, type Trigger, type Ticket } from '../core/index.ts'
import type { Store } from '../app/store.ts'
import type { Outbox } from '../app/outbox.ts'
import type { Effects } from '../app/effects.ts'
import type { Results } from '../app/results.ts'
import type { Conversations } from './conversations.ts'
import { dialogueMessage } from './dialogue.ts'

class CommandRefusal extends Error {}
interface Host { store: Store; engine: Engine; outbox: Outbox; effects: Effects; conversations: Conversations; results: Results }
export const COMMAND_HELP = '/new 或 /clear：开启当前 IM 的新对话，保留 Main 历史和后台任务\n/tasks：列出本会话任务\n/status：查看当前对话和任务状态\n/stop <任务 ID>：停止自己的任务\n/steer <任务 ID> <补充说明>：继续自己的任务\n/result <任务 ID>：重新投递已发布的结果和附件\n/retry <任务 ID>：重试自己的失败任务\n/history：查看本轮对话\n/model、/preset、/workspace：查看当前设置（在插件界面修改）'
/** A command is always intercepted, including unknown slash commands. */
export function commandOf(text: string): { name: string; argument: string } | undefined {
  const match = /^\s*\/([a-z][a-z0-9_-]*)(?:\s+([\s\S]*))?$/i.exec(text)
  return match ? { name: match[1]!.toLowerCase(), argument: match[2]?.trim() ?? '' } : undefined
}
/** Caller runs receive and this command inside the same transaction. */
export function executeCommand(host: Host, trigger: Trigger): void {
  const command = commandOf(trigger.text)
  if (!command || !trigger.channel) return
  const { store, engine, conversations, effects, outbox } = host
  const current = conversations.forTrigger(trigger)
  if (!current) throw new Error('Conversation is unavailable')
  const tasks = conversations.tasks(trigger)
  const task = (id: string, mutate: boolean): Ticket => {
    const matches = tasks.filter(item => item.id === id || id.length >= 8 && item.id.startsWith(id))
    if (matches.length !== 1) throw new CommandRefusal('请使用 /tasks 查看任务，再提供唯一的任务 ID（至少 8 位）。')
    const found = matches[0]!
    if (mutate && found.mandate.actor.id !== trigger.actor?.id) throw new CommandRefusal('只能修改自己发起的任务。')
    return found
  }
  let text: string, blocks
  try {
    switch (command.name) {
      case 'new': case 'clear': {
        const thread = store.threads.get(threadKey(trigger.threads[0]!))
        for (const id of [...thread?.evaluating?.triggerIds ?? [], ...thread?.pending ?? []]) {
          if (id !== trigger.id && !store.triggers.disposition(id)?.decisionId)
            engine.decide(id, { kind: 'ignore', reason: 'Current IM context reset by its user' })
        }
        const reset = conversations.reset(trigger)
        effects.enqueue('dialogueReset', trigger.id, { sessionId: reset.before })
        text = '已开启当前 IM 的新对话。Main 历史和后台任务保留；可用 /tasks 查看任务。'
        break
      }
      case 'tasks': case 'status':
        text = `当前对话：第 ${current.generation + 1} 轮。\n` + (tasks.length ? tasks.slice(-30).map(item =>
          `${item.id.slice(0, 12)} · ${item.title} · ${item.ended?.outcome ?? item.assignments.at(-1)?.report?.state ?? 'running'}`).join('\n') : '暂无任务。')
        break
      case 'stop': {
        const found = task(command.argument || current.focus || '', true)
        engine.stopTicket(found.id, 'Requested through the original IM conversation')
        text = `已停止任务：${found.title}`
        break
      }
      case 'steer': {
        const match = /^(\S+)\s+([\s\S]+)$/.exec(command.argument)
        if (!match) throw new CommandRefusal('用法：/steer <任务 ID> <补充说明>')
        const found = task(match[1]!, true)
        engine.attach(found.id, trigger.id, match[2]!)
        conversations.focus(found, trigger)
        text = `补充说明已交给任务：${found.title}`
        break
      }
      case 'retry': {
        const found = task(command.argument || current.focus || '', true)
        engine.retryTicket(found.id); text = `已重试任务：${found.title}`
        break
      }
      case 'result': {
        const found = task(command.argument || current.focus || '', false)
        const result = host.results.list(found.id).find(item => item.publication?.mode === 'publish')
        if (!result || result.publication?.mode !== 'publish') throw new CommandRefusal('此任务还没有已发布的结果。')
        blocks = result.publication.blocks
        text = result.summary
        break
      }
      case 'history':
        text = conversations.history(current.sessionId).slice(-10).map(item => `${item.at} ${item.text}`).join('\n') || '本轮还没有对话。'
        break
      case 'model': case 'models': case 'preset': case 'presetlist': case 'workspace': case 'ws': case 'conv':
        text = `当前账号设置：${JSON.stringify(trigger.meta.settings ? Object.fromEntries(Object.entries(trigger.meta.settings).filter(([name]) => ['model', 'agentPreset', 'workspace'].includes(name))) : {})}\n请在 super-personal-Agent → Personal → 飞书账号中修改；新对话使用新设置。`
        break
      case 'help': case 'menu': text = COMMAND_HELP; break
      case 'version': text = 'super-personal-Agent · native Feishu messaging v1'; break
      case 'repair': text = '请在 super-personal-Agent → Personal → 飞书账号中点击「补全权限」。'; break
      default: text = `此命令不适用于 Personal Agent。\n${COMMAND_HELP}`
    }
  } catch (error) {
    if (!(error instanceof CommandRefusal || error instanceof UserError)) throw error
    text = error.message
  }
  if (!store.triggers.disposition(trigger.id)?.decisionId && !store.triggers.disposition(trigger.id)?.fanout.length)
    engine.decide(trigger.id, { kind: 'ignore', reason: 'Handled by the deterministic IM command dispatcher' })
  outbox.send({ id: key('im-command-v1', trigger.id), kind: 'reply', channel: trigger.channel, text,
    ...(blocks ? { blocks } : {}) })
  effects.enqueue('notice', `im-command:${trigger.id}`, { value: { kind: 'im_command', command: command.name,
    ...dialogueMessage(trigger, []), result: text }, summary: `IM /${command.name}` })
}
