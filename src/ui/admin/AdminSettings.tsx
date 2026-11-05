import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Card, StateBlock, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * Settings.
 *
 * The platform-wide switches and values the System group controls — branding,
 * access rules and classroom defaults. The definitions live on the server, which
 * is the contract: only recognised keys can be written, and only the values that
 * actually changed are sent.
 */

interface Setting {
  key: string
  label: string
  type: 'text' | 'boolean' | 'number'
  group: string
  description: string
  value: string
  updatedAt: string | null
}

interface SettingsPayload {
  settings: Setting[]
  groups: string[]
}

export function AdminSettings() {
  const settings = useApi<SettingsPayload>('/admin/system/settings')
  const [flash, setFlash] = useState<string | null>(null)

  const payload = settings.data

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Settings</h1>
          <p>
            Platform-wide switches and values — branding, who may register, session length and
            classroom defaults. Changes are written to the audit trail.
          </p>
        </div>
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}

      {settings.loading || settings.error ? (
        <StateBlock loading={settings.loading} error={settings.error} onRetry={settings.reload} />
      ) : !payload ? (
        <StateBlock loading={false} error={null} empty="The settings are unavailable." />
      ) : (
        <SettingsForm
          key={payload.settings.map((setting) => `${setting.key}=${setting.value}`).join('|')}
          settings={payload.settings}
          groups={payload.groups}
          onSaved={(message) => {
            setFlash(message)
            settings.reload()
          }}
        />
      )}
    </>
  )
}

function originalValue(setting: Setting): string | boolean {
  return setting.type === 'boolean' ? setting.value === 'true' : setting.value
}

function SettingsForm({
  settings,
  groups,
  onSaved,
}: {
  settings: Setting[]
  groups: string[]
  onSaved: (message: string) => void
}) {
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {}
    for (const setting of settings) initial[setting.key] = originalValue(setting)
    return initial
  })
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const changed = settings.filter((setting) => String(draft[setting.key]) !== String(originalValue(setting)))

  function setValue(key: string, value: string | boolean) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    const values: Record<string, string | number | boolean> = {}
    for (const setting of changed) {
      const raw = draft[setting.key]
      if (setting.type === 'boolean') values[setting.key] = raw === true
      else if (setting.type === 'number') values[setting.key] = Number(raw)
      else values[setting.key] = String(raw)
    }

    setBusy(true)
    setFailure(null)
    try {
      await api('/admin/system/settings', { method: 'PUT', body: { values } })
      onSaved(
        changed.length === 1
          ? `${changed[0].label} updated.`
          : `${formatNumber(changed.length)} settings updated.`,
      )
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'Those settings could not be saved.')
      setBusy(false)
    }
  }

  return (
    <div className="pf-col-stack">
      {failure && <div className="pf-notice pf-notice--bad">{failure}</div>}

      <div className="pf-toolbar">
        <button className="pf-btn" type="button" disabled={busy || changed.length === 0} onClick={save}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <span className="pf-muted" style={{ fontSize: 13 }}>
          {changed.length === 0
            ? 'No changes to save.'
            : `${formatNumber(changed.length)} setting${changed.length === 1 ? '' : 's'} changed.`}
        </span>
      </div>

      {groups.map((group) => {
        const inGroup = settings.filter((setting) => setting.group === group)
        if (inGroup.length === 0) return null
        return (
          <Card key={group} title={group} meta={`${formatNumber(inGroup.length)} setting${inGroup.length === 1 ? '' : 's'}`}>
            <div className="pf-form">
              {inGroup.map((setting) => {
                if (setting.type === 'boolean') {
                  return (
                    <label className="pf-check" key={setting.key}>
                      <input
                        type="checkbox"
                        checked={draft[setting.key] === true}
                        onChange={(event) => setValue(setting.key, event.target.checked)}
                      />
                      <span>
                        {setting.label}
                        <span className="pf-field__hint" style={{ display: 'block' }}>
                          {setting.description}
                        </span>
                      </span>
                    </label>
                  )
                }

                return (
                  <label className="pf-field" key={setting.key}>
                    <span className="pf-field__label">{setting.label}</span>
                    <input
                      className="pf-input"
                      type={setting.type === 'number' ? 'number' : 'text'}
                      min={setting.type === 'number' ? 0 : undefined}
                      maxLength={setting.type === 'text' ? 120 : undefined}
                      value={String(draft[setting.key])}
                      onChange={(event) => setValue(setting.key, event.target.value)}
                    />
                    <span className="pf-field__hint">{setting.description}</span>
                  </label>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
