/** Durable result snapshots and automatic delivery independent of a further model reply. */
import { key, latestAssignment, type Ticket, type ChannelRef } from '../core/index.ts'
import { ticketContexts, type ContextRef } from '../core/context.ts'
import { family } from '../kv.ts'
import { wordCount } from '../infra/text.ts'
import type { Effects } from './effects.ts'
import type { Outbox } from './outbox.ts'
import type { Sessions } from './sessions.ts'
import type { Store } from './store.ts'

export interface ResultRecord {
  version: 1; id: string; ticketId: string; assignmentId: string; at: string; state: string; title: string
  summary: string; contexts: ContextRef[]; url: string
  channel?: ChannelRef
  attentionId?: string
}
export const resultRecords = family<ResultRecord>('personal-result:')
interface ResultsHost { store: Store; effects: Effects; sessions: Sessions; outbox: Outbox; masterId: string; port: number }

/** Records reports transactionally, then publishes their snapshots through retryable effects. */
export class Results {
  constructor(private readonly host: ResultsHost) {
    host.effects.handle('result', async ({ id }) => this.deliver(id))
  }
  get(id: string): ResultRecord | undefined { return this.host.store.get(resultRecords(id)) }
  list(ticketId?: string): ResultRecord[] {
    return this.host.store.keys(resultRecords).flatMap(name => this.host.store.get(name) ?? [])
      .filter(result => !ticketId || result.ticketId === ticketId).sort((a, b) => b.at.localeCompare(a.at))
  }
  record(ticket: Ticket, replyTo?: string): void {
    const assignment = latestAssignment(ticket), report = assignment?.report
    if (!assignment || !report || ['progress', 'waiting'].includes(report.state) && !ticket.attention && !replyTo) return
    const id = ticket.attention ? key('attention-result-v1', ticket.attention.id)
      : key('result-v1', ticket.id, assignment.id, report.at, report.state, report.summary)
    if (this.get(id)) return
    const result: ResultRecord = { version: 1, id, ticketId: ticket.id, assignmentId: assignment.id, at: report.at,
      state: report.state, title: ticket.title, summary: ticket.attention?.question ?? report.summary,
      contexts: ticketContexts(ticket), url: `http://127.0.0.1:${this.host.port}/super-personal-agent/result/${id}`,
      channel: this.host.store.triggers.get(replyTo ?? ticket.attention?.triggerId ?? ticket.origin.triggerId)?.channel,
      ...(ticket.attention ? { attentionId: ticket.attention.id } : {}) }
    this.host.store.set(resultRecords(id), result)
    this.host.effects.enqueue('result', id, { id })
  }
  private async deliver(id: string): Promise<void> {
    const { store, sessions, outbox, masterId } = this.host, result = this.get(id)
    if (!result) throw new Error('Result snapshot is missing')
    const ticket = store.tickets.get(result.ticketId)
    if (!ticket) throw new Error('Result ticket is missing')
    if (result.attentionId && ticket.attention?.id !== result.attentionId) return
    const text = `${result.title}\n\n${result.summary}\n\n[查看结果 / View result](${result.url})`
    const superseded = new Error('The question was superseded before delivery')
    try {
      await sessions.prompt(masterId, `result:${id}`, text, { inject: `${result.title}: ${result.summary}`.slice(0, 120) }, () => {
        if (result.attentionId && store.tickets.get(ticket.id)?.attention?.id !== result.attentionId) throw superseded
      })
    } catch (error) { if (error === superseded) return; throw error }
    store.contexts.link('session', masterId, result.contexts)
    const channel = result.channel
    if (!channel || channel.source === 'main') return
    // Local links are useful on the Host only. IM gets readable content and a stable task reference.
    let summary = result.summary
    if (channel.source === 'feishu') while (wordCount(summary) > 85) summary = summary.slice(0, Math.max(1, Math.floor(summary.length * 0.8)))
    const outgoing = channel.source === 'inbox' ? text : `${summary}\n\nTicket: ${ticket.id}`
    // The existing report lifecycle withdraws this exact receipt when the question changes or clears.
    if (result.attentionId && store.tickets.get(ticket.id)?.attention?.id !== result.attentionId) return
    outbox.send({ id: result.attentionId ? key('attention-reply', result.attentionId) : key('result-delivery', id, channel.source, channel.thread),
      channel, ticketId: ticket.id, kind: 'notice', text: outgoing })
  }
}

/** Escaped, self-contained result view; model-produced Markdown is displayed as text, never executable HTML. */
export function resultHtml(result: ResultRecord): string {
  const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(result.title)}</title><body><main><h1>${escape(result.title)}</h1><p>${escape(result.state)} · ${escape(result.at)}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(result.summary)}</pre><p>Ticket: ${escape(result.ticketId)}</p></main></body></html>`
}
