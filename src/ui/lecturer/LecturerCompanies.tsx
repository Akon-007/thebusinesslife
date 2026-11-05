import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Card, StateBlock, StatTile, formatMoney, formatNumber, formatRelative, humaniseAction } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  formatDate,
  statusTone,
  type StudentDetailPayload,
  type StudentSummary,
  type StudentsPayload,
} from './api'

/**
 * Student company monitoring.
 *
 * Choose a student to read their company exactly as the server holds it: the
 * profile they wrote, where their business has got to, and what the platform
 * has recorded them doing. No figure here is invented in the client.
 */
export function LecturerCompanies() {
  const [searchParams] = useSearchParams()
  const [selected, setSelected] = useState(searchParams.get('student') ?? '')

  const list = useApi<StudentsPayload>('/lecturer/students?status=ALL')
  const students = list.data?.students ?? []
  // A student can be enrolled in more than one class; show each once.
  const unique = dedupeStudents(students)
  const activeId = selected || unique[0]?.id || ''

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Student Companies</h1>
          <p>
            Inspect any student's company: what they built, how far it has progressed, and the
            decisions the platform recorded along the way.
          </p>
        </div>
      </div>

      {list.loading || list.error || !list.data ? (
        <StateBlock loading={list.loading} error={list.error} onRetry={list.reload} />
      ) : unique.length === 0 ? (
        <StateBlock loading={false} error={null} empty="You have no students yet. Create a class and enrol students to monitor their companies." />
      ) : (
        <div className="pf-split">
          <Card title="Students" meta={`${unique.length} total`}>
            <div className="pf-level-list">
              {unique.map((student) => (
                <button
                  className={`pf-level-list__item${activeId === student.id ? ' pf-level-list__item--on' : ''}`}
                  key={student.id}
                  type="button"
                  onClick={() => setSelected(student.id)}
                >
                  <span className="pf-level-list__id">{student.levelIndex ?? '—'}</span>
                  <span className="pf-level-list__title">
                    {student.fullName}
                    <span className="pf-muted" style={{ display: 'block', fontSize: 12, fontWeight: 400 }}>
                      {student.businessName ?? 'No company yet'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Card>

          <div className="pf-col-stack">
            {activeId ? <CompanyMonitor key={activeId} studentId={activeId} /> : null}
          </div>
        </div>
      )}
    </>
  )
}

function dedupeStudents(students: StudentSummary[]): StudentSummary[] {
  const seen = new Set<string>()
  const out: StudentSummary[] = []
  for (const student of students) {
    if (seen.has(student.id)) continue
    seen.add(student.id)
    out.push(student)
  }
  return out.sort((a, b) => a.fullName.localeCompare(b.fullName))
}

function CompanyMonitor({ studentId }: { studentId: string }) {
  const { data, loading, error, reload } = useApi<StudentDetailPayload>(`/lecturer/students/${studentId}`)

  if (loading || error || !data) {
    return <StateBlock loading={loading} error={error} onRetry={reload} />
  }

  const { student, business, assignments, assessments, activity } = data

  return (
    <>
      <div className="pf-page-head" style={{ marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>{student.fullName}</h1>
          <p>
            {student.email} · {student.className}
          </p>
        </div>
        <div className="pf-chips">
          <Badge tone={statusTone(student.memberStatus)}>{student.memberStatus}</Badge>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile
          label="Level"
          value={student.levelIndex == null ? '—' : String(student.levelIndex)}
          sub={`Stage ${student.stageIndex ?? '—'}`}
        />
        <StatTile label="XP" value={formatNumber(student.xp)} sub={`${student.completedLevels} levels completed`} />
        <StatTile label="Cash on hand" value={formatMoney(student.cash)} sub="Business funds" tone="accent" />
        <StatTile label="Reputation" value={formatNumber(student.reputation)} sub="Standing in the market" />
        <StatTile
          label="Assessment"
          value={student.assessment?.overall != null ? `${Math.round(student.assessment.overall)}%` : '—'}
          sub={student.assessment ? `Grade ${student.assessment.grade}` : 'Not assessed'}
        />
      </div>

      <Card title="Company profile" meta={business ? <Badge tone="good">{business.sector}</Badge> : <Badge tone="warn">No company</Badge>}>
        {business ? (
          <div className="pf-dl">
            <dt>Business name</dt>
            <dd>{business.businessName}</dd>
            <dt>Sector</dt>
            <dd>{business.sector}</dd>
            <dt>The idea</dt>
            <dd>{business.idea || <span className="pf-muted">Not written</span>}</dd>
            <dt>Description</dt>
            <dd>{business.description || <span className="pf-muted">Not written</span>}</dd>
            <dt>Problem they solve</dt>
            <dd>{business.problem || <span className="pf-muted">Not written</span>}</dd>
            <dt>Product</dt>
            <dd>{business.product || <span className="pf-muted">Not written</span>}</dd>
            <dt>Ambition</dt>
            <dd>{business.ambition || <span className="pf-muted">Not written</span>}</dd>
            <dt>Last updated</dt>
            <dd>{formatRelative(business.updatedAt)}</dd>
          </div>
        ) : (
          <p className="pf-card__note">This student has not created a business profile yet.</p>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Assignments" meta={`${assignments.length} set`}>
        {assignments.length === 0 ? (
          <p className="pf-card__note">No assignments have been set for this student's class.</p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Assignment</th>
                  <th>Due</th>
                  <th>Submission</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>{assignment.title}</td>
                    <td>{formatDate(assignment.dueOn)}</td>
                    <td>
                      <Badge tone={statusTone(assignment.submissionStatus)}>
                        {assignment.submissionStatus === 'NOT_SET' ? 'Not set' : assignment.submissionStatus}
                      </Badge>
                    </td>
                    <td className="pf-muted">
                      {assignment.submittedAt ? `submitted ${formatRelative(assignment.submittedAt)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Assessments" meta={`${assessments.length} recorded`}>
        {assessments.length === 0 ? (
          <p className="pf-card__note">This student has not been assessed yet.</p>
        ) : (
          <div className="pf-col-stack">
            {assessments.map((assessment) => (
              <div key={assessment.id} className="pf-card">
                <div className="pf-inline-stats">
                  <span>
                    <strong>{assessment.overall != null ? `${Math.round(assessment.overall)}%` : '—'}</strong>{' '}
                    overall
                  </span>
                  {assessment.grade && <Badge tone="good">Grade {assessment.grade}</Badge>}
                  <span>{assessment.assignmentId ? 'Linked to an assignment' : 'Standalone assessment'}</span>
                  <span>updated {formatRelative(assessment.updatedAt)}</span>
                </div>
                <div className="pf-chips" style={{ marginTop: 8 }}>
                  {Object.entries(assessment.scores).map(([key, value]) => (
                    <span className="pf-chip" key={key}>
                      {key.replace(/_/g, ' ')}: {Math.round(value)}
                    </span>
                  ))}
                </div>
                {assessment.feedback && <p className="pf-card__note" style={{ marginTop: 8 }}>{assessment.feedback}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Decision history" meta="Most recent 25 recorded actions">
        {activity.length === 0 ? (
          <p className="pf-card__note">No recorded activity for this student yet.</p>
        ) : (
          <div className="pf-feed">
            {activity.map((entry) => (
              <div className="pf-feed__item" key={entry.id}>
                <span className="pf-feed__dot" />
                <div className="pf-feed__body">
                  <div className="pf-feed__title">{humaniseAction(entry.action)}</div>
                  <div className="pf-feed__meta">
                    {entry.detail} · {formatRelative(entry.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
