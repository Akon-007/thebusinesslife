import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Card, StateBlock, StatTile, formatMoney, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import type { ClassesPayload, StudentsPayload } from './api'

/**
 * Every student across the lecturer's classes, in one register.
 *
 * The list is filtered on the server, so the totals shown are the real ones.
 * Clicking a row opens that student's company monitor.
 */
export function LecturerStudents() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [term, setTerm] = useState('')
  const [query, setQuery] = useState('')
  const [classId, setClassId] = useState(searchParams.get('classId') ?? '')
  const [status, setStatus] = useState('ACTIVE')

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(term.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [term])

  const classes = useApi<ClassesPayload>('/lecturer/classes')
  const path = `/lecturer/students?classId=${encodeURIComponent(classId)}&status=${status}&q=${encodeURIComponent(query)}`
  const { data, loading, error, reload } = useApi<StudentsPayload>(path)

  const rows = data?.students ?? []
  const withBusiness = rows.filter((row) => row.hasBusiness).length
  const graded = rows.filter((row) => row.assessment != null).length
  const lastSeen = rows.reduce<string | null>((latest, row) => {
    if (!row.lastSeenAt) return latest
    if (!latest) return row.lastSeenAt
    return Date.parse(row.lastSeenAt) > Date.parse(latest) ? row.lastSeenAt : latest
  }, null)

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Students</h1>
          <p>
            Every student enrolled in your classes, with their company, progression and current
            assessment. Click a student to monitor their business.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Students shown" value={data ? formatNumber(data.total) : '—'} sub="Matching these filters" />
        <StatTile label="With a company" value={data ? formatNumber(withBusiness) : '—'} sub="Business created" tone="accent" />
        <StatTile label="Assessed" value={data ? formatNumber(graded) : '—'} sub="With at least one mark" />
      </div>

      <div className="pf-toolbar">
        <input
          className="pf-input pf-input--grow"
          type="search"
          placeholder="Search by name, email or business"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <select className="pf-select" value={classId} onChange={(event) => setClassId(event.target.value)}>
          <option value="">All my classes</option>
          {(classes.data?.classes ?? []).map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>
        <select className="pf-select" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ACTIVE">Active students</option>
          <option value="PENDING">Awaiting approval</option>
          <option value="ALL">All memberships</option>
        </select>
        <button className="pf-btn pf-btn--ghost" type="button" onClick={reload}>
          Refresh
        </button>
      </div>

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <StateBlock loading={false} error={null} empty="No students match these filters." />
      ) : (
        <Card title={`${formatNumber(data.total)} student${data.total === 1 ? '' : 's'}`}>
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Business</th>
                  <th className="pf-table__num">Level</th>
                  <th className="pf-table__num">XP</th>
                  <th className="pf-table__num">Cash</th>
                  <th>Mark</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => (
                  <tr key={`${student.classId}:${student.id}`}>
                    <td>
                      <button
                        className="pf-row-link"
                        type="button"
                        onClick={() => navigate(`/lecturer/companies?student=${student.id}`)}
                      >
                        {student.fullName}
                      </button>
                      <div className="pf-muted" style={{ fontSize: 12 }}>{student.email}</div>
                    </td>
                    <td>{student.className}</td>
                    <td>
                      {student.businessName ? (
                        <>
                          {student.businessName}
                          <div className="pf-muted" style={{ fontSize: 12 }}>{student.sector}</div>
                        </>
                      ) : (
                        <span className="pf-muted">No company yet</span>
                      )}
                    </td>
                    <td className="pf-table__num">{student.levelIndex ?? '—'}</td>
                    <td className="pf-table__num">{formatNumber(student.xp)}</td>
                    <td className="pf-table__num">{formatMoney(student.cash)}</td>
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
                      <button
                        className="pf-btn pf-btn--ghost pf-btn--sm"
                        type="button"
                        onClick={() => navigate(`/lecturer/companies?student=${student.id}`)}
                      >
                        Monitor
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pf-card__note" style={{ marginTop: 10 }}>
            Most recent activity across these students:{' '}
            {lastSeen ? formatRelative(lastSeen) : 'never'}.
          </p>
        </Card>
      )}
    </>
  )
}
