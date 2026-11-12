import type { FeishuDocuments } from '../messaging/feishu-documents.ts'
/** Connects native platform adapters to the single durable publication ledger. */
import type { NativeFeishu } from './native-feishu.mjs'
import type { Results } from '../app/results.ts'
import { DeliveryFailure, type MessageDelivery } from '../messaging/delivery.ts'
import type { ContentBlock } from '../messaging/content.ts'

/** Split text without losing content; stable prepared parts are persisted before sending. */
export function prepareFeishuBlocks(blocks: ContentBlock[], maxCharacters = 3500): ContentBlock[] {
  const result: ContentBlock[] = []
  for (const block of blocks) {
    if (block.type === 'text') {
      const characters = [...block.text]
      for (let offset = 0; offset < characters.length; offset += maxCharacters)
        result.push({ ...block, text: characters.slice(offset, offset + maxCharacters).join('') })
    } else {
      if ('caption' in block && block.caption) result.push(...prepareFeishuBlocks([{ type: 'text', text: block.caption, format: 'markdown' }], maxCharacters))
      result.push(block)
    }
  }
  return result
}
/** The transport never chooses recipients; it uses the validated captured route. */
export function nativeDelivery(native: NativeFeishu, ledger: MessageDelivery, results: Results, documents?: FeishuDocuments): void {
  native.service.deliverChecked = async (botId, route, message, options) => {
    const kind = message.channel.address.conversationKind
    const conversationKind = kind === 'dm' || kind === 'group' ? kind : undefined
    await ledger.deliver(message, { supported: ['text', 'image', 'file', 'link', 'card'], prepare: prepareFeishuBlocks,
      send: async (block, part) => {
        if (documents && block.type === 'file') {
          try { await native.validateRoute(botId, route, options) }
          catch (cause) { throw new DeliveryFailure('failed', 'document-route-check-failed', { cause }) }
          block = await documents.publish(botId, options.expectedFingerprint, route, message, block)
        }
        let file
        if ('artifactId' in block) {
          try { file = await results.materialize(block.artifactId) }
          catch (cause) { throw new DeliveryFailure('failed', 'artifact-unavailable', { cause }) }
        }
        try { return await native.sendPart(botId, route, block, { ...part, ...options, conversationKind, ...(file ? { file } : {}) }) }
        catch (cause) {
          const outcome = cause instanceof Error && 'outcome' in cause ? cause.outcome : undefined
          const code = cause instanceof Error && 'code' in cause && typeof cause.code === 'string' ? cause.code : 'provider-outcome-unknown'
          const before = ['account-changed', 'account-unverified', 'bot-not-connected', 'stale-route', 'consumer-unavailable', 'route-check-failed'].includes(code)
          throw new DeliveryFailure(before || outcome === 'failed' ? 'failed' : outcome === 'unsupported' ? 'unsupported' : 'unknown', code, { cause })
        }
      } }, options.signal)
    return { sent: true }
  }
}
