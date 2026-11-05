import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * Events management.
 *
 * Controlled shocks an administrator injects into the running city — a fuel
 * price rise, a supplier disruption, a festive demand surge — aimed at everyone
 * or narrowed to a sector, district, class or single student. An event is
 * scheduled, activated (which opens a window of the chosen length) and then
 * ended or cancelled.
 */

interface Option {
  value: string
  label: string
}

type EventScope = 'all' | 'sector' | 'district' | 'class' | 'student'
type EventStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED'

interface SimEvent {
  id: string
  name: string
  kind: string
  kindLabel: string
  description: string
  scope: EventScope
  targets: string[]
  impact: number
  durationHours: number
  startsAt: string | null
  endsAt: string | null
  status: EventStatus
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

interface EventsPayload {
  events: SimEvent[]
  total: number
  active: number
  scheduled: number
}

interface SimMeta {
  eventKinds: Option[]
  eventScopes: Option[]
  eventStatuses: string[]
}

function statusTone(status: EventStatus): '' | 'good' | 'warn' | 'bad' {
  if (status === 'ACTIVE') return 'good'
  if (status === 'SCHEDULED') return 'warn'
  if (status === 'CANCELLED') return 'bad'
  return ''
}

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

function windowLabel(event: SimEvent): string {
  if (!event.startsAt) return 'Not started'
  const from = new Date(event.startsAt)
  if (!Number.isFinite(from.getTime())) return 'Not started'
  if (!event.endsAt) return `from ${from.toLocaleDateString()}`
  const to = new Date(event.endsAt)
  if (!Number.isFinite(to.getTime())) return `from ${from.toLocaleDateString()}`
  return `${from.toLocaleDateString()} → ${to.toLocaleDateString()}`
}

function impactLabel(impact: number): string {
  return `${impact > 0 ? '+' : ''}${impact}%`
}

export function AdminEvents() {
  const [status, setStatus] = useState('ALL')
  const events = useApi<EventsPayload>(`/admin/simulation/events?status=${status}`)
  const meta = useApi<SimMeta>('/admin/simulation/meta')
  const [selected, setSelected] = useState<SimEvent | null>(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const payload = events.data
  const vocabulary = meta.data
  const loading = events.loading || meta.loading
  const error = events.error ?? meta.error

  function reload() {
    events.reload()
    meta.reload()
  }

  const rows = payload?.events ?? []

  function startCreate() {
    setSelected(null)
    setCreating(true)
    setFailure(null)
  }

  function startEdit(event: SimEvent) {
    setSelected(event)
    setCreating(false)
    setFailure(null)
  }

  function closeForm() {
    setSelected(null)
    setCreating(false)
  }

  async function act(event: SimEvent, action: 'activate' | 'end' | 'cancel') {
    setBusyId(event.id)
    setFailure(null)
    try {
      await api(`/admin/simulation/events/${event.id}/${action}`, { method: 'POST' })
      const verb = action === 'activate' ? 'activated' : action === 'end' ? 'ended' : 'cancelled'
      setFlash(`The event "${event.name}" was ${verb}.`)
      if (selected?.id === event.id) closeForm()
      reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That event could not be updated.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(event: SimEvent) {
    setBusyId(event.id)
    setFailure(null)
    try {
      await api(`/admin/simulation/events/${event.id}`, { method: 'DELETE' })
      setFlash(`The event "${event.name}" was deleted.`)
      if (selected?.id === event.id) closeForm()
      reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That event could not be deleted.')
    } finally {
      setBusyId(null)
    }
  }

  function scopeLabel(value: string): string {
    return vocabulary?.eventScopes.find((option) => option.value === value)?.label ?? value
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Events Management</h1>
          <p>
            Controlled shocks injected into the city — aimed at every player or narrowed to a
            sector, district, class or single student. Activating an event opens a window of the
            length you choose; its effect is bounded, not permanent.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Events" value={payload ? formatNumber(payload.total) : '—'} sub="In the register" />
        <StatTile
          label="Active"
          value={payload ? formatNumber(payload.active) : '—'}
          sub="Currently affecting players"
          tone="good"
        />
        <StatTile
          label="Scheduled"
          value={payload ? formatNumber(payload.scheduled) : '—'}
          sub="Waiting to be activated"
          tone="accent"
        />
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}

      {loading || error ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : !payload || !vocabulary ? (
        <StateBlock loading={false} error={null} empty="The events register is unavailable." />
      ) : (
        <>
          <div className="pf-toolbar">
            <select
              className="pf-select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              {vocabulary.eventStatuses.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
            <button className="pf-btn" type="button" onClick={startCreate}>
              New event
            </button>
          </div>

          {failure && !creating && !selected && <div className="pf-notice pf-notice--bad">{failure}</div>}

          {(creating || selected) && (
            <EventForm
              key={selected ? selected.id : 'new'}
              event={selected}
              kinds={vocabulary.eventKinds}
              scopes={vocabulary.eventScopes}
              onSaved={(message) => {
                setFlash(message)
                closeForm()
                reload()
              }}
              onCancel={closeForm}
            />
          )}

          <Card title="Events" meta={`${formatNumber(rows.length)} shown`}>
            {rows.length === 0 ? (
              <p className="pf-card__note">No events match this filter.</p>
            ) : (
              <div className="pf-table-wrap">
                <table className="pf-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Kind</th>
                      <th>Scope</th>
                      <th className="pf-table__num">Impact</th>
                      <th className="pf-table__num">Duration</th>
                      <th>Status</th>
                      <th>Window</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((event) => (
                      <tr key={event.id}>
                        <td>
                          {event.name}
                          <div className="pf-muted" style={{ fontSize: 12 }}>
                            changed {formatRelative(event.updatedAt)}
                          </div>
                        </td>
                        <td>{event.kindLabel}</td>
                        <td>
                          {scopeLabel(event.scope)}
                          {event.scope !== 'all' && event.targets.length > 0 && (
                            <div className="pf-muted" style={{ fontSize: 12 }}>
                              {event.targets.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="pf-table__num">{impactLabel(event.impact)}</td>
                        <td className="pf-table__num">{event.durationHours}h</td>
                        <td>
                          <Badge tone={statusTone(event.status)}>{statusLabel(event.status)}</Badge>
                        </td>
                        <td>{windowLabel(event)}</td>
                        <td>
                          <div className="pf-actions">
                            {event.status === 'SCHEDULED' && (
                              <button
                                className="pf-btn pf-btn--good pf-btn--sm"
                                type="button"
                                disabled={busyId === event.id}
                                onClick={() => act(event, 'activate')}
                              >
                                Activate
                              </button>
                            )}
                            {(event.status === 'SCHEDULED' || event.status === 'ACTIVE') && (
                              <button
                                className="pf-btn pf-btn--ghost pf-btn--sm"
                                type="button"
                                onClick={() => startEdit(event)}
                              >
                                Edit
                              </button>
                            )}
                            {event.status === 'ACTIVE' && (
                              <button
                                className="pf-btn pf-btn--ghost pf-btn--sm"
                                type="button"
                                disabled={busyId === event.id}
                                onClick={() => act(event, 'end')}
                              >
                                End
                              </button>
                            )}
                            {event.status === 'SCHEDULED' && (
                              <button
                                className="pf-btn pf-btn--ghost pf-btn--sm"
                                type="button"
                                disabled={busyId === event.id}
                                onClick={() => act(event, 'cancel')}
                              >
                                Cancel
                              </button>
                            )}
                            <button
                              className="pf-btn pf-btn--danger pf-btn--sm"
                              type="button"
                              disabled={busyId === event.id}
                              onClick={() => remove(event)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  )
}

function EventForm({
  event,
  kinds,
  scopes,
  onSaved,
  onCancel,
}: {
  event: SimEvent | null
  kinds: Option[]
  scopes: Option[]
  onSaved: (message: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(event?.name ?? '')
  const [kind, setKind] = useState(event?.kind ?? kinds[0]?.value ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [scope, setScope] = useState<EventScope>(event?.scope ?? 'all')
  const [targetsText, setTargetsText] = useState(event ? event.targets.join(', ') : '')
  const [impact, setImpact] = useState(String(event?.impact ?? 0))
  const [durationHours, setDurationHours] = useState(String(event?.durationHours ?? 24))
  const [startsAt, setStartsAt] = useState(event?.startsAt ? event.startsAt.slice(0, 16) : '')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const parsedTargets = targetsText
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  async function save() {
    setBusy(true)
    setFailure(null)
    const body = {
      name: name.trim(),
      kind,
      description: description.trim(),
      scope,
      targets: scope === 'all' ? [] : parsedTargets,
      impact: Number(impact),
      durationHours: Number(durationHours),
      startsAt: startsAt.trim() ? startsAt.trim() : null,
    }
    try {
      if (event) {
        await api(`/admin/simulation/events/${event.id}`, { method: 'PUT', body })
        onSaved(`The event "${body.name}" was updated.`)
      } else {
        await api('/admin/simulation/events', { method: 'POST', body })
        onSaved(`The event "${body.name}" was scheduled.`)
      }
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That event could not be saved.')
      setBusy(false)
    }
  }

  return (
    <Card title={event ? `Edit "${event.name}"` : 'New event'} meta={event ? <Badge tone={statusTone(event.status)}>{statusLabel(event.status)}</Badge> : 'Schedule'}>
      <div className="pf-form">
        {failure && <div className="pf-notice pf-notice--bad">{failure}</div>}

        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">Name</span>
            <input
              className="pf-input"
              type="text"
              maxLength={90}
              value={name}
              placeholder="Fuel subsidy withdrawal"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Kind</span>
            <select className="pf-select" value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="pf-field">
          <span className="pf-field__label">Description</span>
          <textarea
            className="pf-textarea"
            rows={2}
            maxLength={600}
            value={description}
            placeholder="What players will see when the event takes hold."
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">Scope</span>
            <select
              className="pf-select"
              value={scope}
              onChange={(e) => setScope(e.target.value as EventScope)}
            >
              {scopes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Impact</span>
            <input
              className="pf-input"
              type="number"
              min={-100}
              max={400}
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
            />
            <span className="pf-field__hint">
              The percentage effect on the affected businesses. Between −100 and 400.
            </span>
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Duration (hours)</span>
            <input
              className="pf-input"
              type="number"
              min={1}
              max={720}
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
            />
            <span className="pf-field__hint">How long the effect lasts once activated. 1 to 720.</span>
          </label>
        </div>

        {scope === 'all' ? (
          <p className="pf-card__note">
            This event applies to every player, so no targets are needed.
          </p>
        ) : (
          <label className="pf-field">
            <span className="pf-field__label">Targets</span>
            <input
              className="pf-input pf-input--block"
              type="text"
              value={targetsText}
              placeholder="Separate targets with commas"
              onChange={(e) => setTargetsText(e.target.value)}
            />
            <span className="pf-field__hint">
              The values depend on the scope: sector names, district names, class ids or student
              ids. At least one target is required.
            </span>
            {parsedTargets.length > 0 && (
              <div className="pf-chips" style={{ marginTop: 6 }}>
                {parsedTargets.map((target) => (
                  <span className="pf-chip" key={target}>
                    {target}
                  </span>
                ))}
              </div>
            )}
          </label>
        )}

        <label className="pf-field">
          <span className="pf-field__label">Starts at (optional)</span>
          <input
            className="pf-input"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <span className="pf-field__hint">
            Leave empty to activate the event manually. If set, activation dispenses a window from
            that moment.
          </span>
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : event ? 'Save changes' : 'Schedule event'}
          </button>
          <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Card>
  )
}
