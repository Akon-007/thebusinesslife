import { useEffect, useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  statusTone,
  type AssessmentInput,
  type AssignmentsPayload,
  type ClassesPayload,
  type Meta,
  type StudentsPayload,
} from './api'

/**
 * Grading.
 *
 * A student is assessed on the quality of their decisions, one mark per
 * dimension, with written feedback. The server computes the overall mark and the
 * grade band, and a notification is sent to the student — so what is shown here
 * is the server's verdict, not the client's.
 */
export function LecturerGrading() {
  const [classId, setClassId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [assignmentId, setAssignmentId] = useState('')

  const classes = useApi<ClassesPayload>('/lecturer/classes')
  const meta = useApi<Meta>('/lecturer/meta')
  const students = useApi<StudentsPayload>(`/lecturer/students?classId=${encodeURIComponent(classId)}&status=ACTIVE`)
  const assignments = useApi<AssignmentsPayload>(`/lecturer/assignments?classId=${encodeURIComponent(classId)}&status=ALL`)

  const [scores, setScores] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [result, setResult] = useState<{ overall: number; grade: string } | null>(null)

  const dimensions = meta.data?.dimensions ?? []
  const studentList = students.data?.students ?? []
  const assignmentList = (assignments.data?.assignments ?? []).filter((assignment) => assignment.status !== 'DRAFT')

  const selectedStudent = studentList.find((student) => student.id === studentId) ?? null

  // Clear the marks whenever the student or assignment changes.
  useEffect(() => {
    setScores({})
    setFeedback('')
    setResult(null)
    setNotice(null)
    setFailure(null)
  }, [studentId, assignmentId])

  const entered = dimensions.filter((dimension) => {
    const value = scores[dimension.key]
    return value !== undefined && value.trim() !== ''
  })

  async function save() {
    if (!selectedStudent) return
    setBusy(true)
    setNotice(null)
    setFailure(null)
    setResult(null)
    try {
      const marks: Record<string, number> = {}
      for (const dimension of dimensions) {
        const raw = scores[dimension.key]
        if (raw === undefined || raw.trim() === '') continue
        const value = Number(raw)
        if (Number.isFinite(value)) marks[dimension.key] = Math.min(100, Math.max(0, value))
      }
      const body: AssessmentInput = {
        assignmentId: assignmentId || null,
        studentId: selectedStudent.id,
        scores: marks,
        feedback: feedback.trim(),
      }
      const response = await api<{ ok: true; overall: number; grade: string }>('/lecturer/assessments', {
        method: 'PUT',
        body,
      })
      setResult({ overall: response.overall, grade: response.grade })
      setNotice(`${selectedStudent.fullName} assessed at ${Math.round(response.overall)}% (grade ${response.grade}).`)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That assessment could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  if (classes.loading || classes.error || !classes.data) {
    return (
      <>
        <div className="pf-page-head">
          <div>
            <h1>Grading</h1>
            <p>Record a mark per assessment dimension and add written feedback.</p>
          </div>
        </div>
        <StateBlock loading={classes.loading} error={classes.error} onRetry={classes.reload} />
      </>
    )
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Grading</h1>
          <p>
            Assess the quality of a student's decisions, not their XP or cash. Mark the dimensions you
            have evidence for — the server averages them into an overall mark and grade.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Dimensions" value={meta.data ? formatNumber(dimensions.length) : '—'} sub="Assessment framework" tone="accent" />
        <StatTile label="Marked so far" value={formatNumber(entered.length)} sub={selectedStudent ? selectedStudent.fullName : 'Choose a student'} />
        <StatTile
          label="Verdict"
          value={result ? `${Math.round(result.overall)}%` : '—'}
          sub={result ? `Grade ${result.grade}` : 'Not saved yet'}
          tone={result ? 'good' : ''}
        />
      </div>

      {notice && <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>{notice}</div>}
      {failure && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 16 }}>{failure}</div>}

      <Card title="Choose the student" meta="Filter by class">
        <div className="pf-toolbar">
          <select className="pf-select" value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId(''); setAssignmentId('') }}>
            <option value="">All my classes</option>
            {(classes.data.classes ?? []).map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
          <select className="pf-select pf-input--grow" value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={students.loading}>
            <option value="">{students.loading ? 'Loading students…' : `${studentList.length} student${studentList.length === 1 ? '' : 's'}`}</option>
            {studentList.map((student) => (
              <option key={student.id} value={student.id}>
                {student.fullName} — {student.className}
              </option>
            ))}
          </select>
          <select className="pf-select" value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} disabled={!studentId}>
            <option value="">Not linked to an assignment</option>
            {assignmentList.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {assignment.title}
              </option>
            ))}
          </select>
        </div>
        {students.error && (
          <div className="pf-notice pf-notice--bad" style={{ marginTop: 12 }}>
            {students.error}
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />

      {!selectedStudent ? (
        <Card title="Marks">
          <p className="pf-card__note">Choose a student to record their marks.</p>
        </Card>
      ) : meta.loading || meta.error || !meta.data ? (
        <StateBlock loading={meta.loading} error={meta.error} onRetry={meta.reload} />
      ) : (
        <Card title={`Marks for ${selectedStudent.fullName}`} meta={selectedStudent.businessName ?? 'No company yet'}>
          <p className="pf-card__note" style={{ marginTop: 0 }}>
            Each dimension is marked out of 100 and describes decision quality. Leave a dimension blank
            if you have no evidence for it — only the dimensions you mark count towards the average.
          </p>
          <div className="pf-form">
            {dimensions.map((dimension) => (
              <div className="pf-field" key={dimension.key}>
                <span className="pf-field__label">{dimension.label}</span>
                <input
                  className="pf-input"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="—"
                  value={scores[dimension.key] ?? ''}
                  onChange={(event) => setScores((current) => ({ ...current, [dimension.key]: event.target.value }))}
                />
              </div>
            ))}

            <label className="pf-field">
              <span className="pf-field__label">Feedback</span>
              <textarea
                className="pf-textarea"
                rows={4}
                maxLength={2000}
                value={feedback}
                placeholder="What the student did well, and what to improve. Sent to the student with their grade."
                onChange={(event) => setFeedback(event.target.value)}
              />
            </label>

            {assignmentId && (
              <div className="pf-notice" style={{ marginBottom: 4 }}>
                Saving this marks the student's submission as graded.
              </div>
            )}

            <div className="pf-actions">
              <button className="pf-btn" type="button" disabled={busy || entered.length === 0} onClick={save}>
                {busy ? 'Saving…' : 'Save assessment'}
              </button>
              {entered.length === 0 && <span className="pf-muted">Mark at least one dimension to save.</span>}
            </div>

            {result && (
              <div className="pf-card" style={{ marginTop: 8 }}>
                <div className="pf-inline-stats">
                  <span>
                    Overall <strong>{Math.round(result.overall)}%</strong>
                  </span>
                  <Badge tone={statusTone('GRADED')}>Grade {result.grade}</Badge>
                  <span>{entered.length} dimension{entered.length === 1 ? '' : 's'} marked</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  )
}
