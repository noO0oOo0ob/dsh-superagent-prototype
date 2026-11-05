/** Three Worker profiles and their explicit provider preflight; engine authentication remains in ModLens settings. */
import { useEffect, useState } from 'react'
import { MODEL_PROFILES, type WorkerModels } from '../models.ts'
import type { ApiResponse } from '../app/api.ts'
import { errorText } from './text.ts'
import { Button, Input, SegmentedControl, Switch } from './controls.tsx'
import { Field, Fields, ModelField } from './settings-kit.tsx'
import { Hint, Section } from './widgets.tsx'
import { usePanel } from './provider.tsx'

export function WorkerModelsField({ value, onChange }: { value: WorkerModels; onChange: (value: WorkerModels) => void }) {
  const { t, call } = usePanel()
  const [loaded, setLoaded] = useState<boolean>()
  const [check, setCheck] = useState<{ config: string; result: ApiResponse<'GET worker-models'> }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    let active = true
    call('GET worker-models').then(result => { if (active) setLoaded(result.dependency.loaded) }, failure => { if (active) setError(errorText(failure)) })
    return () => { active = false }
  }, [call])
  const config = JSON.stringify(value)
  const inspect = async () => {
    setBusy(true); setError(undefined)
    try {
      const result = await call('POST worker-models/check', { body: value })
      setLoaded(result.dependency.loaded); setCheck({ config, result })
    } catch (failure) { setError(errorText(failure)) }
    finally { setBusy(false) }
  }
  const checked = check?.config === config ? check.result : undefined
  return <Section title={t('workerModels')} hint={t('workerModelsHint')}>
    <Hint>{t(loaded === false ? 'modlensMissing' : loaded ? 'modlensLoaded' : 'modlensRequired')}</Hint>
    <Hint>{t('modlensEngineUnchecked')}</Hint>
    <Field label={t('workerDefaultProfile')}>
      <SegmentedControl value={value.default} label={t('workerDefaultProfile')}
        options={MODEL_PROFILES.filter(id => value.profiles[id]).map(id => ({ value: id, label: t(`modelProfile.${id}`) }))}
        onChange={id => onChange({ ...value, default: id })} />
    </Field>
    {MODEL_PROFILES.map(id => {
      const profile = value.profiles[id]
      const result = checked?.profiles.find(entry => entry.id === id)
      const change = (next: NonNullable<typeof profile>) => onChange({ ...value, profiles: { ...value.profiles, [id]: next } })
      return <Section key={id} title={t(`modelProfile.${id}`)}>
        <Fields disabled={id === value.default}><Switch checked={!!profile} label={t('enableModelProfile', { profile: t(`modelProfile.${id}`) })}
          onChange={enabled => onChange({ ...value, profiles: { ...value.profiles, [id]: enabled
            ? { model: null, description: t(`modelProfileDescription.${id}`) } : null } })} /></Fields>
        {profile && <>
          <ModelField id={`spa-worker-${id}`} value={profile.model} onChange={model => change({ ...profile, model })} />
          <Field label={t('modelProfileDescription')}><Input maxLength={240} value={profile.description}
            onChange={event => change({ ...profile, description: event.target.value })} /></Field>
          <details><summary>{t('modelAdvancedSettings')}</summary>
            <Field label={t('modlensProvider')} hint={t('modlensProviderHint')}><Input value={profile.visionProvider ?? ''} spellCheck={false}
              onChange={event => { const { visionProvider: _old, ...rest } = profile; change({ ...rest, ...(event.target.value ? { visionProvider: event.target.value } : {}) }) }} /></Field>
          </details>
          {result?.state === 'ready' && <Hint>{t('modelResolved', { route: `${result.route.effective.provider} / ${result.route.effective.model}`,
            vision: t(result.route.vision === 'native' ? 'modelNativeVision' : 'modelModlensVision') })}</Hint>}
          {result?.state === 'error' && <p className="spa-error" role="alert">{t(`modelRouting.${result.code}`)}<br />{result.detail}</p>}
        </>}
      </Section>
    })}
    <Button variant="outline" disabled={busy} onClick={() => { void inspect() }}>{t('checkModelRoutes')}</Button>
    {error && <p className="spa-error" role="alert">{error}</p>}
  </Section>
}
