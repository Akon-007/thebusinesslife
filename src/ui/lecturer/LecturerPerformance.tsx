import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, BarList, Card, StateBlock, StatTile, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import type { PerformancePayload } from './api'

/**
 * Performance across the ten assessment dimensions.
 *
 * These dimensions describe the quality of a student's decisions — how they
 * planned, managed money, adapted to events — not how much XP or cash they
 * accumulated. The class averages below are the mean of the marks a lecturer
 * has actually entered.
 */
export function LecturerPerformance() {
  const [classId, setClassId] = useState('')
  const { data, loading, error, reload } = useApi<PerformancePayload>(
    `/lecturer/performance?classId=${encodeURIComponent(classId)}`,
  )

  if (loading || error || !data) {
    return (
      <>
        <div className="pf-page-head">
          <div>
            <h1>Performance</h1>
            <p>How your classes are doing across the ten assessment dimensions.</p>
          </div>
        </div>
        <StateBlock loading={loading} error={error} onRetry={reload} />
      </>
    )
  }

  const marked = data.dimensions.filter((dimension) => dimension.average !== null)
  const strongest = marked.length > 0 ? marked.reduce((best, d) => ((d.average ?? 0) > (best.average ?? 0) ? d : best)) : null
  const weakest = marked.length > 0 ? marked.reduce((worst, d) => ((d.average ?? 0) < (worst.average ?? 0) ? d : worst)) : null

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Performance</h1>
          <p>
            How your classes are doing across the ten assessment dimensions. Bars show the mean mark
            per dimension, out of 100.
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
        <StatTile label="Students" value={formatNumber(data.total)} sub={classId ? 'In this class' : 'Across your classes'} />
        <StatTile label="Assessed" value={formatNumber(data.graded)} sub="With at least one mark" tone="accent" />
        <StatTile
          label="Strongest dimension"
          value={strongest ? `${Math.round(strongest.average ?? 0)}%` : '—'}
          sub={strongest?.label ?? 'No marks yet'}
          tone="good"
        />
        <StatTile
          label="Weakest dimension"
          value={weakest ? `${Math.round(weakest.average ?? 0)}%` : '—'}
          sub={weakest?.label ?? 'No marks yet'}
          tone={weakest ? 'warn' : ''}
        />
      </div>

      <div className="pf-cols pf-cols--2">
        <Card title="Dimension averages" meta={classId ? 'This class' : 'All classes'}>
          <BarList
            empty="No marks have been entered yet. Grade students to see dimension averages."
            data={data.dimensions.map((dimension) => ({
              label: dimension.label,
              value: dimension.average ?? 0,
              display: dimension.average === null ? `no marks (${dimension.marked})` : `${Math.round(dimension.average)}%`,
              tone: dimension.key === strongest?.key ? 'green' : dimension.key === weakest?.key ? 'orange' : '',
            }))}
          />
        </Card>

        <Card title="Dimension detail" meta="Ranked strongest to weakest">
          {marked.length === 0 ? (
            <p className="pf-card__note">No dimension has been marked yet.</p>
          ) : (
            <div className="pf-table-wrap">
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th className="pf-table__num">Average</th>
                    <th className="pf-table__num">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {[...marked]
                    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0))
                    .map((dimension) => (
                      <tr key={dimension.key}>
                        <td>
                          {dimension.label}{' '}
                          {dimension.key === strongest?.key && <Badge tone="good">strongest</Badge>}
                          {dimension.key === weakest?.key && <Badge tone="warn">weakest</Badge>}
                        </td>
                        <td className="pf-table__num">{Math.round(dimension.average ?? 0)}%</td>
                        <td className="pf-table__num">{formatNumber(dimension.marked)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div style={{ height: 16 }} />

      <Card title="Students" meta={`${data.students.length} shown`}>
        {data.students.length === 0 ? (
          <p className="pf-card__note">No active students in this scope.</p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Company</th>
                  <th className="pf-table__num">Level</th>
                  <th>Assessment</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.students.map((student) => (
                  <tr key={`${student.classId}:${student.id}`}>
                    <td>{student.fullName}</td>
                    <td>{student.className}</td>
                    <td>{student.businessName ?? <span className="pf-muted">No company yet</span>}</td>
                    <td className="pf-table__num">{student.levelIndex ?? '—'}</td>
                    <td>
                      {student.assessment?.overall != null ? (
                        <Badge tone="good">
                          {Math.round(student.assessment.overall)}% · {student.assessment.grade}
                        </Badge>
                      ) : (
                        <span className="pf-muted">Not assessed</span>
                      )}
                    </td>
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
        )}
      </Card>
    </>
  )
}
