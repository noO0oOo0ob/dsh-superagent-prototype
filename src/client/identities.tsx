/** Legacy identity archive with explicit export to disabled expert packages. */
import { useState } from 'react'
import { usePoll } from './api.ts'
import { useAction, usePanel } from './provider.tsx'
import { Button } from './controls.tsx'
import { Hint, LoadState } from './widgets.tsx'
export function IdentitiesPage() {
  const { call, t } = usePanel(), [selected, setSelected] = useState('common'), [directory, setDirectory] = useState('')
  const list = usePoll(() => call('GET personal/identities'), [call])
  const detail = usePoll(() => call('GET personal/identities/:id', { id: selected }), [call, selected])
  const migrate = useAction(async () => { const result = await call('POST personal/identities/:id/expert', { id: selected }); setDirectory(result.directory) })
  return <div className="spa-identities">
    <Hint>{t('identity.archive')}</Hint>
    {list.error && <LoadState loading={false} error={list.error} />}
    <label>{t('identity.select')}<select className="spa-input" aria-label={t('identity.select')} value={selected} onChange={event => { setSelected(event.target.value); setDirectory('') }}>
      {list.data?.identities.map(item => <option key={item.id} value={item.id}>{item.name} · v{item.revision}</option>)}
    </select></label>
    {detail.error && <LoadState loading={false} error={detail.error} />}
    {detail.data && <>
      {(['agent.yaml', 'AGENTS.md', 'SOUL.md'] as const).map(file => <label key={file}>{file}<textarea aria-label={file} className="spa-input spa-expert-text" readOnly value={detail.data!.files[file]} /></label>)}
      <Button disabled={migrate.busy || !!directory} onClick={() => migrate.run()}>{t('identity.migrate')}</Button>
    </>}
    {directory && <Hint>{t('identity.migrated', { directory })}</Hint>}
  </div>
}
