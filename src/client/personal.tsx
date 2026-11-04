/** Personal settings, source-account diagnostics, and independent delivery recovery controls. */
import { useState } from 'react'
import type { ApiResponse } from '../app/api.ts'
import { usePoll } from './api.ts'
import { Button, Input } from './controls.tsx'
import { SaveBar, useDraft } from './draft.tsx'
import { useAction, usePanel, usePanelData } from './provider.tsx'
import { Field, Fields } from './settings-kit.tsx'
import { valueLabel, type T } from './text.ts'
import { ConfirmButton, Hint, LoadState, Section, When } from './widgets.tsx'

type PersonalView = ApiResponse<'GET personal'>
type Reload = () => Promise<void>
type ConfigKey = keyof PersonalView['config']
const CONFIG_KEYS: readonly ConfigKey[] = ['connectors', 'vault', 'repositories', 'routing', 'scheduler', 'hooks', 'artifacts']
const json = (value: unknown) => JSON.stringify(value, null, 2)
const emptySchedule = { id: '', title: '', text: '', originTriggerId: '', when: { kind: 'once', at: '' } }
function parse(text: string, label: string, t: T): unknown {
  try { const value: unknown = JSON.parse(text); return value }
  catch (error) { if (!(error instanceof SyntaxError)) throw error; throw new Error(t('personal.invalidJson', { label })) }
}
const stateLabel = (t: T, value: string) => valueLabel(t, 'personalState', value)
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
function accountFields(value: unknown) {
  const bot = object(value), account = object(bot.account)
  const string = (value: unknown) => typeof value === 'string' ? value : undefined
  return { botId: string(bot.botId), channel: string(bot.channel), connected: typeof bot.connected === 'boolean' ? bot.connected : undefined,
    account: { name: string(account.name), fingerprint: string(account.fingerprint) },
    capabilities: Array.isArray(bot.capabilities) ? bot.capabilities.filter((value): value is string => typeof value === 'string') : [], error: string(bot.error) }
}

/** Keeps the last successful state visible when a background refresh fails. */
export function PersonalPage() {
  const { call } = usePanel(), { restarts } = usePanelData()
  const { data, error, reload } = usePoll(() => call('GET personal'), [call, restarts])
  if (!data) return <LoadState loading error={error} />
  return <>
    {error && <LoadState loading={false} error={error} />}
    <PersonalConfig data={data} reload={reload} />
    <Connections data={data} reload={reload} />
    <Schedules data={data} reload={reload} />
    <Exports data={data} reload={reload} />
    <HookStatus data={data} reload={reload} />
    <RoutingStatus data={data} />
  </>
}

function PersonalConfig({ data, reload }: { data: PersonalView; reload: Reload }) {
  const { t, call, notify } = usePanel(), { state } = usePanelData()
  const saved = Object.fromEntries(CONFIG_KEYS.map(name => [name, json(data.config[name])])) as Record<ConfigKey, string>
  const draft = useDraft({ key: `dsh-super-personal-agent/draft/${state?.masterId ?? ''}/personal`, saved, revision: data.revision,
    reload, save: async (value, revision) => {
      const config = Object.fromEntries(CONFIG_KEYS.map(name => [name, parse(value[name], t(`personal.config.${name}`), t)]))
      const result = await call('PUT personal', { body: { config, revision } }); notify(t('saved')); return result
    } })
  return <form className="spa-form spa-block" onSubmit={event => { void draft.submit(event) }}>
    <Hint>{t('personal.intro')}</Hint>
    <Fields disabled={draft.busy}>
      {CONFIG_KEYS.map(name => <Field key={name} label={t(`personal.config.${name}`)} note={t(`personal.help.${name}`)}>
        <textarea className="spa-textarea spa-mono" rows={name === 'connectors' || name === 'routing' ? 8 : 5} spellCheck={false}
          value={draft.value[name]} onChange={event => draft.edit({ ...draft.value, [name]: event.target.value })} />
      </Field>)}
    </Fields>
    <SaveBar {...draft} onDiscard={draft.discard} />
  </form>
}

function Connections({ data, reload }: { data: PersonalView; reload: Reload }) {
  const { t, call } = usePanel()
  const [bots, setBots] = useState<unknown[]>()
  const discover = useAction(async () => { setBots((await call('GET personal/bots')).bots) })
  return <Section title={t('personal.connections')} action={<Button variant="outline" size="sm" disabled={discover.busy}
    onClick={() => { void discover.run() }}>{t('personal.discover')}</Button>}>
    <Hint>{t('personal.connectionsHelp')}</Hint>
    {Object.entries(data.connectors).length ? Object.entries(data.connectors).map(([id, status]) => <div className="spa-form spa-block" key={id}>
      <div className="spa-row-title">{id} · {stateLabel(t, status.state)}</div>
      {status.detail && <p className="spa-hint">{status.detail}</p>}
    </div>) : <Hint>{t('personal.noConnections')}</Hint>}
    {bots && <details open><summary>{t('personal.accounts', { count: bots.length })}</summary>
      {bots.length ? <pre className="spa-event-text spa-mono">{json(bots.map(accountFields))}</pre> : <Hint>{t('personal.noAccounts')}</Hint>}
    </details>}
    {data.deliveries.length > 0 && <Hint>{t('personal.deliveryHelp')}</Hint>}
    {data.deliveries.map(item => <Delivery key={item.id} item={item} reload={reload} />)}
  </Section>
}

function Delivery({ item, reload }: { item: PersonalView['deliveries'][number]; reload: Reload }) {
  const { t, call, notify } = usePanel(), [note, setNote] = useState('')
  const reconcile = useAction(async (action: 'confirm_sent' | 'retry') => {
    if (!note.trim()) return
    await call('POST personal/deliveries/:id', { id: item.id, body: { action, note: note.trim() } })
    notify(t('personal.recorded')); setNote('')
  }, { reload })
  const uncertain = item.state === 'uncertain' || item.state === 'sending'
  return <div className="spa-form spa-block">
    <div className="spa-row-title">{item.connectorId} · {stateLabel(t, item.state)} · <When at={item.at} /></div>
    <small className="spa-mono">{item.id}</small>
    {item.error && <p className="spa-error">{item.error}</p>}
    {uncertain && <>
      <Field label={t('personal.checkNote')}><Input value={note} onChange={event => setNote(event.target.value)} /></Field>
      <div className="spa-actions">
        <Button variant="outline" disabled={reconcile.busy || !note.trim()} onClick={() => { void reconcile.run('confirm_sent') }}>
          {t('personal.confirmSent')}</Button>
        <Button variant="outline" disabled={reconcile.busy || !note.trim()} onClick={() => { void reconcile.run('retry') }}>
          {t('personal.retryChecked')}</Button>
      </div>
    </>}
  </div>
}

function Schedules({ data, reload }: { data: PersonalView; reload: Reload }) {
  const { t } = usePanel()
  return <Section title={t('personal.schedules')} count={data.schedules.length}>
    <Hint>{t('personal.scheduleHelp')}</Hint>
    <NewSchedule reload={reload} />
    {data.schedules.map(item => <Schedule key={item.spec.id} item={item} reload={reload} />)}
    {data.runs.length > 0 && <details><summary>{t('personal.runs', { count: data.runs.length })}</summary>
      {data.runs.map(item => <ScheduleRun key={item.id} item={item} schedules={data.schedules} reload={reload} />)}
    </details>}
  </Section>
}

function NewSchedule({ reload }: { reload: Reload }) {
  const { t, call, notify } = usePanel()
  const [text, setText] = useState(() => json(emptySchedule))
  const create = useAction(async () => {
    await call('POST personal/schedules', { body: { spec: parse(text, t('personal.scheduleSpec'), t) } })
    notify(t('personal.scheduleCreated')); setText(json(emptySchedule))
  }, { reload })
  return <details><summary>{t('personal.newSchedule')}</summary>
    <form className="spa-form spa-block" onSubmit={event => { event.preventDefault(); void create.run() }}>
      <Fields disabled={create.busy}>
        <Field label={t('personal.scheduleSpec')} note={t('personal.scheduleSpecHelp')}>
          <textarea className="spa-textarea spa-mono" rows={10} spellCheck={false} value={text} onChange={event => setText(event.target.value)} />
        </Field>
        <Button type="submit" variant="outline">{t('personal.createSchedule')}</Button>
      </Fields>
    </form>
  </details>
}

function Schedule({ item, reload }: { item: PersonalView['schedules'][number]; reload: Reload }) {
  const { t, call } = usePanel()
  const action = useAction(async (action: 'pause' | 'resume') => { await call('POST personal/schedules/:id', { id: item.spec.id, body: { action } }) }, { reload })
  const draft = useDraft({ saved: { text: json(item.spec) }, revision: item.revision, reload,
    save: async (value, revision) => call('PUT personal/schedules/:id', { id: item.spec.id, body: { revision, spec: parse(value.text, t('personal.scheduleSpec'), t) } }) })
  const editable = item.state === 'active' || item.state === 'paused'
  return <div className="spa-form spa-block">
    <div className="spa-row-title">{item.spec.title} · {stateLabel(t, item.state)}</div>
    <small className="spa-mono">{item.spec.id}</small>
    {item.nextAt && <p className="spa-hint">{t('personal.nextRun')} <When at={item.nextAt} /></p>}
    {editable && <div className="spa-actions">
      <Button variant="outline" size="sm" disabled={action.busy} onClick={() => { void action.run(item.state === 'active' ? 'pause' : 'resume') }}>
        {t(item.state === 'active' ? 'personal.pause' : 'personal.resume')}</Button>
      <ConfirmButton label={t('stop')} title={t('personal.stopSchedule')} message={t('personal.stopScheduleHelp')}
        onConfirm={async () => { await call('POST personal/schedules/:id', { id: item.spec.id, body: { action: 'stop' } }); await reload() }} />
    </div>}
    <details><summary>{t(editable ? 'personal.editSchedule' : 'personal.scheduleSpec')}</summary>
      <form className="spa-form" onSubmit={event => { void draft.submit(event) }}>
        <Fields disabled={draft.busy || !editable}>
          <Field label={t('personal.scheduleFor', { title: item.spec.title })} note={t('personal.scheduleSpecHelp')}>
            <textarea className="spa-textarea spa-mono" rows={10} spellCheck={false} value={draft.value.text}
              onChange={event => draft.edit({ text: event.target.value })} />
          </Field>
        </Fields>
        {editable && <SaveBar {...draft} onDiscard={draft.discard} />}
      </form>
    </details>
  </div>
}

function ScheduleRun({ item, schedules, reload }: { item: PersonalView['runs'][number]; schedules: PersonalView['schedules']; reload: Reload }) {
  const { t, call } = usePanel()
  const retry = useAction(async () => { await call('POST personal/runs/:id/retry', { id: item.id }) }, { reload })
  const schedule = schedules.find(value => value.spec.id === item.scheduleId)
  const retryable = (item.state === 'failed' || item.state === 'blocked') && schedule?.state === 'active' && schedule.revision === item.revision
  return <div className="spa-form spa-block">
    <div className="spa-row-title">{item.scheduleId} · {stateLabel(t, item.state)} · <When at={item.scheduledAt} /></div>
    {item.error && <p className="spa-error">{item.error}</p>}
    {retryable && <Button variant="outline" size="sm" disabled={retry.busy} onClick={() => { void retry.run() }}>{t('personal.retryIntake')}</Button>}
  </div>
}

function Exports({ data, reload }: { data: PersonalView; reload: Reload }) {
  const { t } = usePanel()
  return <Section title={t('personal.exports')} count={data.vault.length}>
    <Hint>{t('personal.exportsHelp')}</Hint>
    {data.vault.length ? data.vault.map(item => <VaultExport key={item.id} item={item} reload={reload} />) : <Hint>{t('none')}</Hint>}
  </Section>
}
function VaultExport({ item, reload }: { item: PersonalView['vault'][number]; reload: Reload }) {
  const { t, call, notify } = usePanel()
  const retry = useAction(async () => {
    const result = await call('POST personal/vault/:id', { id: item.resultId })
    notify(t(result.queued ? 'personal.exportQueued' : 'personal.exportDisabled'))
  }, { reload })
  return <div className="spa-form spa-block">
    <div className="spa-row-title">{item.ticketId} · {stateLabel(t, item.state)}</div>
    <p className="spa-hint spa-mono">{item.path ?? `${item.root}/${item.directory}`}</p>
    {item.error && <p className="spa-error">{item.error}</p>}
    <div className="spa-actions">
      {item.uri?.startsWith('obsidian://open?') && <a className="spa-inline-link" href={item.uri}>{t('personal.openVault')}</a>}
      {(item.state === 'pending' || item.state === 'preserved') && <Button variant="outline" size="sm" disabled={retry.busy}
        onClick={() => { void retry.run() }}>{t('personal.retryExport')}</Button>}
    </div>
  </div>
}

function HookStatus({ data, reload }: { data: PersonalView; reload: Reload }) {
  const { t, call } = usePanel()
  const [events, setEvents] = useState<ApiResponse<'GET personal/hooks'>>()
  const load = useAction(async () => { setEvents(await call('GET personal/hooks')) })
  return <Section title={t('personal.hooks')} count={data.hooks.length} action={<Button variant="outline" size="sm" disabled={load.busy}
    onClick={() => { void load.run() }}>{t('personal.hookEvents')}</Button>}>
    <Hint>{t('personal.hooksHelp')}</Hint>
    {data.hooks.map(item => <HookDelivery key={item.id} item={item} reload={reload} />)}
    {events && <details open><summary>{t('personal.events', { count: events.length })}</summary>
      {events.map(item => <HookEvent key={item.id} item={item} reload={reload} />)}
      {!events.length && <Hint>{t('none')}</Hint>}
    </details>}
  </Section>
}
function HookDelivery({ item, reload }: { item: PersonalView['hooks'][number]; reload: Reload }) {
  const { t, call } = usePanel()
  const retry = useAction(async () => { await call('POST personal/hooks/:id', { id: item.id, body: { action: 'retry' } }) }, { reload })
  return <div className="spa-form spa-block">
    <div className="spa-row-title">{stateLabel(t, item.state)} · <When at={item.updatedAt} /></div>
    <small className="spa-mono">{item.eventId}</small><p className="spa-hint spa-mono">{item.path ?? item.directory}</p>
    {item.error && <p className="spa-error">{item.error}</p>}
    {(item.state === 'failed' || item.state === 'blocked') && <Button variant="outline" size="sm" disabled={retry.busy}
      onClick={() => { void retry.run() }}>{t('personal.retryHook')}</Button>}
  </div>
}
function HookEvent({ item, reload }: { item: ApiResponse<'GET personal/hooks'>[number]; reload: Reload }) {
  const { t, call } = usePanel()
  return <div className="spa-form spa-block">
    <div className="spa-row-title">{item.kind} · {item.taskId} · <When at={item.at} /></div>
    <small className="spa-mono">{item.id}</small>
    <ConfirmButton label={t('personal.replayHook')} title={t('personal.replayHook')} message={t('personal.replayHookHelp')}
      onConfirm={async () => { await call('POST personal/hooks/:id', { id: item.id, body: { action: 'replay' } }); await reload() }} />
  </div>
}

function RoutingStatus({ data }: { data: PersonalView }) {
  const { t } = usePanel()
  return <Section title={t('personal.routes')} count={data.routeDecisions.length}>
    {data.routeDecisions.length ? <details><summary>{t('personal.routeHistory')}</summary>
      {data.routeDecisions.map(item => <div className="spa-form spa-block" key={item.id}>
        <div className="spa-row-title">{item.ticketId} · {t(item.allowed ? 'personal.allowed' : 'personal.denied')} · <When at={item.at} /></div>
        <p className="spa-hint">{item.from.source}/{item.from.conversation} → {item.to.source}/{item.to.conversation}</p>
        <p className="spa-hint">{valueLabel(t, 'personalRoute', item.reason)}</p>
      </div>)}
    </details> : <Hint>{t('none')}</Hint>}
  </Section>
}
