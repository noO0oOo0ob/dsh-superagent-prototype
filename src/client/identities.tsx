/** Identity source editor with explicit preview and immutable catalog publication. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { IdentityFiles, IdentityPreview, IdentityVersion } from '../personal/identities.ts'
import { usePoll } from './api.ts'
import { Button, Input } from './controls.tsx'
import { saveBarText, useDraft } from './draft.tsx'
import { useAction, usePanel } from './provider.tsx'
import { Hint, LoadState, Section } from './widgets.tsx'
const empty: IdentityFiles = { 'agent.yaml': '', 'AGENTS.md': '', 'SOUL.md': '' }
const files = ['agent.yaml', 'AGENTS.md', 'SOUL.md'] as const

export function IdentitiesPage() {
  const { call, t } = usePanel(), [selected, setSelected] = useState('common'), [newId, setNewId] = useState('')
  const { data, error, reload } = usePoll(() => call('GET personal/identities'), [call])
  const [fresh, setFresh] = useState(false)
  const choose = (id: string, fresh = false) => { setSelected(id); setFresh(fresh) }
  return <div className="spa-identities">
    <Hint>{t('identity.catalogOnly')}</Hint>
    <Hint>{t('identity.activationUnavailable')}</Hint>
    {!data ? <LoadState loading={!error} error={error} /> : <>
      {error && <LoadState loading={false} error={error} />}
      <div className="spa-identity-picker">
        <label>{t('identity.select')}<select className="spa-input" aria-label={t('identity.select')} value={selected}
          onChange={event => choose(event.target.value)}>
          {data.identities.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id} · v{item.revision}</option>)}
          {fresh && !data.identities.some(item => item.id === selected) && <option value={selected}>{selected}</option>}
        </select></label>
        <form onSubmit={event => { event.preventDefault(); choose(newId, true); setNewId('') }}>
          <Input aria-label={t('identity.newId')} placeholder={t('identity.newId')} value={newId} onChange={event => setNewId(event.target.value)} />
          <Button type="submit" variant="outline" disabled={!/^[a-z][a-z0-9-]{0,63}$/.test(newId) || data.identities.some(item => item.id === newId)}>{t('identity.create')}</Button>
        </form>
      </div>
      {data.identities.find(item => item.id === selected)?.outdatedParents.length ? <Hint>{t('identity.parentChanged')}</Hint> : null}
      <IdentityEditor key={selected} id={selected} fresh={fresh} onPublished={reload} />
    </>}
  </div>
}
function IdentityEditor({ id, fresh, onPublished }: { id: string; fresh: boolean; onPublished: () => Promise<unknown> }) {
  const { call, t } = usePanel(), [current, setCurrent] = useState<IdentityVersion>(), [error, setError] = useState<Error>()
  const reload = useCallback(async () => { setCurrent(await call('GET personal/identities/:id', { id })); await onPublished() }, [call, id, onPublished])
  useEffect(() => {
    if (fresh) return
    let disposed = false
    call('GET personal/identities/:id', { id }).then(value => { if (!disposed) setCurrent(value) }, error => { if (!disposed) setError(error) })
    return () => { disposed = true }
  }, [call, id, fresh])
  return current || fresh ? <IdentityForm id={id} current={current} reload={reload} onSaved={setCurrent} /> : <LoadState loading={!error} error={error} />
}
function IdentityForm({ id, current, reload, onSaved }: { id: string; current?: IdentityVersion; reload: () => Promise<unknown>; onSaved: (value: IdentityVersion) => void }) {
  const { call, t, notify } = usePanel(), [preview, setPreview] = useState<IdentityPreview>(), [directory, setDirectory] = useState<string>()
  const publish = async (value: IdentityFiles, baseRevision: number) => {
    if (!preview || JSON.stringify(preview.files) !== JSON.stringify(value)) throw new Error(t('identity.previewFirst'))
    const digest = preview.digest
    setPreview(undefined)
    const result = await call('PUT personal/identities/:id', { id, body: { files: value, baseRevision, previewDigest: digest } })
    onSaved(result); notify(t('identity.published')); return result
  }
  const draft = useDraft({ key: `dsh-super-personal-agent/identity-draft/${id}`, saved: current?.files ?? empty, revision: current?.revision ?? 0,
    reload, save: publish })
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    if (!current && !draft.dirty) draft.edit({ ...empty, 'agent.yaml': `id: ${id}\nname: ${id}\nparent: common\n` })
  }, [current, draft, id])
  const validPreview = preview && JSON.stringify(preview.files) === JSON.stringify(draft.value) && preview.revision === draft.revision + 1
  const check = useAction(async () => { setPreview(await call('POST personal/identities/preview', { body: draft.value })) })
  const exported = useAction(async () => { const result = await call('POST personal/identities/:id/export', { id }); setDirectory(result.directory) })
  const imported = useAction(async () => {
    const value = await call('POST personal/identities/:id/import', { id })
    if (value.baseRevision !== draft.revision) { await reload(); throw new Error(t('identity.reloadBeforeImport')) }
    draft.edit(value.files); setPreview(undefined); notify(t('identity.imported'))
  })
  const inherited = useAction(async () => { await publish(draft.value, draft.revision); await reload() })
  const parentUpdate = validPreview && JSON.stringify(preview.sources.slice(0, -1)) !== JSON.stringify(current?.sources.slice(0, -1) ?? [])
  const latest = useAction(reload), busy = inherited.busy || draft.busy || check.busy || exported.busy || imported.busy || latest.busy
  const notice = saveBarText(t, draft.state)
  return <form className="spa-identity-editor" onSubmit={event => { event.preventDefault(); if (draft.dirty) void draft.submit(); else if (parentUpdate) void inherited.run() }}>
    <Hint>{t('identity.revision', { revision: current?.revision ?? 0 })}</Hint>
    <Hint>{t('identity.filesHelp')}</Hint>
    <fieldset disabled={busy}>
      {files.map(name => <label key={name}>{name}<textarea className="spa-textarea spa-identity-file" aria-label={name}
        spellCheck={false} rows={name === 'agent.yaml' ? 6 : 8} value={draft.value[name]} onChange={event => { draft.edit({ ...draft.value, [name]: event.target.value }); setPreview(undefined) }} /></label>)}
    </fieldset>
    <div className="spa-identity-actions">
      <Button variant="outline" disabled={busy} onClick={() => void check.run()}>{t('identity.preview')}</Button>
      <Button variant="primary" type="submit" disabled={busy || (!draft.dirty && !parentUpdate) || !validPreview}>{t('identity.publish')}</Button>
      <Button disabled={busy || !draft.dirty} onClick={() => { draft.discard(); setPreview(undefined) }}>{t('discard')}</Button>
      <Button disabled={busy || !current} onClick={() => void latest.run()}>{t('identity.reload')}</Button>
    </div>
    <p className={notice.error ? 'spa-error' : 'spa-hint'} role={notice.error ? 'alert' : 'status'}>{notice.error ?? notice.status}</p>
    {validPreview && <Section title={t('identity.preview')}>
      <p className="spa-message-preview">{t('identity.sources')}: {preview.sources.map(source => `${source.id}@${source.revision}`).join(' → ')}</p>
      <p>{t('identity.capabilities')}: {preview.effective.capabilities.map(value => t(`identity.capability.${value}`)).join(t('listSeparator')) || t('identity.none')}</p>
      <p className="spa-message-preview">{t('identity.model')}: {preview.effective.model ? `${preview.effective.model.provider} / ${preview.effective.model.model}` : t('identity.hostDefault')}</p>
      <p>{t('identity.preset')}: {preview.effective.preset ?? t('identity.hostDefault')}</p>
      <pre className="spa-identity-preview">{preview.text || t('identity.emptyText')}</pre>
    </Section>}
    <Section title={t('identity.localDraft')}>
      <Hint>{t('identity.localDraftHelp')}</Hint>
      <div className="spa-identity-actions">
        <Button variant="outline" disabled={busy || !current} onClick={() => void exported.run()}>{t('identity.export')}</Button>
        <Button variant="outline" disabled={busy || !current || draft.dirty} onClick={() => void imported.run()}>{t('identity.import')}</Button>
      </div>
      {directory && <p className="spa-message-preview" role="status">{directory}</p>}
    </Section>
  </form>
}
