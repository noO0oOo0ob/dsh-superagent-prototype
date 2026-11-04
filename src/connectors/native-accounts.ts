/** Account discovery never broadens a previously saved intake policy. */
import type { ConnectorConfig } from '../personal/config.ts'
import type { NativeAccount } from './native-feishu.mjs'

/** Preserve enabled state, sender restrictions and conversation restrictions across reconnects. */
export function nativeConnectorConfigs(existing: ConnectorConfig[], accounts: NativeAccount[]): ConnectorConfig[] {
  const connectors = existing.filter(config => !config.id.startsWith('native-'))
  for (const account of accounts) {
    const id = `native-${account.id.replaceAll('_', '-')}`.slice(0, 64)
    const previous = existing.find(item => item.id === id)
    connectors.push(previous ? { ...previous, botId: account.id, fingerprint: account.fingerprint }
      : { id, enabled: true, botId: account.id, fingerprint: account.fingerprint, intake: 'account', conversations: [], allowedSenders: [] })
  }
  return connectors
}
