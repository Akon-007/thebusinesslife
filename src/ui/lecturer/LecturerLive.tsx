import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  EVENT_KINDS,
  formatDateTime,
  type ClassesPayload,
  type EconomicEventInput,
  type LivePayload,
} from './api'

/**
 * The live classroom.
 *
 * A snapshot of a class while it is running: who is present, how far each
 * student has got, and the economic events currently in play. A lecturer can
 * introduce an event from here, scoped to this class and expiring on its own.
 */
export function LecturerLive() {
  const [classId, setClassId] = useState('')
  const classes = useApi<ClassesPayload>('/lecturer/classes')
  const live = useApi<LivePayload>(`/lecturer/live?classId=${encodeURIComponent(classId)}`)
  const [flash, setFlash] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const activeClassId = live.data?.class?.id ?? classId
  const classList = classes.data?.classes ?? []

  function reset() {
    setFlash(null)
    setFailure(null)
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Live Classroom</h1>
          <p>
            Watch a class as it works. Introduce an economic event to test how students respond and
            see the events already in play.
          </p>
        </div>
        <div className="pf-actions">
          <select className="pf-select" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">{classList.length === 0 ? 'No classes' : 'Choose a class'}</option>
            {classList.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
          <button className="pf-btn pf-btn--ghost" type="button" onClick={() => live.reload()}>
            Refresh
          </button>
        </div>
      </div>

      {flash && <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>{flash}</div>}
      {failure && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 16 }}>{failure}</div>}

      {live.loading || live.error || !live.data ? (
        <StateBlock loading={live.loading} error={live.error} onRetry={live.reload} />
      ) : !live.data.class ? (
        <StateBlock loading={false} error={null} empty="You have no classes yet. Create a class to run a live session." />
      ) : (
        <>
          <div className="pf-stats">
            <StatTile label="Students" value={live.data.summary ? formatNumber(live.data.summary.students) : '—'} sub="Enrolled and active" />
            <StatTile label="Online now" value={live.data.summary ? formatNumber(live.data.summary.online) : '—'} sub="Active in the last 5 minutes" tone="good" />
            <StatTile label="With a company" value={live.data.summary ? formatNumber(live.data.summary.withBusiness) : '—'} sub="Business created" />
            <StatTile
              label="Work submitted"
              value={live.data.summary ? `${formatNumber(live.data.summary.submitted)}/${formatNumber(live.data.summary.assigned)}` : '—'}
              sub="Across this class's assignments"
            />
            <StatTile
              label="Average level"
              value={live.data.summary ? live.data.summary.averageLevel.toFixed(1) : '—'}
              sub={live.data.summary ? `${formatNumber(Math.round(live.data.summary.averageXp))} avg XP` : ''}
              tone="accent"
            />
          </div>

          <div className="pf-cols pf-cols--2">
            <Card title="Participants" meta={`${live.data.participants.length} in class`}>
              {live.data.participants.length === 0 ? (
                <p className="pf-card__note">No students are enrolled in this class yet.</p>
              ) : (
                <div className="pf-table-wrap">
                  <table className="pf-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>State</th>
                        <th className="pf-table__num">Tasks</th>
                        <th className="pf-table__num">Overdue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {live.data.participants.map((participant) => (
                        <tr key={participant.id}>
                          <td>
                            <Link className="pf-row-link" to={`/lecturer/companies?student=${participant.id}`}>
                              {participant.fullName}
                            </Link>
                            <div className="pf-muted" style={{ fontSize: 12 }}>
                              {participant.businessName ?? 'No company yet'}
                            </div>
                          </td>
                          <td>
                            <Badge tone={participant.active ? 'good' : 'warn'}>
                              {participant.active ? 'Online' : 'Away'}
                            </Badge>
                          </td>
                          <td className="pf-table__num">
                            {participant.tasksSubmitted}/{participant.tasksAssigned}
                          </td>
                          <td className="pf-table__num">
                            {participant.overdue > 0 ? <Badge tone="bad">{participant.overdue}</Badge> : '0'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <div className="pf-col-stack">
              <EventForm
                classId={live.data.class.id}
                disabled={!activeClassId}
                onDone={(message) => { reset(); setFlash(message); live.reload() }}
                onError={(message) => { reset(); setFailure(message) }}
              />

              <Card title="Events in play" meta={`${live.data.events.length} recent`}>
                {live.data.events.length === 0 ? (
                  <p className="pf-card__note">No economic events are currently in play for this class.</p>
                ) : (
                  <div className="pf-feed">
                    {live.data.events.map((event) => (
                      <div className="pf-feed__item" key={event.id}>
                        <span className="pf-feed__dot" />
                        <div className="pf-feed__body">
                          <div className="pf-feed__title">
                            {event.name} <Badge tone={event.status === 'ACTIVE' ? 'good' : 'warn'}>{event.status}</Badge>
                          </div>
                          <div className="pf-feed__meta">
                            {EVENT_KINDS.find((kind) => kind.value === event.kind)?.label ?? event.kind} · impact{' '}
                            {event.impact > 0 ? '+' : ''}
                            {event.impact}% · {event.scope === 'all' ? 'everyone' : 'this class'} ·{' '}
                            {event.endsAt ? `ends ${formatDateTime(event.endsAt)}` : 'no end set'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card title="Scenarios for this class" meta={`${live.data.scenarios.length}`}>
                {live.data.scenarios.length === 0 ? (
                  <p className="pf-card__note">
                    No scenarios saved for this class. <Link className="pf-row-link" to="/lecturer/scenarios">Build one</Link>.
                  </p>
                ) : (
                  <div className="pf-chips">
                    {live.data.scenarios.map((scenario) => (
                      <span className="pf-chip" key={scenario.id}>
                        {scenario.name} — {scenario.status}
                      </span>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          <p className="pf-card__note" style={{ marginTop: 12 }}>
            Snapshot taken {formatRelative(new Date().toISOString())}. Refresh to update.
          </p>
        </>
      )}
    </>
  )
}

/** Introducing an economic event, scoped to one class. */
export function EventForm({
  classId,
  disabled,
  onDone,
  onError,
}: {
  classId: string
  disabled?: boolean
  onDone: (message: string) => void
  onError: (message: string) => void
}) {
  const [kind, setKind] = useState(EVENT_KINDS[0].value)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [impact, setImpact] = useState(10)
  const [durationHours, setDurationHours] = useState(24)
  const [busy, setBusy] = useState(false)

  async function inject() {
    setBusy(true)
    try {
      const body: EconomicEventInput = {
        kind,
        name: name.trim(),
        description: description.trim(),
        impact,
        durationHours: Math.max(1, Math.round(durationHours)),
      }
      await api(`/lecturer/live/${classId}/events`, { method: 'POST', body })
      onDone(`"${body.name}" introduced to the class.`)
      setName('')
      setDescription('')
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'That event could not be introduced.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Introduce an economic event" meta="Scoped to this class">
      <div className="pf-form">
        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">Type</span>
            <select className="pf-select" value={kind} onChange={(event) => setKind(event.target.value)}>
              {EVENT_KINDS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Impact (%)</span>
            <input
              className="pf-input"
              type="number"
              min={-100}
              max={400}
              value={impact}
              onChange={(event) => setImpact(Number(event.target.value) || 0)}
            />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Lasts (hours)</span>
            <input
              className="pf-input"
              type="number"
              min={1}
              max={336}
              value={durationHours}
              onChange={(event) => setDurationHours(Number(event.target.value) || 1)}
            />
          </label>
        </div>
        <label className="pf-field">
          <span className="pf-field__label">Headline</span>
          <input
            className="pf-input pf-input--block"
            value={name}
            maxLength={90}
            placeholder="e.g. Fuel subsidy removed"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="pf-field">
          <span className="pf-field__label">Description</span>
          <textarea
            className="pf-textarea"
            rows={2}
            maxLength={500}
            value={description}
            placeholder="What the students are told is happening."
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy || disabled || name.trim().length < 2} onClick={inject}>
            {busy ? 'Introducing…' : 'Introduce event'}
          </button>
        </div>
      </div>
    </Card>
  )
}
