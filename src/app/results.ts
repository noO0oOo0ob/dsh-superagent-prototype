/** Durable result snapshots and automatic delivery independent of a further model reply. */
import { ArtifactFiles, type StoredFile } from '../messaging/files.ts'
import { publicationArtifacts, publicationText, type ContentBlock, type Publication } from '../messaging/content.ts'
import { key, latestAssignment, type Ticket, type ChannelRef, type OutboundMessage } from '../core/index.ts'
import { ticketContexts, type ContextRef } from '../core/context.ts'
import type { ReplyTarget } from '../core/replies.ts'
import { family } from '../kv.ts'
import { wordCount } from '../infra/text.ts'
import type { Vault, VaultExport } from '../personal/vault.ts'
import type { Effects } from './effects.ts'
import type { Outbox } from './outbox.ts'
import type { Store } from './store.ts'

export interface ResultRecord {
  version: 1; id: string; ticketId: string; assignmentId: string; at: string; state: string; title: string
  summary: string; contexts: ContextRef[]; url: string
  file?: StoredFile
  publication?: Publication
  channel?: ChannelRef
  artifactPath?: string
  artifacts?: { id: string; title: string; url: string }[]
  attentionId?: string
  /** Original human question answered by this report; absent on older snapshots. */
  replyTo?: string
}
export const resultRecords = family<ResultRecord>('personal-result:')
interface ResultsHost { files?: ArtifactFiles; onSaved?(result: ResultRecord): void; vault?: Vault; store: Store; effects: Effects; outbox: Outbox; masterId: string; port: number }
const destination = (channel: ChannelRef) => JSON.stringify([channel.source, channel.thread, Object.entries(channel.address).sort(([a], [b]) => a.localeCompare(b))])
const reportId = (ticket: Ticket): string | undefined => {
  const assignment = latestAssignment(ticket), report = assignment?.report
  return assignment && report ? key('result-v1', ticket.id, assignment.id, report.at, report.state, report.summary, ...(report.publication ? [JSON.stringify(report.publication)] : [])) : undefined
}

/** Records reports and their delivery receipts in one transaction; Outbox effects publish them. */
export class Results {
  constructor(private readonly host: ResultsHost) {
    // Finish result effects persisted by versions that queued publications after the report transaction.
    host.effects.handle('result', async ({ id }) => this.deliver(id))
  }
  get(id: string): ResultRecord | undefined { return this.host.store.get(resultRecords(id)) }
  list(ticketId?: string): ResultRecord[] {
    return this.host.store.keys(resultRecords).flatMap(name => this.host.store.get(name) ?? [])
      .filter(result => !ticketId || result.ticketId === ticketId).sort((a, b) => b.at.localeCompare(a.at))
  }
  /** Saves a worker-selected text artifact; completion delivers its link with the final report. */
  artifact(ticket: Ticket, title: string, content: string, path: string): ResultRecord {
    const assignment = latestAssignment(ticket)
    if (!assignment) throw new Error('Task has no assignment')
    const id = key('artifact-v1', ticket.id, assignment.id, title, path, content), previous = this.get(id)
    if (previous) return previous
    const result: ResultRecord = { version: 1, id, ticketId: ticket.id, assignmentId: assignment.id, at: new Date().toISOString(),
      state: 'artifact', title, summary: content, contexts: this.host.store.contexts.references(ticketContexts(ticket)), artifactPath: path,
      url: `http://127.0.0.1:${this.host.port}/super-personal-agent/result/${id}` }
    this.host.store.atomic(() => {
      this.host.store.set(resultRecords(id), result)
      const exported = this.host.vault?.enqueue(result)
      if (exported) this.host.effects.enqueue('vault', exported.id, { id: exported.id })
      this.host.onSaved?.(result)
    })
    return result
  }
  /** Capture bytes before recording an artifact; an expired assignment cannot publish it. */
  async capture(ticket: Ticket, title: string, path: string, maxBytes: number): Promise<ResultRecord> {
    if (!this.host.files || !ticket.execution) throw new Error('Artifact file storage unavailable')
    const assignment = latestAssignment(ticket)
    if (!assignment) throw new Error('Task has no assignment')
    const { file, bytes } = await this.host.files.capture(ticket.execution.directory, path, maxBytes)
    const current = this.host.store.tickets.get(ticket.id)
    if (!current || current.ended || latestAssignment(current)?.id !== assignment.id) throw new Error('Task execution changed before publication')
    const id = key('artifact-v2', ticket.id, assignment.id, title, path, file.digest)
    const existing = this.get(id)
    if (existing) return existing
    const summary = file.mediaType.startsWith('text/') || file.mediaType === 'application/json' ? bytes.toString('utf8') : `${file.fileName} (${file.size} bytes)`
    const result: ResultRecord = { version: 1, id, ticketId: ticket.id, assignmentId: assignment.id, at: new Date().toISOString(), state: 'artifact',
      title, summary, contexts: this.host.store.contexts.references(ticketContexts(current)), artifactPath: path, file,
      url: `http://127.0.0.1:${this.host.port}/super-personal-agent/artifact/${id}` }
    this.host.store.atomic(() => {
      this.host.store.set(resultRecords(id), result)
      const exported = this.host.vault?.enqueue(result)
      if (exported) this.host.effects.enqueue('vault', exported.id, { id: exported.id })
      this.host.onSaved?.(result)
    })
    return result
  }
  /** Read only an immutable registered artifact, including pre-upgrade text snapshots. */
  async materialize(id: string): Promise<{ file: StoredFile; bytes: Buffer }> {
    const result = this.get(id)
    if (!result?.artifactPath) throw new Error('Artifact not found')
    if (result.file) {
      if (!this.host.files) throw new Error('Artifact file storage unavailable')
      return { file: result.file, bytes: await this.host.files.read(result.file) }
    }
    const bytes = Buffer.from(result.summary)
    return { file: { digest: key(result.summary), size: bytes.length, fileName: result.artifactPath.split(/[\\/]/).at(-1)!, mediaType: 'text/plain' }, bytes }
  }
  /** Resolve only explicitly selected artifacts owned by this assignment. */
  validatePublication(ticket: Ticket, publication: Publication): void {
    if (publication.mode === 'internal') return
    for (const id of publicationArtifacts(publication.blocks)) {
      const result = this.get(id)
      if (!result?.artifactPath || result.ticketId !== ticket.id || result.assignmentId !== latestAssignment(ticket)?.id) throw new Error('Publication references an artifact outside this assignment')
    }
  }
  record(ticket: Ticket, replyTo?: string): void {
    const assignment = latestAssignment(ticket), report = assignment?.report
    if (!assignment || !report || ['progress', 'waiting'].includes(report.state) && !ticket.attention && !replyTo && report.publication?.mode !== 'publish') return
    if (report.publication) this.validatePublication(ticket, report.publication)
    const questionId = ticket.attention ? key('attention-result-v1', ticket.attention.id) : undefined
    const question = questionId && report.publication?.mode !== 'internal' && (!report.publication || !this.get(questionId)) ? ticket.attention : undefined
    const id = question ? questionId! : reportId(ticket)!
    if (this.get(id)) return
    const result: ResultRecord = { version: 1, id, ticketId: ticket.id, assignmentId: assignment.id, at: report.at,
      state: report.state, title: ticket.title, summary: question?.question ?? report.summary,
      contexts: this.host.store.contexts.references(ticketContexts(ticket)), url: `http://127.0.0.1:${this.host.port}/super-personal-agent/result/${id}`,
      ...(report.publication ? { publication: report.publication } : {}),
      artifacts: this.list(ticket.id).filter(item => item.artifactPath && item.assignmentId === assignment.id
        && report.publication?.mode === 'publish' && publicationArtifacts(report.publication.blocks).includes(item.id)).map(({ id, title, url }) => ({ id, title, url })),
      channel: this.host.store.triggers.get(replyTo ?? ticket.attention?.triggerId ?? ticket.origin.triggerId)?.channel,
      ...(replyTo ? { replyTo } : {}),
      ...(question ? { attentionId: question.id } : {}) }
    this.host.store.set(resultRecords(id), result)
    const exported = this.host.vault?.enqueue(result)
    if (exported) this.host.effects.enqueue('vault', exported.id, { id: exported.id })
    this.host.onSaved?.(result)
    if (report.publication?.mode !== 'internal') this.deliver(id)
  }
  /** Reuse the report's original content and receipt for a core-authorized reply destination. */
  replyMessage({ purpose, ticket, trigger, channel }: ReplyTarget): OutboundMessage | undefined {
    if (!ticket) return undefined
    const latest = reportId(ticket), reported = latest ? this.get(latest) : undefined
    let result: ResultRecord | undefined
    if (purpose === 'attention') result = ticket.attention && this.get(key('attention-result-v1', ticket.attention.id))
    else if (purpose === 'answer') {
      result = this.list(ticket.id).find(item => !!item.replyTo && item.replyTo === trigger?.id)
      // Older snapshots have the captured route but no replyTo; require the unconsumed answer authorization too.
      if (!result && trigger && ticket.answers?.includes(trigger.id) && reported?.channel && destination(reported.channel) === destination(channel)) result = reported
    } else result = reported
    if (result?.publication?.mode === 'internal') throw new Error('This result was not published')
    return result ? this.message(result, channel) : undefined
  }
  private deliver(id: string): void {
    const { store, outbox, masterId } = this.host, result = this.get(id)
    if (!result) throw new Error('Result snapshot is missing')
    const ticket = store.tickets.get(result.ticketId)
    if (!ticket) throw new Error('Result ticket is missing')
    if (result.attentionId && ticket.attention?.id !== result.attentionId) return
    const main = result.channel?.source === 'main' ? result.channel : { source: 'main', thread: masterId, address: { sessionId: masterId } }
    outbox.send(this.message(result, main))
    store.contexts.link('session', masterId, result.contexts)
    if (result.channel && result.channel.source !== 'main') outbox.send(this.message(result, result.channel))
  }
  private message(result: ResultRecord, channel: ChannelRef): OutboundMessage {
    const id = this.deliveryId(result, channel), existing = this.host.store.receipts.get(id)
    if (existing) return existing
    const exported = this.host.vault?.list(result.id).find(item => item.state === 'written' || item.state === 'unchanged' || item.state === 'preserved')
    const vaultLink = exported?.uri ? `\n[Obsidian](${exported.uri})` : ''
    const artifacts = (result.artifacts ?? []).map(item => `\n[${item.title}](${item.url})`).join('')
    const text = `${result.title}\n\n${result.publication?.mode === 'publish' ? publicationText(result.publication.blocks) : result.summary}\n\n[查看结果 / View result](${result.url})${vaultLink}${artifacts}`
    // Local links are useful on the Host only. IM gets readable content and a stable task reference.
    let summary = result.summary
    if (channel.source === 'feishu') while (wordCount(summary) > 85) summary = summary.slice(0, Math.max(1, Math.floor(summary.length * 0.8)))
    if (channel.source.startsWith('im-') && summary.length > 3700) summary = `${summary.slice(0, 3700)}...\nFull content and deliverables are available in the Main Session.`
    const blocks: ContentBlock[] = result.publication?.mode === 'publish' ? result.publication.blocks : [
      { type: 'text', text: `${summary}\n\nTicket: ${result.ticketId}`, format: 'markdown' },
      ...(result.artifacts ?? []).map(item => ({ type: 'file' as const, artifactId: item.id }))]
    const outgoing = channel.source === 'inbox' || channel.source === 'main' ? text : `${summary}\n\nTicket: ${result.ticketId}`
    return { id, channel, ticketId: result.ticketId, resultId: result.id,
      ...(result.attentionId ? { attentionId: result.attentionId } : {}), kind: 'notice', text: result.publication?.mode === 'publish' && channel.source !== 'main' && channel.source !== 'inbox' ? publicationText(blocks) : outgoing, blocks }
  }
  private deliveryId(result: ResultRecord, channel: ChannelRef): string {
    const original = result.channel && destination(result.channel) === destination(channel)
    if (original && result.attentionId) return key('attention-reply', result.attentionId)
    if (channel.source === 'main') return key('result-main-delivery', result.id, this.host.masterId)
    if (original) return key('result-delivery', result.id, channel.source, channel.thread)
    return key('result-destination', result.id, destination(channel))
  }
}

/** Escaped, self-contained result view; model-produced Markdown is displayed as text, never executable HTML. */
export function resultHtml(result: ResultRecord, exports: VaultExport[] = []): string {
  const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  const artifacts = (result.artifacts ?? []).map(item => `<p><a href="${escape(item.url)}">${escape(item.title)}</a></p>`).join('')
  const links = exports.filter(item => item.uri).map(item => `<p><a href="${escape(item.uri!)}">Obsidian · ${escape(item.state)}</a></p>`).join('')
  return `<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(result.title)}</title><body><main><h1>${escape(result.title)}</h1><p>${escape(result.state)} · ${escape(result.at)}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(result.publication?.mode === 'publish' ? publicationText(result.publication.blocks) : result.summary)}</pre><p>Ticket: ${escape(result.ticketId)}</p>${links}${artifacts}</main></body></html>`
}
