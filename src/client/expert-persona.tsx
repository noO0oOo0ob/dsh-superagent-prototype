/** Main and bot persona settings with explicit next-turn/new-conversation semantics. */
import { useEffect, useState } from 'react'
import type { ExpertPreferencesConfig } from '../experts/preferences.ts'
import { COORDINATOR_AGENTS, GENERAL_SOUL } from '../experts/model.ts'
import { usePanel, useAction } from './provider.tsx'
import { usePoll } from './api.ts'
import { Button } from './controls.tsx'
import { Hint, LoadState } from './widgets.tsx'
export function ExpertPersona({ botId }: { botId?: string }) {
  const { call, t } = usePanel()
  const personal = usePoll(() => call('GET personal'), [call])
  const source = botId ? personal.data?.config.connectors.find(item => item.botId === botId && (item.provider ?? 'feishu') === 'feishu')?.id : undefined
  if (botId && !source) return <Hint>{t('experts.connectFirst')}</Hint>
  return <PersonaEditor key={source ?? 'main'} source={source ? `im-${source}` : undefined} />
}
function PersonaEditor({ source }: { source?: string }) {
  const { call, t } = usePanel()
  const prefs = usePoll(() => call('GET personal/expert-preferences'), [call]), packages = usePoll(() => call('GET personal/experts'), [call])
  const [draft, setDraft] = useState<{ revision: number; config: ExpertPreferencesConfig }>()
  useEffect(() => { if (!draft && prefs.data) setDraft(structuredClone(prefs.data)) }, [draft, prefs.data])
  const save = useAction(async () => { if (draft) setDraft(await call('PUT personal/expert-preferences', { body: draft })) })
  if (!draft) return <LoadState loading={!prefs.error} error={prefs.error} />
  const account = draft.config.accounts.find(item => item.source === source) ?? {
    source: source ?? '', persona: { agents: COORDINATOR_AGENTS, soul: GENERAL_SOUL }, allowed: null, defaultExpert: null, mode: 'auto' as const }
  const persona = source ? account.persona : draft.config.main
  const change = (next: Partial<typeof account>) => setDraft({ ...draft, config: { ...draft.config,
    accounts: [...draft.config.accounts.filter(item => item.source !== source), { ...account, ...next }] } })
  const text = (field: 'agents' | 'soul', value: string) => source ? change({ persona: { ...persona, [field]: value } })
    : setDraft({ ...draft, config: { ...draft.config, main: { ...persona, [field]: value } } })
  return <div className="spa-experts">
    <Hint>{t(source ? 'experts.botTiming' : 'experts.mainTiming')}</Hint>
    {(['agents', 'soul'] as const).map(field => <label key={field}>{t(`experts.${field}`)}<textarea aria-label={`${source ?? t('experts.mainPersona')} / ${t(`experts.${field}`)}`} className="spa-input spa-expert-text" value={persona[field]} onChange={event => text(field, event.target.value)} /></label>)}
    {source && <>
      <label>{t('experts.mode')}<select className="spa-input" value={account.mode} onChange={event => change({ mode: event.target.value === 'fixed' ? 'fixed' : 'auto' })}>
        <option value="auto">{t('experts.autoRouting')}</option><option value="fixed">{t('experts.fixedRouting')}</option>
      </select></label>
      <label>{t('experts.defaultExpert')}<select className="spa-input" value={account.defaultExpert ?? ''} onChange={event => change({ defaultExpert: event.target.value || null })}>
        <option value="">{t('experts.noDefault')}</option>{packages.data?.map(entry => <option key={entry.snapshot.id} value={entry.snapshot.id}>{entry.snapshot.name}</option>)}
      </select></label>
      <label><span><input type="checkbox" checked={account.allowed === null} onChange={event => change({ allowed: event.target.checked ? null : [] })} /> {t('experts.allowAll')}</span></label>
      {account.allowed !== null && packages.data?.map(entry => <label key={entry.snapshot.id}><span><input type="checkbox" checked={account.allowed?.includes(entry.snapshot.id) ?? false} onChange={event => change({ allowed: event.target.checked ? [...account.allowed ?? [], entry.snapshot.id] : account.allowed?.filter(id => id !== entry.snapshot.id) ?? [] })} /> {entry.snapshot.name}</span></label>)}
      <Hint>{t('experts.generalAllowed')}</Hint>
    </>}
    {prefs.error && <LoadState loading={false} error={prefs.error} />}
    {packages.error && <LoadState loading={false} error={packages.error} />}
    <Button disabled={save.busy} onClick={() => save.run()}>{t('experts.savePreferences')}</Button>
  </div>
}
