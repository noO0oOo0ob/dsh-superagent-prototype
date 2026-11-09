/** Local package preview and explicit activation; editing never mutates the source folder. */
import { useState } from 'react'
import type { ExpertSnapshot } from '../experts/model.ts'
import type { PackageInput } from '../experts/package.ts'
import { usePoll } from './api.ts'
import { usePanel, useAction } from './provider.tsx'
import { Button, Input } from './controls.tsx'
import { Hint, LoadState } from './widgets.tsx'
export function ExpertsPage() {
  const { call, t } = usePanel()
  const { data, error, reload } = usePoll(() => call('GET personal/experts'), [call])
  const [source, setSource] = useState<PackageInput>({ directory: '' }), [preview, setPreview] = useState<ExpertSnapshot>()
  const change = (next: PackageInput) => { setSource(next); setPreview(undefined) }
  const check = useAction(async () => setPreview(await call('POST personal/experts/preview', { body: source })))
  const save = useAction(async () => {
    if (!preview) return
    await call('POST personal/experts', { body: { source, digest: preview.digest, revision: data?.find(entry => entry.snapshot.id === preview.id)?.revision ?? 0 } })
    setPreview(undefined); await reload()
  })
  const toggle = useAction(async (id: string, revision: number, enabled: boolean) => {
    await call('PUT personal/experts/:id', { id, body: { revision, enabled } }); await reload()
  })
  return <div className="spa-experts">
    <Hint>{t('experts.help')}</Hint>
    {error && <LoadState loading={false} error={error} />}
    {!data?.length && <Hint>{t('experts.empty')}</Hint>}
    {data?.map(entry => <div className="spa-expert-card" key={entry.snapshot.id}>
      <strong>{entry.snapshot.name} · {entry.snapshot.version}</strong>
      <p>{entry.snapshot.description}</p>
      <code>{entry.snapshot.digest.slice(0, 12)}</code>
      <div className="spa-expert-actions">
        <Button variant="outline" onClick={() => change({ directory: entry.directory, format: entry.snapshot.format, agents: entry.snapshot.agentsSource, soul: entry.snapshot.soul })}>{t('experts.edit')}</Button>
        <Button variant="outline" disabled={toggle.busy || (!entry.enabled && !!entry.snapshot.issues.length)} onClick={() => toggle.run(entry.snapshot.id, entry.revision, !entry.enabled)}>{t(entry.enabled ? 'experts.disable' : 'experts.enable')}</Button>
      </div>
    </div>)}
    <label>{t('experts.directory')}<Input value={source.directory} onChange={event => change({ ...source, directory: event.target.value })} /></label>
    <label>{t('experts.format')}<select className="spa-input" value={source.format ?? ''} onChange={event => {
      const format = event.target.value
      change({ ...source, format: format === 'claude' || format === 'codex' || format === 'portable' ? format : undefined })
    }}><option value="">{t('experts.auto')}</option><option value="claude">Claude Code</option><option value="codex">Codex</option><option value="portable">Agent Plugins 1.0</option></select></label>
    <Button variant="outline" disabled={check.busy || !source.directory} onClick={() => check.run()}>{t('experts.preview')}</Button>
    {(['agents', 'soul'] as const).map(field => <label key={field}>{t(`experts.${field}`)}
      <textarea className="spa-input spa-expert-text" value={source[field] ?? (field === 'agents' ? preview?.agentsSource : preview?.soul) ?? ''} onChange={event => change({ ...source,
        agents: source.agents ?? preview?.agentsSource, soul: source.soul ?? preview?.soul, [field]: event.target.value })} />
    </label>)}
    {preview && <div className="spa-expert-card"><strong>{preview.name} · {preview.format}</strong>
      <p>{preview.description}</p>
      {!!preview.defaults.length && <p>{t('experts.defaults')}: {preview.defaults.join(', ')}</p>}
      {!!preview.issues.length && <><strong>{t('experts.issues')}</strong><ul>{preview.issues.map(issue => <li key={issue}>{issue}</li>)}</ul></>}
      <p>Skills: {preview.skills.map(skill => skill.name).join(', ') || '—'}</p>
      <p>MCP: {Object.keys(preview.mcp).join(', ') || '—'}</p>
      <Button disabled={save.busy} onClick={() => save.run()}>{t('experts.save')}</Button>
    </div>}
  </div>
}
