import { useState } from 'react'
import { ApiError } from '../../api/client'
import { tickAdminClock, updateAdminClock, type AdminClock as Clock } from '../../api/clock'
import { Card, StateBlock, StatTile, formatMoney, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import { formatSimTime } from '../../state/clockStore'

/**
 * The world clock.
 *
 * A player's world runs on simulated time that advances on its own. This screen
 * is the administrator's hand on that clock: it shows the current instant, how
 * fast the world is running, and lets the simulation be paused, retimed or
 * stepped forward by hand — which is also how a paused world is advanced.
 *
 * Every settled day is listed with what it charged, because settling a day is
 * when the economy actually happens: each open business pays its operating cost.
 */

interface DayRun {
  day: number
  simTime: string
  companies: number
  chargedKobo: number
  settledAt: string
}

export function AdminClock() {
  const resource = useApi<{ clock: Clock; days: DayRun[] }>('/admin/simulation/clock')
  const [flash, setFlash] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tickMinutes, setTickMinutes] = useState('')

  const clock = resource.data?.clock ?? null
  const days = resource.data?.days ?? []

  async function run<T>(work: () => Promise<T>, message: (result: T) => string) {
    setBusy(true)
    setFlash(null)
    setFailure(null)
    try {
      const result = await work()
      setFlash(message(result))
      resource.reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const draft = tickMinutes === '' ? String(clock?.tickMinutes ?? 60) : tickMinutes

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>World Clock</h1>
          <p>
            The simulation runs on its own time, faster than the real clock. Each tick moves the
            world forward by the configured number of minutes; when a tick carries the world across
            a day boundary, every open business is settled for that day.
          </p>
        </div>
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}
      {failure && (
        <div className="pf-notice pf-notice--bad" style={{ marginBottom: 16 }}>
          {failure}
        </div>
      )}

      {resource.loading || resource.error ? (
        <StateBlock loading={resource.loading} error={resource.error} onRetry={resource.reload} />
      ) : !clock ? (
        <StateBlock loading={false} error={null} empty="The simulation clock is unavailable." />
      ) : (
        <>
          <div className="pf-stats">
            <StatTile label="Simulated day" value={formatNumber(clock.day)} sub={`${clock.ticks} ticks elapsed`} />
            <StatTile
              label="World time"
              value={formatSimTime(clock.minuteOfDay)}
              sub={clock.running ? 'Advancing' : 'Paused'}
              tone={clock.running ? 'good' : 'warn'}
            />
            <StatTile
              label="Tick length"
              value={`${clock.tickMinutes} min`}
              sub={`${clock.simMinutesPerRealMinute} sim min per real min`}
              tone="accent"
            />
            <StatTile
              label="Last tick"
              value={clock.lastTickAt ? formatRelative(clock.lastTickAt) : '—'}
              sub={clock.running ? `Every ${Math.round(clock.tickIntervalMs / 1000)}s` : 'Clock stopped'}
            />
          </div>

          <Card title="Controls">
            <div className="pf-form">
              <div className="pf-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                <button
                  className="pf-btn"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => updateAdminClock({ running: !clock.running }),
                      (result) => (result.clock.running ? 'The world is running.' : 'The world is paused.'),
                    )
                  }
                >
                  {clock.running ? 'Pause the world' : 'Resume the world'}
                </button>

                <label className="pf-field" style={{ maxWidth: 220 }}>
                  <span className="pf-field__label">Tick length (minutes)</span>
                  <input
                    className="pf-input"
                    type="number"
                    min={clock.tickMinutesRange.min}
                    max={clock.tickMinutesRange.max}
                    value={draft}
                    onChange={(event) => setTickMinutes(event.target.value)}
                  />
                  <span className="pf-field__hint">
                    Between {clock.tickMinutesRange.min} and {clock.tickMinutesRange.max}.
                  </span>
                </label>

                <button
                  className="pf-btn pf-btn--ghost"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => updateAdminClock({ tickMinutes: Number(draft) }),
                      (result) => `Each tick now advances ${result.clock.tickMinutes} simulated minutes.`,
                    )
                  }
                >
                  Save tick length
                </button>
              </div>

              <div>
                <span className="pf-field__label">Step forward by hand</span>
                <p className="pf-field__hint" style={{ marginBottom: 8 }}>
                  Steps apply whether or not the world is running. A step that crosses midnight
                  settles the day it closes.
                </p>
                <div className="pf-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {[1, 6, 24].map((count) => (
                    <button
                      key={count}
                      className="pf-btn pf-btn--ghost"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => tickAdminClock(count),
                          (result) => {
                            const settled = result.result.settledDays.filter((d) => !d.alreadySettled)
                            const charged = settled.reduce((sum, d) => sum + d.chargedKobo, 0)
                            const base = `Advanced ${result.result.applied} tick(s) to day ${result.result.day}.`
                            return settled.length === 0
                              ? base
                              : `${base} Settled ${settled.length} day(s), charging ${formatMoney(charged / 100)}.`
                          },
                        )
                      }
                    >
                      +{count} tick{count === 1 ? '' : 's'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card
            title="Recent settlements"
            meta={<span>Newest first · {clock.running ? 'world running' : 'world paused'}</span>}
          >
            {days.length === 0 ? (
              <p className="pf-card__note">
                No day has closed yet. A day is settled the first time the world crosses midnight.
              </p>
            ) : (
              <div className="pf-table-wrap">
                <table className="pf-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Simulated</th>
                      <th>Businesses</th>
                      <th>Operating cost</th>
                      <th>Settled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day) => (
                      <tr key={day.day}>
                        <td>{formatNumber(day.day)}</td>
                        <td>{new Date(day.simTime).toLocaleDateString()}</td>
                        <td>{formatNumber(day.companies)}</td>
                        <td className="pf-table__num">{formatMoney(day.chargedKobo / 100)}</td>
                        <td>{formatRelative(day.settledAt)}</td>
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
