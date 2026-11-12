/** Durable Feishu document publications, exact task bindings and serialized comment requests. */
import { z } from 'zod'
import { key, type Trigger, type Ticket, type OutboundMessage } from '../core/index.ts'
import { family } from '../kv.ts'
import type { Store } from '../app/store.ts'
import type { Results } from '../app/results.ts'
import type { NativeFeishu } from '../connectors/native-feishu.mjs'
import type { ImReplyRoute } from '../connectors/protocol.ts'
import type { ContentBlock } from './content.ts'
import { DeliveryFailure, type MessageDelivery } from './delivery.ts'
import { prepareFeishuBlocks } from '../connectors/native-delivery.ts'

const SOURCE = 'feishu-doc'
const Batch = z.object({ children_id: z.array(z.string()), descendants: z.array(z.record(z.string(), z.unknown())) })
const DocumentSchema = z.object({ id: z.string(), botId: z.string(), fingerprint: z.string(), artifactId: z.string(), ticketId: z.string().optional(),
  originTriggerId: z.string().optional(), actorId: z.string(), documentId: z.string().optional(), url: z.string().optional(),
  batches: z.array(Batch).optional(), recovery: z.array(z.object({ at: z.string(), stage: z.string(), note: z.string(), action: z.enum(['retry', 'confirm_applied']) })).default([]), completed: z.array(z.string()), inFlight: z.string().optional(), error: z.string().optional() })
type Document = z.infer<typeof DocumentSchema>
const documents = family<Document>('personal-feishu-document:')
const RequestSchema = z.object({ sequence: z.number().int().nonnegative(), id: z.string(), bindingId: z.string(), trigger: z.object({ id: z.string(), source: z.string(), actor: z.object({ source: z.string(), id: z.string() }), human: z.boolean(), addressed: z.literal('direct'), at: z.string(), text: z.string(), threads: z.array(z.object({ source: z.string(), id: z.string() })), channel: z.object({ source: z.string(), thread: z.string(), address: z.record(z.string(), z.string()) }), meta: z.record(z.string(), z.unknown()) }), state: z.enum(['queued', 'active', 'done', 'rejected']), reportBefore: z.string().optional(), error: z.string().optional() })
type Request = z.infer<typeof RequestSchema>
const requests = family<Request>('personal-feishu-comment:')
const Notice = z.object({ event_id: z.string(), is_mentioned: z.literal(true), comment_id: z.string(), reply_id: z.string(),
  notice_meta: z.object({ file_type: z.literal('docx'), file_token: z.string(), from_user_id: z.object({ open_id: z.string() }) }) })
const Reply = z.object({ reply_id: z.string(), user_id: z.string(), content: z.object({ elements: z.array(z.object({ type: z.string(), text_run: z.object({ text: z.string() }).optional() }).passthrough()) }) }).passthrough()
const repliesText = (replies: z.infer<typeof Reply>[]) => replies.map(reply => `${reply.user_id}: ${reply.content.elements.map(item => item.text_run?.text ?? '').join('')}`).join('\n')
const path = encodeURIComponent
interface Host { store: Store; results: Pick<Results, 'materialize'>; ledger: MessageDelivery; native(): Pick<NativeFeishu, 'documentRequest' | 'accounts' | 'allowsCommand'> | undefined; signal: AbortSignal;
  maxBytes(): number; limits(): { contextChars: number; commentPages: number }; allowed(trigger: Trigger): boolean; receive(trigger: Trigger): void; attach(ticketId: string, triggerId: string): void; busy(ticketId: string): boolean }

/** Only publications created by this installation may bind document comments to a task. */
export class FeishuDocuments {
  private readonly active = new Map<string, Promise<ContentBlock>>()
  constructor(private readonly host: Host) {}
  list(): Omit<Document, 'batches'>[] { return this.host.store.keys(documents).map(id => { const { batches, ...item } = DocumentSchema.parse(this.host.store.get(id)); return item }) }
  pending(): Request[] { return this.host.store.keys(requests).map(id => RequestSchema.parse(this.host.store.get(id))).sort((a, b) => a.sequence - b.sequence) }
  /** Operator verified that the uncertain mutation was not applied before permitting a retry. */
  reconcile(id: string, stage: string, note: string, action: 'retry' | 'confirm_applied' = 'retry', documentId?: string): void {
    if (this.active.has(id)) throw new Error('Document publication is still running')
    const binding = DocumentSchema.parse(this.host.store.get(documents(id)))
    if (binding.inFlight !== stage || !note.trim()) throw new Error('Document stage changed or verification note is missing')
    if (action === 'confirm_applied') {
      if (stage === 'create') {
        if (!documentId || !/^[a-zA-Z0-9_-]+$/.test(documentId)) throw new Error('Created document ID is required')
        binding.documentId = documentId
      }
      binding.completed.push(stage)
    }
    binding.recovery.push({ at: new Date().toISOString(), stage, note, action })
    delete binding.inFlight; delete binding.error
    this.host.store.set(documents(id), binding)
  }
  /** Reject forged or modified comment inputs before they enter the engine. */
  accepts(trigger: Trigger): boolean {
    const request = this.host.store.get(requests(trigger.id))
    return !!request && JSON.stringify(request.trigger) === JSON.stringify(trigger)
  }
  private native(): NonNullable<ReturnType<Host['native']>> { const value = this.host.native(); if (!value) throw new Error('Native Feishu unavailable'); return value }
  private canUse(binding: Omit<Document, 'batches'>): boolean {
    const origin = binding.originTriggerId ? this.host.store.triggers.get(binding.originTriggerId) : undefined
    const kind = origin?.channel?.address.conversationKind === 'group' || origin?.meta.conversationType === 'group' || origin?.meta.chat_type === 'group' ? 'group' : 'dm'
    return !!this.host.native()?.allowsCommand(binding.botId, binding.fingerprint, binding.actorId, kind)
  }
  private call(binding: Omit<Document, 'batches'>, method: 'GET' | 'POST', url: string, data?: unknown, params?: Record<string, string | boolean | number>) {
    return this.native().documentRequest(binding.botId, binding.fingerprint, { method, url, ...(data ? { data } : {}), ...(params ? { params } : {}) }, this.host.signal)
  }
  /** Each externally mutating stage is checkpointed; an unknown outcome must never be retried blindly. */
  private async mutate(binding: Document, stage: string, run: () => Promise<void>): Promise<void> {
    if (binding.completed.includes(stage)) return
    if (binding.inFlight) throw new DeliveryFailure('unknown', `document-${binding.inFlight}-outcome-unknown`)
    binding.inFlight = stage; delete binding.error; this.host.store.set(documents(binding.id), binding)
    try {
      await run()
      binding.completed.push(stage); delete binding.inFlight
      this.host.store.set(documents(binding.id), binding)
    } catch (error) {
      const failed = error instanceof Error && 'outcome' in error && error.outcome === 'failed'
      if (failed) delete binding.inFlight
      binding.error = String(error); this.host.store.set(documents(binding.id), binding)
      throw new DeliveryFailure(failed ? 'failed' : 'unknown', `document-${stage}-failed`, { cause: error })
    }
  }
  /** Text blocks remain inline; only actual Markdown artifacts become cloud documents. */
  publish(botId: string, fingerprint: string, route: ImReplyRoute, message: OutboundMessage, block: ContentBlock): Promise<ContentBlock> {
    if (block.type !== 'file') return Promise.resolve(block)
    const id = key(botId, fingerprint, message.ticketId ?? '', block.artifactId, route.actorId)
    const previous = this.active.get(id)
    if (previous) return previous
    const work = this.convert(id, botId, fingerprint, route, message, block).finally(() => this.active.delete(id))
    this.active.set(id, work); return work
  }
  private async convert(id: string, botId: string, fingerprint: string, route: ImReplyRoute, message: OutboundMessage, block: Extract<ContentBlock, { type: 'file' }>): Promise<ContentBlock> {
    let artifact
    try { artifact = await this.host.results.materialize(block.artifactId) }
    catch (cause) { throw new DeliveryFailure('failed', 'artifact-unavailable', { cause }) }
    if (artifact.file.mediaType !== 'text/markdown') return block
    if (artifact.bytes.length > this.host.maxBytes()) throw new DeliveryFailure('failed', 'document-too-large')
    const ticket = message.ticketId ? this.host.store.tickets.get(message.ticketId) : undefined
    const binding = DocumentSchema.parse(this.host.store.get(documents(id)) ?? { id, botId, fingerprint, artifactId: block.artifactId,
      ticketId: ticket?.id, originTriggerId: ticket?.origin.triggerId, actorId: route.actorId, completed: [] })
    let content: string
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(artifact.bytes) }
    catch (cause) { throw new DeliveryFailure('failed', 'invalid-markdown-encoding', { cause }) }
    if (!content.length || content.length > 10485760) throw new DeliveryFailure('failed', 'invalid-markdown-length')
    const title = artifact.file.fileName.replace(/\.(?:md|markdown)$/i, '')
    await this.mutate(binding, 'create', async () => {
      const result = z.object({ document: z.object({ document_id: z.string() }) }).parse(await this.call(binding, 'POST', '/open-apis/docx/v1/documents', { title }))
      binding.documentId = result.document.document_id
    })
    if (!binding.batches) {
      try {
        const converted = Converted.parse(await this.call(binding, 'POST', '/open-apis/docx/v1/documents/blocks/convert', { content_type: 'markdown', content }))
        binding.batches = documentBatches(converted)
      } catch (cause) { throw new DeliveryFailure('failed', 'document-conversion-failed', { cause }) }
      this.host.store.set(documents(binding.id), binding)
    }
    for (const [index, batch] of binding.batches.entries()) {
      await this.mutate(binding, `write-${index}`, async () => {
        await this.call(binding, 'POST', `/open-apis/docx/v1/documents/${path(binding.documentId!)}/blocks/${path(binding.documentId!)}/descendant`, { ...batch, index: -1 })
      })
    }
    await this.mutate(binding, 'share', async () => {
      await this.call(binding, 'POST', `/open-apis/drive/v1/permissions/${path(binding.documentId!)}/members`,
        { member_type: 'openid', member_id: route.actorId, perm: 'view', type: 'user' }, { type: 'docx', need_notification: false })
    })
    if (!binding.url) {
      try {
        const metadata = z.object({ metas: z.array(z.object({ doc_token: z.string(), url: z.string().url().startsWith('https://') })) }).parse(
          await this.call(binding, 'POST', '/open-apis/drive/v1/metas/batch_query', { request_docs: [{ doc_token: binding.documentId, doc_type: 'docx' }], with_url: true }))
        const document = metadata.metas.find(item => item.doc_token === binding.documentId)
        if (!document) throw new Error('Document URL missing from Feishu metadata')
        binding.url = document.url; this.host.store.set(documents(binding.id), binding)
      } catch (cause) { throw new DeliveryFailure('failed', 'document-link-unavailable', { cause }) }
    }
    return { type: 'link', label: block.caption ?? title, url: binding.url }
  }
  /** Trusted callback metadata is resolved against persisted ownership before fetching content. */
  async receive(botId: string, fingerprint: string, raw: unknown): Promise<void> {
    const checked = Notice.safeParse(raw)
    if (!checked.success) return
    const notice = checked.data, actorId = notice.notice_meta.from_user_id.open_id
    const binding = this.list().find(item => item.botId === botId && item.fingerprint === fingerprint && item.documentId === notice.notice_meta.file_token)
    if (!binding || binding.actorId !== actorId || !binding.ticketId || !binding.completed.includes('share')) return
    if (!this.canUse(binding)) return
    const id = key('document-comment-v1', botId, fingerprint, notice.notice_meta.file_token, notice.comment_id, notice.reply_id)
    if (this.host.store.get(requests(id))) return
    const ticket = this.host.store.tickets.get(binding.ticketId), origin = binding.originTriggerId && this.host.store.triggers.get(binding.originTriggerId)
    if (!ticket || ticket.ended?.by === 'human' || !origin || origin.actor.id !== actorId || !this.host.allowed(origin)) return
    const base = `/open-apis/drive/v1/files/${path(binding.documentId!)}/comments/${path(notice.comment_id)}`
    const comment = z.object({ quote: z.string().optional(), reply_list: z.object({ replies: z.array(Reply) }).optional() }).passthrough()
      .parse(await this.call(binding, 'GET', base, undefined, { file_type: 'docx', user_id_type: 'open_id' }))
    let replies = comment.reply_list?.replies ?? [], selected = replies.find(item => item.reply_id === notice.reply_id)
    let cursor: string | undefined
    for (let pages = 0; !selected && pages < this.host.limits().commentPages; pages++) {
      const page = z.object({ items: z.array(Reply), has_more: z.boolean().optional(), page_token: z.string().optional() })
        .parse(await this.call(binding, 'GET', `${base}/replies`, undefined, { file_type: 'docx', user_id_type: 'open_id', page_size: 100, ...(cursor ? { page_token: cursor } : {}) }))
      replies = page.items; selected = replies.find(item => item.reply_id === notice.reply_id)
      if (!page.has_more || !page.page_token || page.page_token === cursor) break
      cursor = page.page_token
    }
    if (!selected) throw new Error('Comment reply not found within configured page limit')
    if (selected.user_id !== actorId) return
    const doc = z.object({ content: z.string() }).parse(await this.call(binding, 'GET', `/open-apis/docx/v1/documents/${path(binding.documentId!)}/raw_content`))
    if (!this.canUse(binding)) return
    const text = JSON.stringify({ request: repliesText([selected]).slice(0, this.host.limits().contextChars), quote: comment.quote?.slice(0, this.host.limits().contextChars), recent_comments: repliesText(replies.slice(-10)).slice(0, this.host.limits().contextChars),
      document: doc.content.slice(0, this.host.limits().contextChars), document_truncated: doc.content.length > this.host.limits().contextChars, document_url: binding.url })
    const trigger: Request['trigger'] = { id, source: SOURCE, actor: origin.actor, human: true, addressed: 'direct', at: new Date().toISOString(), text,
      threads: [{ source: SOURCE, id: key(botId, binding.documentId!, notice.comment_id) }],
      channel: { source: SOURCE, thread: key(botId, binding.documentId!, notice.comment_id), address: { kind: 'document_comment', bindingId: binding.id,
        documentId: binding.documentId!, commentId: notice.comment_id, replyId: notice.reply_id, actorId } },
      meta: { bindingId: binding.id, requestId: id, targetTicketId: ticket.id, eventId: notice.event_id, replyTargetKind: 'document_comment' } }
    this.host.store.atomic(() => { if (!this.host.store.get(requests(id))) this.host.store.set(requests(id), { sequence: this.host.store.keys(requests).length, id, bindingId: binding.id, trigger, state: 'queued' }) })
  }
  authorized(ticket: Ticket, trigger: Trigger): boolean {
    if (trigger.source !== SOURCE || !this.accepts(trigger)) return false
    const request = this.host.store.get(requests(trigger.id)), binding = request && this.host.store.get(documents(request.bindingId))
    const origin = binding?.originTriggerId ? this.host.store.triggers.get(binding.originTriggerId) : undefined
    return !!binding && !!origin && this.host.allowed(origin) && binding.ticketId === ticket.id && trigger.actor.id === binding.actorId
      && this.canUse(binding)
  }
  replyTarget(ticketId: string): string | undefined { return this.pending().find(item => item.state === 'active' && item.trigger.meta.targetTicketId === ticketId)?.id }
  /** Called between engine passes; one active request per task remains frozen until its run settles. */
  pass(): void {
    for (const request of this.pending()) {
      const ticketId = String(request.trigger.meta.targetTicketId), ticket = this.host.store.tickets.get(ticketId)
      if (request.state === 'done' || request.state === 'rejected' || this.host.busy(ticketId)) continue
      if (request.state === 'active') {
        const report = ticket?.assignments.at(-1)?.report
        const handedBack = this.host.store.triggers.disposition(request.id)?.handbacks?.some(item => item.ticketId === ticketId)
        if (handedBack || ticket?.ended || report && report.state !== 'progress' && JSON.stringify(report) !== request.reportBefore) { request.state = 'done'; this.host.store.set(requests(request.id), request) }
        continue
      }
      if (this.replyTarget(ticketId)) continue
      if (!ticket || ticket.ended?.by === 'human' || !this.authorized(ticket, request.trigger)) {
        request.state = 'rejected'; request.error = 'Task or document authorization was revoked'; this.host.store.set(requests(request.id), request); continue
      }
      const report = ticket.assignments.at(-1)?.report
      if (!ticket.ended && (!report || report.state === 'progress') || ticket.undelivered.length) continue
      try { this.host.store.atomic(() => {
        request.state = 'active'; request.reportBefore = JSON.stringify(report); this.host.store.set(requests(request.id), request)
        this.host.receive(request.trigger); this.host.attach(ticket.id, request.id)
      }) } catch (error) {
        request.state = 'rejected'; request.error = String(error); this.host.store.set(requests(request.id), request)
      }
    }
  }
  async send(message: OutboundMessage): Promise<'sent'> {
    const request = this.pending().find(item => JSON.stringify(item.trigger.channel) === JSON.stringify(message.channel))
    if (!request || request.trigger.meta.targetTicketId !== message.ticketId) throw new DeliveryFailure('failed', 'unbound-comment-target')
    const binding = DocumentSchema.parse(this.host.store.get(documents(request.bindingId)))
    const ticket = this.host.store.tickets.get(message.ticketId!)
    if (!ticket || !this.authorized(ticket, request.trigger)) throw new DeliveryFailure('failed', 'document-access-revoked')
    if (!this.canUse(binding)) throw new DeliveryFailure('failed', 'document-access-revoked')
    await this.host.ledger.deliver(message, { supported: ['text', 'link', 'file', 'image'], prepare: prepareFeishuBlocks,
      send: async (block, options) => {
        const target = await this.publish(binding.botId, binding.fingerprint, { actorId: binding.actorId, messageId: '', conversationId: '' }, message, block)
        if (target.type !== 'text' && target.type !== 'link') throw new DeliveryFailure('unsupported', 'comment-content-unsupported')
        const content = target.type === 'text' ? [{ type: 'text_run', text_run: { text: target.text } }] : [{ type: 'text_run', text_run: { text: `${target.label ?? ''}\n${target.url}` } }]
        try {
          const response = z.object({ reply_id: z.string() }).parse(await this.call(binding, 'POST',
            `/open-apis/drive/v1/files/${path(binding.documentId!)}/comments/${path(message.channel.address.commentId!)}/replies`, { content: { elements: content }, extra: options.id }, { file_type: 'docx', user_id_type: 'open_id' }))
          return { providerMessageIds: [response.reply_id] }
        } catch (cause) {
          throw new DeliveryFailure(cause instanceof Error && 'outcome' in cause && cause.outcome === 'failed' ? 'failed' : 'unknown', 'comment-reply-failed', { cause })
        }
      } }, this.host.signal)
    return 'sent'
  }
}

const Converted = z.object({ first_level_block_ids: z.array(z.string()), blocks: z.array(z.object({ block_id: z.string(), children: z.array(z.string()).optional(), block_type: z.number() }).passthrough()),
  block_id_to_image_urls: z.array(z.object({ block_id: z.string(), image_url: z.string() })).default([]) })
/** Keep subtrees intact under Feishu's 1000-block limit; image references remain visible as links. */
export function documentBatches(converted: z.infer<typeof Converted>): z.infer<typeof Batch>[] {
  const blocks = new Map(converted.blocks.map(block => [block.block_id, { ...block }]))
  for (const block of blocks.values()) {
    delete block.parent_id
    const table = z.record(z.string(), z.unknown()).safeParse(block.table)
    if (table.success) { delete table.data.merge_info; block.table = table.data }
    if (block.block_type === 27) {
      const image = converted.block_id_to_image_urls.find(item => item.block_id === block.block_id)
      if (!image) throw new DeliveryFailure('failed', 'document-image-source-missing')
      delete block.image; block.block_type = 2
      block.text = { elements: [{ text_run: { content: image.image_url } }] }
    }
  }
  const batches: z.infer<typeof Batch>[] = [], visited = new Set<string>()
  let batch: z.infer<typeof Batch> = { children_id: [], descendants: [] }
  const tree = (id: string): z.infer<typeof Batch>['descendants'] => {
    const block = blocks.get(id)
    if (!block || visited.has(id)) throw new DeliveryFailure('failed', 'invalid-document-block-tree')
    visited.add(id)
    return [block, ...(block.children ?? []).flatMap(tree)]
  }
  for (const id of converted.first_level_block_ids) {
    const descendants = tree(id)
    if (descendants.length > 1000) throw new DeliveryFailure('failed', 'document-subtree-exceeds-1000-blocks')
    if (batch.descendants.length + descendants.length > 1000) { batches.push(batch); batch = { children_id: [], descendants: [] } }
    batch.children_id.push(id); batch.descendants.push(...descendants)
  }
  if (visited.size !== blocks.size) throw new DeliveryFailure('failed', 'unreachable-document-blocks')
  if (batch.children_id.length) batches.push(batch)
  return batches
}
