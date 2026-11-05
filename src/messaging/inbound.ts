/** Scoped inbound attachment reads and immutable local snapshots. */
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'
import { basename } from 'node:path'
import { z } from 'zod'
import type { ConnectorService } from '../connectors/protocol.ts'
import { ReplyRouteSchema } from '../connectors/protocol.ts'
import { family } from '../kv.ts'
import { key, type Trigger } from '../core/index.ts'
import type { Store } from '../app/store.ts'
import { tool, type Tool } from '../app/tools/tool.ts'
import { ArtifactFiles, StoredFileSchema, type StoredFile } from './files.ts'
const Resource = z.object({ kind: z.enum(['image', 'file', 'audio', 'video']), key: z.string().min(1), fileName: z.string().optional() }).passthrough()
const snapshots = family<StoredFile>('personal-inbound-file:')
const imageType = (bytes: Buffer): ImageMediaType | undefined => bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png'
  : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
  : /^GIF8[79]a/.test(bytes.subarray(0, 6).toString()) ? 'image/gif'
  : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : undefined
/** A source resource can be read only after the caller authorizes its persisted trigger. */
export class InboundFiles {
  constructor(private readonly store: Store, private readonly files: ArtifactFiles, private readonly native: (trigger: Trigger) => Pick<ConnectorService, 'readResource'> | undefined,
    private readonly limit: () => number) {}
  async read(trigger: Trigger, resourceKey: string, signal: AbortSignal): Promise<{ file: StoredFile; bytes: Buffer; path: string }> {
    const resource = z.array(Resource).max(100).parse(trigger.meta.resources ?? []).find(item => item.key === resourceKey)
    if (!resource) throw new Error('Resource is not attached to this message')
    const id = key('inbound-v1', trigger.id, resourceKey), previous = this.store.get(snapshots(id))
    if (previous) {
      const file = StoredFileSchema.parse(previous)
      if (file.size > this.limit()) throw new Error('Attachment exceeds the configured byte limit')
      return { file, bytes: await this.files.read(file), path: this.files.path(file) }
    }
    const native = this.native(trigger)
    if (!native?.readResource) throw new Error('Source attachment reader is unavailable')
    const route = ReplyRouteSchema.parse(trigger.meta.reply)
    const bytes = await native.readResource(String(trigger.meta.botId), route, resourceKey, {
      expectedFingerprint: String(trigger.meta.fingerprint), signal, maxBytes: this.limit() })
    signal.throwIfAborted()
    const name = basename((resource.fileName ?? resource.kind).replaceAll('\\', '/')).replace(/[\x00-\x1f]/g, '_') || 'attachment'
    const { file } = await this.files.storeBytes(bytes, name, resource.kind === 'image' ? imageType(bytes) : undefined)
    signal.throwIfAborted()
    this.store.set(snapshots(id), file)
    return { file, bytes, path: this.files.path(file) }
  }
  /** Text is bounded; images are logged DSH attachments, and other formats expose a verified local file to Workers. */
  tool(agent: Agent, authorize: (triggerId: string) => Trigger, paths: boolean): Tool {
    return tool({ name: 'personal_agent_inbound', description: 'Read an attachment from an authorized input message. Use trigger_id and resource_key from resources. Images are returned as image attachments; documents return a local snapshot path to task Workers.',
      schema: z.object({ trigger_id: z.string(), resource_key: z.string(), offset: z.number().int().nonnegative().default(0) }).strict(),
      execute: async (args, signal) => {
        const trigger = authorize(args.trigger_id), result = await this.read(trigger, args.resource_key, signal)
        authorize(args.trigger_id)
        const type = imageType(result.bytes)
        const metadata = { file_name: result.file.fileName, media_type: result.file.mediaType, size: result.file.size,
          ...(paths ? { path: result.path } : {}) }
        if (type) {
          const attachments = agent.ctx.get('attachments')
          if (!attachments) throw new Error('Image attachment service is unavailable')
          if (result.file.size > Math.min(attachments.imageLimits.maxImageBytes, attachments.imageLimits.maxMessageImageBytes)) throw new Error('Image exceeds model attachment limits')
          const image = await attachments.saveImage({ data: result.bytes, mediaType: type, name: result.file.fileName })
          return { ...metadata, image }
        }
        if (result.file.mediaType.startsWith('text/') || result.file.mediaType === 'application/json') {
          const text = result.bytes.toString('utf8')
          return { ...metadata, text: text.slice(args.offset, args.offset + 8000), ...(args.offset + 8000 < text.length ? { next_offset: args.offset + 8000 } : {}) }
        }
        return { ...metadata, ...(!paths ? { next_action: 'Create a task to inspect this document with file tools.' } : {}) }
      } })
  }
}
