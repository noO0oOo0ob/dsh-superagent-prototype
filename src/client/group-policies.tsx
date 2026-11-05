/** Group defaults and recorded routing decisions inside the existing bot settings pane. */
import { useState } from 'react'
import { usePanel } from './provider.tsx'
import { usePoll } from './api.ts'
import { Hint, LoadState, Section } from './widgets.tsx'

export function GroupPolicies({ botId }: { botId: string }) {
  const { call, t, notify } = usePanel(), [busy, setBusy] = useState<string>()
  const { data, error, reload } = usePoll(() => call('GET personal/groups'), [call])
  const groups = data?.groups.filter(group => group.provider === 'feishu' && group.accounts.some(account => account.botId === botId)) ?? []
  return <Section title={t('messaging.groups.title')}>
    <Hint>{t('messaging.groups.help')}</Hint>
    {error && <LoadState loading={false} error={error} />}
    {!data ? <LoadState loading={!error} error={undefined} /> : <>
      {!groups.length && <Hint>{t('messaging.groups.empty')}</Hint>}
      {groups.map(group => {
        const current = group.defaultAccount
        const stale = current && !group.defaultAvailable
        return <div className="spa-group-policy" key={group.id}>
          <p className="spa-message-preview">{group.channel} · {group.tenantId} · {group.groupId}</p>
          <label>{t('messaging.groups.default')}
            <select className="spa-input" aria-label={`${t('messaging.groups.default')} · ${group.groupId}`} value={stale ? '' : current?.connectorId ?? ''} disabled={!!busy}
              onChange={async event => {
                const connectorId = event.target.value || null
                setBusy(group.id)
                try { await call('PUT personal/groups/:id', { id: group.id, body: { revision: group.revision, connectorId } }); await reload(); notify(t('messaging.groups.saved')) }
                catch (error) { notify(error instanceof Error ? error.message : String(error)) }
                finally { setBusy(undefined) }
              }}>
              <option value="">{t('messaging.groups.none')}</option>
              {group.accounts.map(account => <option key={account.connectorId} value={account.connectorId} disabled={!account.available}>{account.botId}</option>)}
            </select>
          </label>
          {stale && <Hint>{t('messaging.groups.stale')}</Hint>}
        </div>
      })}
      <details><summary>{t('messaging.groups.decisions')}</summary>
        {data.decisions.filter(decision => decision.provider === 'feishu' && decision.botId === botId).map(decision => <p key={decision.id} className="spa-message-preview">
          {decision.messageId} · {t(decision.accepted ? 'messaging.groups.accepted' : 'messaging.groups.rejected')} · {t(`messaging.target.${decision.reason}`)}
        </p>)}
      </details>
    </>}
  </Section>
}
