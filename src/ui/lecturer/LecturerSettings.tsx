import { useEffect, useState } from 'react'
import { ApiError, api } from '../../api/client'
import { useAuthStore } from '../../state/authStore'
import { Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import type { SettingsPayload } from './api'

/**
 * Settings.
 *
 * The lecturer can change the one thing the server lets them change — their
 * display name. Everything else on this page is shown, not edited: the email and
 * role are fixed by the account, and the teaching figures are counted from
 * stored rows.
 */
export function LecturerSettings() {
  const { data, loading, error, reload } = useApi<SettingsPayload>('/lecturer/settings')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  // Seed the field once the profile arrives; do not re-seed on every render.
  useEffect(() => {
    if (data) setFullName((current) => (current === '' ? data.profile.fullName : current))
  }, [data])

  async function save() {
    setBusy(true)
    setNotice(null)
    setFailure(null)
    try {
      const result = await api<{ ok: true; fullName: string }>('/lecturer/settings', {
        method: 'PUT',
        body: { fullName: fullName.trim() },
      })
      setNotice(`Your display name is now "${result.fullName}".`)
      // Refresh the session so the top bar shows the new name.
      await useAuthStore.getState().bootstrap()
      reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'Your settings could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  if (loading || error || !data) {
    return (
      <>
        <div className="pf-page-head">
          <div>
            <h1>Settings</h1>
            <p>Your lecturer profile and teaching figures.</p>
          </div>
        </div>
        <StateBlock loading={loading} error={error} onRetry={reload} />
      </>
    )
  }

  const { profile, teaching } = data
  const changed = fullName.trim() !== profile.fullName && fullName.trim().length >= 2

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Settings</h1>
          <p>Your lecturer profile and a summary of what you teach.</p>
        </div>
      </div>

      {notice && <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>{notice}</div>}
      {failure && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 16 }}>{failure}</div>}

      <div className="pf-stats">
        <StatTile label="Classes" value={formatNumber(teaching.classes)} sub="You run" />
        <StatTile label="Students" value={formatNumber(teaching.students)} sub="Active enrolments" tone="accent" />
        <StatTile label="Assignments" value={formatNumber(teaching.assignments)} sub="Set in total" />
        <StatTile label="Scenarios" value={formatNumber(teaching.scenarios)} sub="Built in total" />
      </div>

      <div className="pf-cols pf-cols--2">
        <Card title="Your profile">
          <div className="pf-form">
            <label className="pf-field">
              <span className="pf-field__label">Display name</span>
              <input
                className="pf-input pf-input--block"
                value={fullName}
                maxLength={80}
                onChange={(event) => setFullName(event.target.value)}
              />
              <span className="pf-field__hint">Shown to your students and on the reports you generate.</span>
            </label>

            <div className="pf-actions">
              <button className="pf-btn" type="button" disabled={busy || !changed} onClick={save}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </Card>

        <Card title="Account">
          <div className="pf-dl">
            <dt>Email</dt>
            <dd>{profile.email}</dd>
            <dt>Role</dt>
            <dd>{profile.role}</dd>
            <dt>Account created</dt>
            <dd>{formatRelative(profile.createdAt)}</dd>
          </div>
          <p className="pf-card__note" style={{ marginTop: 12 }}>
            Your email and role are set by the administrator when your account is created and cannot
            be changed here.
          </p>
        </Card>
      </div>
    </>
  )
}
