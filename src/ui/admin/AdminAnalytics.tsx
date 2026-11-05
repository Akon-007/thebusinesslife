import { useMemo } from 'react'
import { LEVEL_BY_ID } from '../../data/beginnerLevels'
import {
  BarList,
  Card,
  ColumnPlot,
  StateBlock,
  StatTile,
  formatNumber,
  formatPercent,
} from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * Analytics.
 *
 * A read-only view of how the platform is being used: who is signing in, which
 * sectors are busy, how far players get through the fifteen levels, and how the
 * classroom and event machinery is being exercised. Every figure is aggregated
 * by the server from stored rows.
 */

interface Analytics {
  engagement: {
    totalPlayers: number
    online: number
    activeThisWeek: number
    inTheCity: number
    signInsFailed: number
  }
  signInByDay: { day: string; count: number }[]
  sectors: {
    sector: string
    companies: number
    activePlayers: number
    averageLevel: number
    totalXp: number
  }[]
  funnel: { levelId: string; level: number; reached: number; completed: number; completionRate: number }[]
  topPlayers: { id: string; fullName: string; xp: number; levelIndex: number; businessName: string | null }[]
  classroom: {
    classes: number
    activeClasses: number
    students: number
    pendingRequests: number
    assignments: number
    scenarios: number
    assessments: number
  }
  events: { total: number; active: number; scheduled: number; ended: number }
}

function levelTitle(level: number): string {
  return LEVEL_BY_ID[`L${level}`]?.title ?? `Level ${level}`
}

export function AdminAnalytics() {
  const { data, loading, error, reload } = useApi<Analytics>('/admin/insights/analytics')

  const signInSeries = useMemo(
    () =>
      (data?.signInByDay ?? []).map((point) => ({
        label: point.day.slice(5),
        value: point.count,
      })),
    [data],
  )

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Analytics</h1>
          <p>
            How the platform is being used: engagement, sector activity, progression through the
            fifteen levels, and the classroom and event machinery. Every figure is read from the
            database.
          </p>
        </div>
        <button className="pf-btn pf-btn--ghost" type="button" onClick={reload}>
          Refresh
        </button>
      </div>

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : (
        <>
          <div className="pf-stats">
            <StatTile
              label="Total players"
              value={formatNumber(data.engagement.totalPlayers)}
              sub="Registered accounts"
            />
            <StatTile
              label="Online now"
              value={formatNumber(data.engagement.online)}
              sub="Active in the last 5 minutes"
              tone="good"
            />
            <StatTile
              label="Active this week"
              value={formatNumber(data.engagement.activeThisWeek)}
              sub="Seen in the last 7 days"
              tone="accent"
            />
            <StatTile
              label="In the city"
              value={formatNumber(data.engagement.inTheCity)}
              sub="Players with recorded progress"
            />
            <StatTile
              label="Failed sign-ins"
              value={formatNumber(data.engagement.signInsFailed)}
              sub="Last 30 days"
              tone={data.engagement.signInsFailed > 0 ? 'warn' : ''}
            />
          </div>

          <div className="pf-cols pf-cols--2">
            <Card title="Sign-ins" meta="Last 14 days">
              <ColumnPlot points={signInSeries} empty="No sign-ins in this window." />
            </Card>

            <Card title="Companies by sector" meta={`${formatNumber(data.sectors.length)} sectors`}>
              <BarList
                data={data.sectors.map((sector) => ({ label: sector.sector, value: sector.companies }))}
                empty="No businesses have been created yet."
              />
            </Card>
          </div>

          <Card title="Progression funnel" meta="15 levels">
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Level</th>
                    <th>Title</th>
                    <th className="pf-table__num">Reached</th>
                    <th className="pf-table__num">Completed</th>
                    <th className="pf-table__num">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.funnel.map((row) => (
                    <tr key={row.levelId}>
                      <td>{String(row.level).padStart(2, '0')}</td>
                      <td>{levelTitle(row.level)}</td>
                      <td className="pf-table__num">{formatNumber(row.reached)}</td>
                      <td className="pf-table__num">{formatNumber(row.completed)}</td>
                      <td className="pf-table__num">
                        {row.reached > 0 ? formatPercent(row.completionRate) : <span className="pf-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Leaderboard" meta={`Top ${formatNumber(data.topPlayers.length)} by XP`}>
            {data.topPlayers.length === 0 ? (
              <p className="pf-card__note">No player has started the city yet.</p>
            ) : (
              <div className="pf-table-wrap">
                <table className="pf-table">
                  <thead>
                    <tr>
                      <th className="pf-table__num">#</th>
                      <th>Player</th>
                      <th>Business</th>
                      <th className="pf-table__num">Level</th>
                      <th className="pf-table__num">XP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topPlayers.map((player, index) => (
                      <tr key={player.id}>
                        <td className="pf-table__num">{index + 1}</td>
                        <td>{player.fullName}</td>
                        <td>
                          {player.businessName ?? <span className="pf-muted">No company yet</span>}
                        </td>
                        <td className="pf-table__num">{player.levelIndex}</td>
                        <td className="pf-table__num">{formatNumber(player.xp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="pf-cols pf-cols--2">
            <Card title="Classroom usage" meta={`${formatNumber(data.classroom.classes)} classes`}>
              <dl className="pf-dl">
                <dt>Classes</dt>
                <dd>{formatNumber(data.classroom.classes)}</dd>
                <dt>Active classes</dt>
                <dd>{formatNumber(data.classroom.activeClasses)}</dd>
                <dt>Students</dt>
                <dd>{formatNumber(data.classroom.students)}</dd>
                <dt>Pending requests</dt>
                <dd>{formatNumber(data.classroom.pendingRequests)}</dd>
                <dt>Assignments</dt>
                <dd>{formatNumber(data.classroom.assignments)}</dd>
                <dt>Scenarios</dt>
                <dd>{formatNumber(data.classroom.scenarios)}</dd>
                <dt>Assessments</dt>
                <dd>{formatNumber(data.classroom.assessments)}</dd>
              </dl>
            </Card>

            <Card title="Events" meta={`${formatNumber(data.events.total)} total`}>
              <dl className="pf-dl">
                <dt>Total</dt>
                <dd>{formatNumber(data.events.total)}</dd>
                <dt>Active</dt>
                <dd>{formatNumber(data.events.active)}</dd>
                <dt>Scheduled</dt>
                <dd>{formatNumber(data.events.scheduled)}</dd>
                <dt>Ended</dt>
                <dd>{formatNumber(data.events.ended)}</dd>
              </dl>
            </Card>
          </div>
        </>
      )}
    </>
  )
}
