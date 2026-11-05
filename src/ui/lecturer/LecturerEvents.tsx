import { useState } from 'react'
import { Badge, Card, StateBlock, StatTile, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import { EVENT_KINDS, formatDateTime, type ClassesPayload, type LivePayload } from './api'
import { EventForm } from './LecturerLive'

/**
 * Economic events.
 *
 * A lecturer's control over the economy is bounded to their own classroom: they
 * introduce an event that applies to one class and expires on its own. This page
 * is the same mechanism the live classroom uses, presented as a history so a
 * lecturer can see what has been set and when it will end.
 */
export function LecturerEvents() {
  const [classId, setClassId] = useState('')
  const classes = useApi<ClassesPayload>('/lecturer/classes')
  const live = useApi<LivePayload>(`/lecturer/live?classId=${encodeURIComponent(classId)}`)
  const [flash, setFlash] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const classList = classes.data?.classes ?? []
  const activeClassId = live.data?.class?.id ?? classId
  const events = live.data?.events ?? []
  const active = events.filter((event) => event.status === 'ACTIVE')

  function reset() {
    setFlash(null)
    setFailure(null)
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Economic Events</h1>
          <p>
            Introduce a change in conditions for a class — a fuel-price change, a supply disruption,
            a regulatory shift — and see the events already affecting it.
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
        <StateBlock loading={false} error={null} empty="You have no classes yet. Create a class before introducing events." />
      ) : (
        <>
          <div className="pf-stats">
            <StatTile label="Events on record" value={formatNumber(events.length)} sub="Most recent 30" />
            <StatTile
              label="Active now"
              value={formatNumber(active.length)}
              sub={active.length > 0 ? 'Affecting the class' : 'None in play'}
              tone={active.length > 0 ? 'accent' : ''}
            />
          </div>

          <div className="pf-cols pf-cols--2">
            <EventForm
              classId={live.data.class.id}
              disabled={!activeClassId}
              onDone={(message) => { reset(); setFlash(message); live.reload() }}
              onError={(message) => { reset(); setFailure(message) }}
            />

            <Card title="Event history" meta={`${events.length} recorded`}>
              {events.length === 0 ? (
                <p className="pf-card__note">No events have been introduced for this class yet.</p>
              ) : (
                <div className="pf-table-wrap">
                  <table className="pf-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Impact</th>
                        <th>Window</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id}>
                          <td>
                            {event.name}
                            <div className="pf-muted" style={{ fontSize: 12 }}>
                              {EVENT_KINDS.find((kind) => kind.value === event.kind)?.label ?? event.kind}
                            </div>
                          </td>
                          <td>
                            {event.impact > 0 ? '+' : ''}
                            {event.impact}%
                          </td>
                          <td className="pf-muted" style={{ fontSize: 12 }}>
                            {event.startsAt ? formatDateTime(event.startsAt) : '—'} →{' '}
                            {event.endsAt ? formatDateTime(event.endsAt) : 'open'}
                          </td>
                          <td>
                            <Badge tone={event.status === 'ACTIVE' ? 'good' : 'warn'}>{event.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <p className="pf-card__note" style={{ marginTop: 12 }}>
            Events are scoped to this class and end automatically when their window closes. Platform-wide
            events are set by the administrator and cannot be changed from here.
          </p>
        </>
      )}
    </>
  )
}
