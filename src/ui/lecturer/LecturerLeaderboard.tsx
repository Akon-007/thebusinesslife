import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, StateBlock, StatTile, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import type { PerformancePayload, StudentSummary } from './api'

/**
 * The leaderboard.
 *
 * Ranked by the quality of the student's work first — the assessment average the
 * server computes from the dimensions marked — and by XP only as a tie-break
 * among students on the same mark. Students who have not been assessed are shown
 * below the ranked list rather than given a rank they have not earned.
 */
export function LecturerLeaderboard() {
  const [classId, setClassId] = useState('')
  const { data, loading, error, reload } = useApi<PerformancePayload>(
    `/lecturer/performance?classId=${encodeURIComponent(classId)}`,
  )

  if (loading || error || !data) {
    return (
      <>
        <div className="pf-page-head">
          <div>
            <h1>Leaderboard</h1>
            <p>Students ranked by the quality of their decisions.</p>
          </div>
        </div>
        <StateBlock loading={loading} error={error} onRetry={reload} />
      </>
    )
  }

  const graded = data.students.filter((student) => student.assessment?.overall != null)
  const ungraded = data.students.filter((student) => student.assessment?.overall == null)

  const ranked = [...graded].sort((a, b) => {
    const diff = (b.assessment?.overall ?? 0) - (a.assessment?.overall ?? 0)
    if (diff !== 0) return diff
    return b.xp - a.xp
  })

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Leaderboard</h1>
          <p>
            Students ranked by the quality of their decisions — the average of the assessment
            dimensions you have marked — with XP as the tie-break. This is not a ranking by cash or
            company value.
          </p>
        </div>
        <div className="pf-actions">
          <select className="pf-select" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">All my classes</option>
            {data.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
          <button className="pf-btn pf-btn--ghost" type="button" onClick={reload}>
            Refresh
          </button>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Ranked" value={formatNumber(ranked.length)} sub="Students with a mark" tone="accent" />
        <StatTile label="Not yet assessed" value={formatNumber(ungraded.length)} sub="No mark to rank by" />
        <StatTile
          label="Top mark"
          value={ranked.length > 0 ? `${Math.round(ranked[0].assessment?.overall ?? 0)}%` : '—'}
          sub={ranked[0]?.fullName ?? 'No marks yet'}
          tone="good"
        />
      </div>

      <Card title="Ranking" meta={classId ? 'This class' : 'All classes'}>
        {ranked.length === 0 ? (
          <p className="pf-card__note">
            No student has been assessed yet. <Link className="pf-row-link" to="/lecturer/grading">Grade some work</Link> to
            build the leaderboard.
          </p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th className="pf-table__num">#</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Company</th>
                  <th className="pf-table__num">Mark</th>
                  <th>Grade</th>
                  <th className="pf-table__num">Level</th>
                  <th className="pf-table__num">XP</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((student, index) => (
                  <tr key={`${student.classId}:${student.id}`}>
                    <td className="pf-table__num">{index + 1}</td>
                    <td>
                      <Link className="pf-row-link" to={`/lecturer/companies?student=${student.id}`}>
                        {student.fullName}
                      </Link>
                    </td>
                    <td>{student.className}</td>
                    <td>{student.businessName ?? <span className="pf-muted">No company yet</span>}</td>
                    <td className="pf-table__num">{Math.round(student.assessment?.overall ?? 0)}%</td>
                    <td>
                      <Badge tone="good">{student.assessment?.grade}</Badge>
                    </td>
                    <td className="pf-table__num">{student.levelIndex ?? '—'}</td>
                    <td className="pf-table__num">{formatNumber(student.xp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {ungraded.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card title="Not yet assessed" meta={`${ungraded.length} student${ungraded.length === 1 ? '' : 's'}`}>
            <UngradedTable students={ungraded} />
          </Card>
        </div>
      )}
    </>
  )
}

function UngradedTable({ students }: { students: StudentSummary[] }) {
  return (
    <div className="pf-table-wrap">
      <table className="pf-table">
        <thead>
          <tr>
            <th>Student</th>
            <th>Class</th>
            <th>Company</th>
            <th className="pf-table__num">Level</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={`${student.classId}:${student.id}`}>
              <td>{student.fullName}</td>
              <td>{student.className}</td>
              <td>{student.businessName ?? <span className="pf-muted">No company yet</span>}</td>
              <td className="pf-table__num">{student.levelIndex ?? '—'}</td>
              <td>
                <Link className="pf-btn pf-btn--ghost pf-btn--sm" to="/lecturer/grading">
                  Grade
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
