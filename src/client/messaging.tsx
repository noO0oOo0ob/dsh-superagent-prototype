/** Native account onboarding and durable per-part delivery recovery. */
import { useCallback, useEffect, useState } from 'react'
import { usePanel } from './provider.tsx'
import { usePoll } from './api.ts'
import { Button, Input } from './controls.tsx'
import { LoadState, Section, Hint } from './widgets.tsx'
import { deliveryState } from '../messaging/delivery-state.ts'
import type { DeliveryRecord } from '../messaging/delivery.ts'
import { FeishuSettingsTab, FeishuGroupSettingsPage, FeishuVoiceSettingsPage, FeishuSlashPanelSettingsPage,
  FeishuConversationDirectorySettingsPage, AccessPolicySettingsPage, BotSettingsContext, installImStyles,
  installFeishuStyles, setImTranslator, en, zh, type NativeRpc, type BotAccount } from './native-ui.mjs'

const tabs = ['group', 'access', 'directory', 'commands', 'voice'] as const
type Tab = typeof tabs[number]
/** Account operations stay inside the Personal Agent management API. */
export function NativeMessaging() {
  const { t, call } = usePanel()
  const [account, setAccount] = useState<BotAccount>(), [tab, setTab] = useState<Tab>('group')
  const locale = t('lang')
  setImTranslator(key => key === '$locale' ? locale : (locale === 'en' ? en : zh)[key] ?? key)
  useEffect(() => { const removeIm = installImStyles(), removeFeishu = installFeishuStyles(); return () => { removeFeishu(); removeIm() } }, [])
  const rpcCall: NativeRpc = useCallback((endpoint, payload, signal) => call('POST personal/feishu', { body: { endpoint, payload }, signal }), [call])
  const openBotSettings = useCallback((value: BotAccount) => { setAccount(value); setTab('group') }, [])
  return <Section title={t('messaging.title')}>
    <Hint>{t('messaging.intro')}</Hint>
    <Hint>{t('messaging.formats')}</Hint>
    <BotSettingsContext.Provider value={{ openBotSettings }}>
      {account ? <div className="spa-messaging-settings">
        <Button variant="outline" onClick={() => setAccount(undefined)}>{t('messaging.back')}</Button>
        <h3>{account.botName ?? account.botId}</h3>
        <div className="spa-messaging-tabs" role="tablist" aria-label={t('messaging.settings')}>
          {tabs.map(value => <Button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)}>{t(`messaging.tab.${value}`)}</Button>)}
        </div>
        <div role="tabpanel" key={`${account.botId}:${tab}`}>
          {tab === 'group' && <FeishuGroupSettingsPage account={account} rpcCall={rpcCall} />}
          {tab === 'access' && <AccessPolicySettingsPage channel="feishu" account={account} rpcCall={rpcCall} onSaved={policy => setAccount(current => current && ({ ...current, accessPolicy: policy }))} />}
          {tab === 'directory' && <FeishuConversationDirectorySettingsPage account={account} rpcCall={rpcCall} />}
          {tab === 'commands' && <FeishuSlashPanelSettingsPage account={account} rpcCall={rpcCall} onSaved={panel => setAccount(current => current && ({ ...current, slashPanel: panel }))} />}
          {tab === 'voice' && <><Hint>{t('messaging.voicePending')}</Hint><fieldset disabled><FeishuVoiceSettingsPage account={account} rpcCall={rpcCall} /></fieldset></>}
        </div>
      </div> : <FeishuSettingsTab rpcCall={rpcCall} />}
    </BotSettingsContext.Provider>
  </Section>
}

/** Successful parts remain immutable when a user resolves an uncertain send. */
export function MessageDeliveries() {
  const { t, call } = usePanel()
  const { data, error, reload } = usePoll(() => call('GET personal/messages'), [call])
  return <Section title={t('messaging.deliveries')}>
    {error && <LoadState loading={false} error={error} />}
    {!data ? <LoadState loading error={error} /> : !data.length ? <Hint>{t('messaging.empty')}</Hint> :
      [...data].sort((a, b) => Number(deliveryState(a) === 'sent') - Number(deliveryState(b) === 'sent') || b.updatedAt.localeCompare(a.updatedAt)).map(record => <DeliveryItem key={record.id} record={record} reload={reload} />)}
  </Section>
}
function DeliveryItem({ record, reload }: { record: DeliveryRecord; reload(): Promise<void> }) {
  const { t, call, notify, navigate } = usePanel(), [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  const recover = async (partId: string, action: 'retry' | 'confirm_sent') => {
    setBusy(true)
    try { await call('POST personal/messages/:id', { id: record.id, body: { partId, action, note } }); await reload() }
    catch (error) { notify(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <details className="spa-message-record" open={deliveryState(record) !== 'sent'}>
    <summary>{t(`messaging.state.${deliveryState(record)}`)} · {record.parts.length} · {record.id.slice(0, 12)}</summary>
    {record.ticketId && <Button variant="outline" size="sm" onClick={() => navigate({ page: 'execution', id: record.ticketId! })}>{t('messaging.task')}</Button>}
    {record.parts.map((part, index) => <div key={part.id} className="spa-message-part">
      <span>{index + 1}. {t(`messaging.kind.${part.block.type}`)} · {t(`messaging.part.${part.state}`)}</span>
      {part.block.type === 'text' && <p className="spa-message-preview">{part.block.text}</p>}
      {'artifactId' in part.block && <a href={`/super-personal-agent/artifact/${encodeURIComponent(part.block.artifactId)}`} target="_blank" rel="noreferrer">{t('messaging.download')}</a>}
      {part.error && <p role="status">{part.error}</p>}
      {['failed', 'unknown', 'unsupported'].includes(part.state) && <div className="spa-messaging-tabs">
        <Button disabled={busy || !note.trim()} onClick={() => { void recover(part.id, 'retry') }}>{t('messaging.retry')}</Button>
        <Button variant="outline" disabled={busy || !note.trim()} onClick={() => { void recover(part.id, 'confirm_sent') }}>{t('messaging.confirm')}</Button>
      </div>}
    </div>)}
    {record.parts.some(part => ['failed', 'unknown', 'unsupported'].includes(part.state)) &&
      <Input value={note} aria-label={t('messaging.note')} placeholder={t('messaging.note')} onChange={event => setNote(event.target.value)} />}
  </details>
}
