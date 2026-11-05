import { Link } from 'react-router-dom'
import { Badge, BarList, Card, StatTile, formatNumber, formatRelative, humaniseAction, StateBlock } from '../portal/common'
import { useApi } from '../portal/useApi'
import { formatDate, type Overview } from './api'

/**
 * The lecturer dashboard.
 *
 * Every figure is computed by the server from stored rows — nothing is counted
 * in the client. The page draws attention to the two things a lecturer acts on
 * first: students waiting to be let into a class, and students who have gone
 * quiet or fallen behind.
 */
export function LecturerDashboard() {
  const { data, loading, error, reload } = useApi<Overview>('/lecturer/overview')

  if (loading || error || !data) {
    return (
      <>
        <div className="pf-page-head">
          <div>
            <h1>Dashboard</h1>
            <p>Your classes, students and teaching at a glance.</p>
          </div>
        </div>
        <StateBlock loading={loading} error={error} onRetry={reload} />
      </>
    )
  }

  const { classes, students, assignments, averagePerformance, classProgression, needingAttention, recentActivity, upcomingDeadlines } =
    data

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Your classes, students and teaching at a glance.</p>
        </div>
        <div className="pf-actions">
          <Link className="pf-btn pf-btn--ghost" to="/lecturer/assignments/new">
            New assignment
          </Link>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile
          label="Active classes"
          value={formatNumber(classes.active)}
          sub={`${formatNumber(classes.total)} in total · ${formatNumber(classes.archived)} archived`}
        />
        <StatTile
          label="Students"
          value={formatNumber(students.total)}
          sub={`${formatNumber(students.active)} active this week`}
        />
        <StatTile
          label="Awaiting approval"
          value={formatNumber(students.pending)}
          sub={students.pending > 0 ? 'Students asked to join' : 'Nothing waiting'}
          tone={students.pending > 0 ? 'warn' : ''}
        />
        <StatTile
          label="Open assignments"
          value={formatNumber(assignments.open)}
          sub={`${formatNumber(assignments.completed)} of ${formatNumber(assignments.submissions)} submissions done`}
        />
        <StatTile
          label="Average mark"
          value={averagePerformance === null ? '—' : `${Math.round(averagePerformance)}%`}
          sub="Across graded dimensions"
          tone="accent"
        />
      </div>

      {students.pending > 0 && (
        <div className="pf-card" style={{ marginBottom: 16 }}>
          <div className="pf-inline-stats">
            <span>
              <strong>{formatNumber(students.pending)}</strong> student
              {students.pending === 1 ? '' : 's'} {students.pending === 1 ? 'is' : 'are'} waiting to join your classes.
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <Link className="pf-btn pf-btn--sm" to="/lecturer/classes">
                Review requests
              </Link>
            </span>
          </div>
        </div>
      )}

      <div className="pf-cols pf-cols--2">
        <Card title="Class progression" meta={`${classProgression.length} class${classProgression.length === 1 ? '' : 'es'}`}>
          <BarList
            empty="You have no classes yet. Create one to get started."
            data={classProgression.map((row) => ({
              label: row.name,
              value: row.averageLevel,
              display: `${row.students} student${row.students === 1 ? '' : 's'} · avg level ${row.averageLevel.toFixed(1)}`,
            }))}
          />
        </Card>

        <Card title="Needing attention" meta={needingAttention.length > 0 ? `${needingAttention.length} flagged` : 'All clear'}>
          {needingAttention.length === 0 ? (
            <p className="pf-card__note">No student is currently flagged. Everyone is active and up to date.</p>
          ) : (
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {needingAttention.map((student) => (
                    <tr key={student.id}>
                      <td>
                        <Link className="pf-row-link" to="/lecturer/companies">
                          {student.fullName}
                        </Link>
                      </td>
                      <td>{student.className}</td>
                      <td>
                        <div className="pf-chips">
                          {student.reasons.map((reason) => (
                            <Badge tone="warn" key={reason}>
                              {reason}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="pf-cols pf-cols--2" style={{ marginTop: 16 }}>
        <Card title="Upcoming deadlines">
          {upcomingDeadlines.length === 0 ? (
            <p className="pf-card__note">No open assignment has an upcoming deadline.</p>
          ) : (
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Assignment</th>
                    <th>Due</th>
                    <th className="pf-table__num">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingDeadlines.map((deadline) => (
                    <tr key={deadline.id}>
                      <td>
                        <Link className="pf-row-link" to={`/lecturer/assignments/${deadline.id}`}>
                          {deadline.title}
                        </Link>
                        <div className="pf-muted" style={{ fontSize: 12 }}>
                          {deadline.className}
                        </div>
                      </td>
                      <td>{formatDate(deadline.dueOn)}</td>
                      <td className="pf-table__num">
                        {deadline.submitted}/{deadline.students}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Recent student activity">
          {recentActivity.length === 0 ? (
            <p className="pf-card__note">No recent activity from your students.</p>
          ) : (
            <div className="pf-feed">
              {recentActivity.map((entry) => (
                <div className="pf-feed__item" key={entry.id}>
                  <span className="pf-feed__dot" />
                  <div className="pf-feed__body">
                    <div className="pf-feed__title">{humaniseAction(entry.action)}</div>
                    <div className="pf-feed__meta">
                      {entry.actor ? `${entry.actor} · ` : ''}
                      {entry.detail} · {formatRelative(entry.at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
