/** Native Main Session requests: ordinary conversation stays inline; explicit delegation creates durable work. */
import type { Context } from '@deepseek-ai/cordis'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { z } from 'zod'
import { key, type Engine, type Trigger } from '../core/index.ts'
import { contextRef } from '../core/context.ts'
import { record } from '../kv.ts'
import type { SourceKind } from '../sources/kind.ts'
import type { SourceRegistry } from '../sources/registry.ts'
import { WorktreeNameSchema } from './assessment.ts'
import { ticketCard } from './cards.ts'
import type { Sessions } from './sessions.ts'
import type { Store } from './store.ts'
import { tool, type Tool } from './tools/tool.ts'

const latest = record<string>('personal-main-latest-request')
/** dsh-im 5.10 emits platform-prefixed UUIDs for both prompts and steering. */
const IM_RPC = /^(?:weixin|feishu|dingtalk|wecom|wecom-app|qq|slack|telegram|discord|whatsapp|imessage|matrix|office|email)-(?:steer-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
interface MainInputHost {
  context: Context; store: Store; sources: SourceRegistry; sessions: Sessions; engine: Engine; masterId: string
  requestPass(): void
}

/** Captures authenticated local user messages, never reports or injected plugin notices. */
export class MainInput {
  private readonly disposers: (() => void)[] = []
  constructor(private readonly host: MainInputHost) {
    const kind: SourceKind = { kind: 'main', defaultEnabled: true,
      title: { zh: '主会话', en: 'Main Session' }, description: { zh: '在主会话讨论、创建任务并接收结果。', en: 'Discuss, delegate and receive results in the Main Session.' },
      schema: z.object({}).strict(), fields: [], health: [],
      channel: { allowed: address => address.sessionId === host.masterId,
        link: () => ({ url: '', label: { zh: '主会话', en: 'Main Session' } }),
        send: async (_source, message) => {
          await host.sessions.prompt(host.masterId, `main-reply:${message.id}`, message.text, { inject: message.text })
          return 'sent'
        } },
    }
    this.disposers.push(host.sources.register(kind))
  }
  install(): void {
    this.disposers.push(this.host.context.on('session/event', (session, event) => {
      if (session.id === this.host.masterId && event.type === 'user/message') this.capture(event.data, new Date(event.time).toISOString())
    }))
  }
  dispose(): void { for (const dispose of this.disposers.splice(0).reverse()) dispose() }
  /** Replays only logged human messages; stable IDs make recovery harmless. */
  async restore(): Promise<void> {
    await using handle = await this.host.context.sessionPersistence.open(SessionId(this.host.masterId), 'read')
    for (let offset = 0; ; ) {
      const { events } = await handle.read(offset, 512)
      if (!events.length) break
      for (const event of events) if (event.type === 'user/message') this.capture(event.data, new Date(event.time).toISOString())
      offset += events.length
    }
  }
  capture(message: UserMessage, at = new Date().toISOString()): Trigger | undefined {
    if (message.source.kind !== 'user') return undefined
    const source = message.source
    if ('rpcId' in source && typeof source.rpcId === 'string' && (IM_RPC.test(source.rpcId) || /^(?:dsh-im|im[:/-])/.test(source.rpcId))) return undefined
    const text = message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
    if (!text.trim()) return undefined
    const { store, masterId } = this.host, id = key('main', masterId, message.id)
    return store.atomic(() => {
      const existing = store.triggers.get(id)
      if (existing) return existing
      const settings = store.settings()
      if (!settings.policy.sources.main) store.saveSettings({ ...settings,
        policy: { ...settings.policy, sources: { ...settings.policy.sources, main: { allowed: [{ id: 'owner' }] } } } })
      const trigger: Trigger = { id, source: 'main', actor: { source: 'main', id: 'owner' }, human: true, addressed: 'direct',
        at, text, threads: [{ source: 'main', id: String(message.id) }],
        channel: { source: 'main', thread: String(message.id), address: { sessionId: masterId, messageId: String(message.id), triggerId: id } },
        meta: { sessionId: masterId, messageId: String(message.id) } }
      store.triggers.save(trigger)
      store.set(latest, id)
      store.contexts.link('session', masterId, [contextRef(id)])
      return trigger
    })
  }
  tools(): Tool[] {
    const { store, engine } = this.host
    const current = (id?: string) => {
      const request = store.triggers.get(id ?? store.get(latest) ?? '')
      if (!request || request.source !== 'main') throw new Error('No local user request is available')
      return request
    }
    return [tool({ name: 'personal_agent_current_request', description: 'Read the latest original local user request and its context reference before delegating. Ordinary conversation needs no ticket.',
      schema: z.object({}).strict(), execute: async () => { const request = current(); return { trigger_id: request.id, text: request.text, context: contextRef(request.id) } } }),
    tool({ name: 'personal_agent_submit', description: 'Delegate the original local user request to background work, or explicitly continue an existing ticket. Never delegate mere discussion or a request to wait.',
      schema: z.object({ trigger_id: z.string().min(1), title: z.string().trim().min(1).max(200), worktree_name: WorktreeNameSchema,
        ticket_id: z.string().min(1).optional() }).strict(),
      execute: async args => {
        const request = current(args.trigger_id)
        const ticket = store.atomic(() => {
          if (args.ticket_id) return engine.attach(args.ticket_id, request.id)
          const decision = engine.decide(request.id, { kind: 'accept', title: args.title, scope: args.title,
            name: args.worktree_name, reason: { code: 'explicitRouted' } })
          if (!decision.ticketId) throw new Error('The request was not authorized for execution')
          return store.tickets.get(decision.ticketId)!
        })
        this.host.requestPass()
        return { ticket: ticketCard(ticket), context: contextRef(request.id) }
      } })]
  }
}
