/** Typed host boundary around the copied JavaScript Feishu implementation. */
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectorService, ImReplyRoute } from './protocol.ts'
import type { ContentBlock } from '../messaging/content.ts'
import type { StoredFile } from '../messaging/files.ts'
export interface NativeAccount { id: string; fingerprint: string; channel: 'feishu' | 'lark' }
export interface NativeFeishu {
  documentRequest(botId: string, fingerprint: string, request: { method: 'GET' | 'POST'; url: string; data?: unknown; params?: Record<string, string | number | boolean> }, signal?: AbortSignal): Promise<unknown>
  service: ConnectorService
  accounts(): NativeAccount[]
  botSettings(id: string): unknown
  allowsCommand(botId: string, expectedFingerprint: string, actorId: string, kind: 'dm' | 'group'): boolean
  start(): Promise<void>
  rpc(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<unknown>
  prepareDialogue(botId: string, conversationKey: string, expectedFingerprint: string): Promise<string>
  readResource(botId: string, route: ImReplyRoute, key: string, options: { expectedFingerprint: string; signal: AbortSignal; maxBytes: number }): Promise<Buffer>
  validateRoute(botId: string, route: ImReplyRoute, options: { expectedFingerprint: string; signal: AbortSignal }): Promise<void>
  sendPart(botId: string, route: ImReplyRoute, block: ContentBlock, options: { expectedFingerprint: string; id: string; signal: AbortSignal;
    conversationKind?: 'dm' | 'group'; file?: { file: StoredFile; bytes: Buffer }; resourceKey?: string; uploaded(key: string): void }): Promise<{ providerMessageIds: string[] }>
  close(): Promise<void>
}
export function createNativeFeishu(options: { context: Context; stateDir: string; lifetime: AbortSignal; logger?: unknown; sdk?: unknown; Runtime?: unknown;
  onAccounts(accounts: NativeAccount[]): Promise<void>; onCard?(botId: string, event: unknown): Promise<unknown>; onDocumentComment?(botId: string, fingerprint: string, event: unknown): Promise<void> }): Promise<NativeFeishu>
export function normalizeNativeMessage(raw: unknown, config: unknown): unknown
