/** Typed integration of independently bundled account settings. */
import type { ComponentType, Context } from 'react'
export type NativeRpc = (endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<unknown>
export interface BotAccount { botId: string; botName?: string; [key: string]: unknown }
interface SettingsProps { account: BotAccount; rpcCall: NativeRpc; onSaved?(value: unknown): void }
export const FeishuSettingsTab: ComponentType<{ rpcCall: NativeRpc }>
export const FeishuGroupSettingsPage: ComponentType<SettingsProps>
export const FeishuVoiceSettingsPage: ComponentType<SettingsProps>
export const FeishuSlashPanelSettingsPage: ComponentType<SettingsProps>
export const FeishuConversationDirectorySettingsPage: ComponentType<SettingsProps>
export const AccessPolicySettingsPage: ComponentType<SettingsProps & { channel: string }>
export const BotSettingsContext: Context<{ openBotSettings(account: BotAccount): void }>
export function installImStyles(): () => void
export function installFeishuStyles(): () => void
export function setImTranslator(translator: (key: string) => string): void
export const en: Readonly<Record<string, string>>
export const zh: Readonly<Record<string, string>>
export const WorkspaceDirectoryPickerContext: Context<{ listDirectory(path?: string, signal?: AbortSignal): Promise<unknown>; pickDirectory(): Promise<string | null> } | null>
