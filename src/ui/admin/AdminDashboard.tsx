import { BEGINNER_LEVELS, LEVEL_BY_ID } from '../../data/beginnerLevels'
import { STAGES } from '../../data/stages'
import {
  Badge,
  BarList,
  Card,
  ColumnPlot,
  formatNumber,
  formatPercent,
  formatRelative,
  feedTone,
  humaniseAction,
  StateBlock,
  StatTile,
} from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * The administrator dashboard.
 *
 * Every figure below is computed by the server from stored rows — no number on
 * this page is written into the client. Level and stage *names* come from the
 * player application's progression catalogue, which is the single source of
 * truth for the frozen 5-stage / 15-level contract.
 */

interface LevelStat {
  levelId: string
  index: number
  completed: number
  reached: number
  completionRate: number
  dropoff: number
}

interface Overview {
  players: {
    total: number
    verified: number
    unverified: number
    online: number
    suspended: number
    newThisWeek: number
    staff: number
  }
  companies: { total: number; bySector: { sector: string; count: number }[] }
  progression: {
    started: number
    overallCompletionRate: number
    averageLevel: number
    stages: { stageIndex: number; entered: number; completed: number; completionRate: number }[]
    levels: LevelStat[]
    hardestLevels: LevelStat[]
    levelsPerStage: number
    maxLevel: number
  }
  activity: {
    id: string
    action: string
    detail: string
    at: string
    actor: string | null
    role: string | null
  }[]
  registrations: { day: string; count: number }[]
  alerts: { level: 'info' | 'warning' | 'critical'; title: string; detail: string }[]
}

function levelTitle(index: number): string {
  return LEVEL_BY_ID[`L${index}`]?.title ?? `Level ${index}`
}

/** A continuous window of days, so gaps in the data read as zero rather than vanishing. */
function recentDays(days: number): string[] {
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

export function AdminDashboard() {
  const { data, loading, error, reload } = useApi<Overview>('/admin/overview')

  if (loading || error || !data) {
    return (
      <>
        <div className="pf-page-head">
          <div>
            <h1>Dashboard</h1>
            <p>Platform health, player progression and simulation activity.</p>
          </div>
        </div>
        <StateBlock loading={loading} error={error} onRetry={reload} />
      </>
    )
  }

  const { players, companies, progression, activity, registrations, alerts } = data

  const byDay = new Map(registrations.map((r) => [r.day, r.count]))
  const dailySeries = recentDays(14).map((day) => ({
    label: day.slice(8),
    value: byDay.get(day) ?? 0,
  }))

  const stageBars = STAGES.map((stage) => {
    const stat = progression.stages.find((s) => s.stageIndex === stage.index)
    const entered = stat?.entered ?? 0
    return {
      label: `${stage.index}. ${stage.name}`,
      value: entered,
      display: `${formatNumber(entered)} · ${formatPercent(stat?.completionRate ?? 0)}`,
    }
  })

  const levelRows = progression.levels.length > 0
    ? progression.levels
    : BEGINNER_LEVELS.map((l) => ({
        levelId: l.id,
        index: l.index,
        completed: 0,
        reached: 0,
        completionRate: 0,
        dropoff: 0,
      }))

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Dashboard</h1>
          <p>
            Platform health, player progression and simulation activity. Every figure is read from
            the database.
          </p>
        </div>
        <button className="fo-btn fo-btn--ghost" type="button" onClick={reload}>
          Refresh
        </button>
      </div>

      <div className="pf-stats">
        <StatTile label="Registered players" value={formatNumber(players.total)} sub={`${formatNumber(players.newThisWeek)} joined this week`} />
        <StatTile label="Online now" value={formatNumber(players.online)} sub="Active in the last 5 minutes" tone="good" />
        <StatTile label="Email verified" value={formatNumber(players.verified)} sub={`${formatNumber(players.unverified)} awaiting verification`} />
        <StatTile label="Companies created" value={formatNumber(companies.total)} sub="Proposed business profiles" tone="accent" />
        <StatTile label="In the city" value={formatNumber(progression.started)} sub="Players with recorded progress" />
        <StatTile label="Suspended" value={formatNumber(players.suspended)} sub={`${formatNumber(players.staff)} staff accounts`} tone={players.suspended > 0 ? 'warn' : ''} />
      </div>

      <div className="pf-cols pf-cols--2">
        <Card title="Companies by sector" meta={`${formatNumber(companies.total)} total`}>
          <BarList
            data={companies.bySector.map((s) => ({ label: s.sector, value: s.count }))}
            empty="No businesses have been created yet."
          />
        </Card>

        <Card title="New registrations" meta="Last 14 days">
          <ColumnPlot points={dailySeries} empty="No registrations in this window." />
        </Card>
      </div>

      <div className="pf-cols pf-cols--2">
        <Card title="Stage completion" meta={`Average level ${progression.averageLevel.toFixed(1)} of ${progression.maxLevel}`}>
          <BarList data={stageBars} empty="No progression recorded yet." />
          <p className="pf-card__note" style={{ marginTop: 12 }}>
            The bar shows how many players have entered each stage; the figure beside it is the
            share of those players who completed every level in the stage. Overall completion is{' '}
            <strong>{formatPercent(progression.overallCompletionRate)}</strong> of all available levels.
          </p>
        </Card>

        <Card title="Most difficult levels" meta="Largest drop-off">
          <BarList
            data={progression.hardestLevels.map((l) => ({
              label: `${l.index}. ${levelTitle(l.index)}`,
              value: l.dropoff,
              display: `${formatNumber(l.dropoff)} stuck`,
              tone: 'orange' as const,
            }))}
            empty="No player has reached a level yet."
          />
          <p className="pf-card__note" style={{ marginTop: 12 }}>
            Drop-off counts players who reached a level but have not completed it.
          </p>
        </Card>
      </div>

      <Card title="Level completion" meta={`${formatNumber(progression.levels.length)} levels with activity`}>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Title</th>
                <th className="pf-table__num">Reached</th>
                <th className="pf-table__num">Completed</th>
                <th className="pf-table__num">Completion</th>
                <th className="pf-table__num">Drop-off</th>
              </tr>
            </thead>
            <tbody>
              {levelRows.map((l) => (
                <tr key={l.levelId}>
                  <td>{String(l.index).padStart(2, '0')}</td>
                  <td>{levelTitle(l.index)}</td>
                  <td className="pf-table__num">{formatNumber(l.reached)}</td>
                  <td className="pf-table__num">{formatNumber(l.completed)}</td>
                  <td className="pf-table__num">
                    {l.reached > 0 ? (
                      <Badge tone={l.completionRate >= 0.6 ? 'good' : l.completionRate >= 0.3 ? 'warn' : 'bad'}>
                        {formatPercent(l.completionRate)}
                      </Badge>
                    ) : (
                      <span className="pf-muted">—</span>
                    )}
                  </td>
                  <td className="pf-table__num">{l.dropoff > 0 ? formatNumber(l.dropoff) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="pf-cols pf-cols--2">
        <Card title="Recent activity" meta={`${formatNumber(activity.length)} events`}>
          {activity.length === 0 ? (
            <p className="pf-card__note">Nothing has happened yet.</p>
          ) : (
            <div className="pf-feed">
              {activity.map((event) => (
                <div className="pf-feed__item" key={event.id}>
                  <span className={`pf-feed__dot ${feedTone(event.action)}`} />
                  <div className="pf-feed__body">
                    <div className="pf-feed__title">{humaniseAction(event.action)}</div>
                    <div className="pf-feed__meta">
                      {event.detail}
                      {event.actor ? ` — ${event.actor}` : ''} · {formatRelative(event.at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="System alerts" meta={`${alerts.length} open`}>
          <div className="pf-alerts">
            {alerts.map((alert) => (
              <div className={`pf-alert pf-alert--${alert.level}`} key={alert.title}>
                <span className="pf-alert__bar" />
                <div>
                  <div className="pf-alert__title">{alert.title}</div>
                  <div className="pf-alert__detail">{alert.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
