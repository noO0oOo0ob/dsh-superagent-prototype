/** Native account onboarding and durable per-part delivery recovery. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePanel } from './provider.tsx'
import { usePoll } from './api.ts'
import { Button, Input, SegmentedTabs } from './controls.tsx'
import { LoadState, Section, Hint } from './widgets.tsx'
import { GroupPolicies } from './group-policies.tsx'
import { deliveryState } from '../messaging/delivery-state.ts'
import type { DeliveryRecord } from '../messaging/delivery.ts'
import { FeishuSettingsTab, FeishuGroupSettingsPage, FeishuSlashPanelSettingsPage,
  FeishuConversationDirectorySettingsPage, AccessPolicySettingsPage, BotSettingsContext, installImStyles,
  MessagingShell, BotSettingsTabs, installFeishuStyles, setImTranslator, en, zh, type NativeRpc, type BotAccount, type AccountSettingsUpdate } from './native-ui.mjs'

const tabs = ['group', 'access', 'directory', 'commands'] as const
type Tab = typeof tabs[number]
/** Independent account and delivery views retain the panel's route history. */
export function MessagingPage({ view }: { view: 'accounts' | 'deliveries' }) {
  const { t, navigate } = usePanel()
  const locale = t('lang')
  setImTranslator(key => key === '$locale' ? locale : (locale === 'en' ? en : zh)[key] ?? key)
  useEffect(() => { const removeIm = installImStyles(), removeFeishu = installFeishuStyles(); return () => { removeFeishu(); removeIm() } }, [])
  return <div className="spa-messaging">
    <SegmentedTabs label={t('messaging.title')} value={view}
      onChange={value => navigate({ page: 'messaging', query: { view: value } }, true)}
      items={(['accounts', 'deliveries'] as const).map(value => ({ value, label: t(value === 'accounts' ? 'messaging.accounts' : 'messaging.deliveries'), id: `spa-messaging-${value}`, panelId: 'spa-messaging-content' }))} />
    <div className="spa-messaging-content" id="spa-messaging-content" role="tabpanel" aria-labelledby={`spa-messaging-${view}`}>
      {view === 'accounts' ? <MessagingShell label={t('messaging.accounts')} navigationLabel={t('messaging.channels')} channelLabel={t('messaging.feishu')}>
        <NativeMessaging />
      </MessagingShell> : <div className="spa-messaging-deliveries" tabIndex={0}><MessageDeliveries /></div>}
    </div>
  </div>
}

/** Account operations stay inside the Personal Agent management API. */
function NativeMessaging() {
  const { t, call } = usePanel()
  const [account, setAccount] = useState<BotAccount>(), [tab, setTab] = useState<Tab>('group')
  const [accountUpdate, setAccountUpdate] = useState<AccountSettingsUpdate>()
  const root = useRef<HTMLDivElement>(null), back = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null), scrollTop = useRef(0)
  const rpcCall: NativeRpc = useCallback((endpoint, payload, signal) => call('POST personal/feishu', { body: { endpoint, payload }, signal }), [call])
  const openBotSettings = useCallback((value: BotAccount) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    scrollTop.current = root.current?.parentElement?.scrollTop ?? 0
    setAccount(value); setTab('group')
  }, [])
  const saved = (settings: AccountSettingsUpdate['settings']) => {
    if (!account) return
    setAccount(current => current && ({ ...current, ...settings }))
    setAccountUpdate({ botId: account.botId, settings })
  }
  useLayoutEffect(() => {
    const scroller = root.current?.parentElement
    if (scroller) scroller.scrollTop = account ? 0 : scrollTop.current
    if (account) back.current?.focus({ preventScroll: true })
    else returnFocus.current?.focus({ preventScroll: true })
  }, [account?.botId])
  return <BotSettingsContext.Provider value={{ openBotSettings }}>
    <div ref={root} className="spa-messaging-settings">
      <div hidden={!!account}><FeishuSettingsTab rpcCall={rpcCall} accountUpdate={accountUpdate} /></div>
      {account && <>
        <Button ref={back} variant="outline" onClick={() => setAccount(undefined)}>{t('messaging.back')}</Button>
        <h3>{account.botName ?? account.botId}</h3>
        <BotSettingsTabs tabs={tabs.map(id => ({ id, label: t(`messaging.tab.${id}`) }))} activeTabId={tab}
          onChange={id => { const next = tabs.find(value => value === id); if (next) setTab(next) }} />
        <div role="tabpanel" id={`spa-im-bot-settings-${tab}-panel`} aria-labelledby={`spa-im-bot-settings-${tab}-tab`} key={`${account.botId}:${tab}`}>
          {tab === 'group' && <><GroupPolicies botId={account.botId} /><FeishuGroupSettingsPage account={account} rpcCall={rpcCall} managedTargeting /></>}
          {tab === 'access' && <AccessPolicySettingsPage channel="feishu" account={account} rpcCall={rpcCall} onSaved={accessPolicy => saved({ accessPolicy })} />}
          {tab === 'directory' && <FeishuConversationDirectorySettingsPage account={account} rpcCall={rpcCall} />}
          {tab === 'commands' && <FeishuSlashPanelSettingsPage account={account} rpcCall={rpcCall} onSaved={slashPanel => saved({ slashPanel })} />}
        </div>
      </>}
    </div>
  </BotSettingsContext.Provider>
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
