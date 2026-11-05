import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  copyText,
  formatDate,
  statusTone,
  type ClassDetailPayload,
  type PlayersPayload,
  type PlayerOption,
} from './api'

/**
 * A single class.
 *
 * The page is organised around the three things a lecturer does with a class:
 * let students in, take students out, and see the work set for it. Students who
 * asked to join with the invite code wait here until they are approved.
 */
export function LecturerClassDetail() {
  const { id } = useParams<{ id: string }>()
  const detail = useApi<ClassDetailPayload>(id ? `/lecturer/classes/${id}` : null)
  const [flash, setFlash] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (detail.loading || detail.error || !detail.data) {
    return (
      <>
        <Link className="pf-row-link" to="/lecturer/classes">
          ← Back to classes
        </Link>
        <StateBlock loading={detail.loading} error={detail.error} onRetry={detail.reload} />
      </>
    )
  }

  const { class: cls, students, assignments } = detail.data
  const roster = students.filter((student) => student.memberStatus === 'ACTIVE')
  const pending = students.filter((student) => student.memberStatus === 'PENDING')

  function reset() {
    setFlash(null)
    setFailure(null)
  }

  async function approve(studentId: string, name: string) {
    if (!id) return
    setBusyId(studentId)
    reset()
    try {
      await api(`/lecturer/classes/${id}/students/${studentId}/approve`, { method: 'POST' })
      setFlash(`${name} approved and added to the class.`)
      detail.reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That student could not be approved.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(studentId: string, name: string) {
    if (!id) return
    setBusyId(studentId)
    reset()
    try {
      await api(`/lecturer/classes/${id}/students/${studentId}`, { method: 'DELETE' })
      setFlash(`${name} removed from the class.`)
      detail.reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That student could not be removed.')
    } finally {
      setBusyId(null)
    }
  }

  async function copyCode() {
    const ok = await copyText(cls.inviteCode)
    setCopied(ok)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <Link className="pf-row-link" to="/lecturer/classes">
            ← Back to classes
          </Link>
          <h1 style={{ marginTop: 8 }}>{cls.name}</h1>
          <p>
            {cls.term || 'No term set'} · runs {formatDate(cls.startsOn)} → {formatDate(cls.endsOn)}
          </p>
        </div>
        <div className="pf-chips">
          <Badge tone={statusTone(cls.status)}>{cls.status === 'ACTIVE' ? 'Active' : 'Archived'}</Badge>
          {cls.simulationPaused && <Badge tone="warn">Simulation paused</Badge>}
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Students" value={formatNumber(roster.length)} sub="Approved members" />
        <StatTile
          label="Awaiting approval"
          value={formatNumber(pending.length)}
          sub={pending.length > 0 ? 'Action needed' : 'Nothing waiting'}
          tone={pending.length > 0 ? 'warn' : ''}
        />
        <StatTile label="Assignments" value={formatNumber(assignments.length)} sub="Set for this class" tone="accent" />
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

      <div className="pf-card" style={{ marginBottom: 16 }}>
        <div className="pf-inline-stats">
          <span>
            Invite code <strong className="pf-mono" style={{ letterSpacing: 2 }}>{cls.inviteCode}</strong>
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <button className="pf-btn pf-btn--sm" type="button" onClick={copyCode}>
              {copied ? 'Copied' : 'Copy code'}
            </button>
          </span>
        </div>
      </div>

      {id && <AddStudentForm classId={id} onAdded={(name) => { reset(); setFlash(`${name} added to the class.`); detail.reload() }} onError={setFailure} />}

      <Card title="Awaiting approval" meta={pending.length > 0 ? `${pending.length} request${pending.length === 1 ? '' : 's'}` : 'All clear'}>
        {pending.length === 0 ? (
          <p className="pf-card__note">
            No one is waiting to join. Students who enter your invite code appear here for approval.
          </p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Company</th>
                  <th>Asked to join</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div>{student.fullName}</div>
                      <div className="pf-muted" style={{ fontSize: 12 }}>{student.email}</div>
                    </td>
                    <td>{student.businessName ?? <span className="pf-muted">No company yet</span>}</td>
                    <td>{student.lastSeenAt ? formatRelative(student.lastSeenAt) : '—'}</td>
                    <td className="pf-actions">
                      <button
                        className="pf-btn pf-btn--good pf-btn--sm"
                        type="button"
                        disabled={busyId === student.id}
                        onClick={() => approve(student.id, student.fullName)}
                      >
                        {busyId === student.id ? 'Approving…' : 'Approve'}
                      </button>
                      <button
                        className="pf-btn pf-btn--ghost pf-btn--sm"
                        type="button"
                        disabled={busyId === student.id}
                        onClick={() => remove(student.id, student.fullName)}
                      >
                        Decline
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Class roster" meta={`${roster.length} student${roster.length === 1 ? '' : 's'}`}>
        {roster.length === 0 ? (
          <p className="pf-card__note">No approved students yet. Add one above or share the invite code.</p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Company</th>
                  <th className="pf-table__num">Level</th>
                  <th className="pf-table__num">Mark</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {roster.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div>{student.fullName}</div>
                      <div className="pf-muted" style={{ fontSize: 12 }}>{student.email}</div>
                    </td>
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
                    <td className="pf-table__num">
                      {student.assessment?.overall != null
                        ? `${Math.round(student.assessment.overall)}% (${student.assessment.grade})`
                        : '—'}
                    </td>
                    <td>{student.lastSeenAt ? formatRelative(student.lastSeenAt) : <span className="pf-muted">Never</span>}</td>
                    <td>
                      <button
                        className="pf-btn pf-btn--ghost pf-btn--sm"
                        type="button"
                        disabled={busyId === student.id}
                        onClick={() => remove(student.id, student.fullName)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card title="Assignments" meta={`${assignments.length} set`}>
        {assignments.length === 0 ? (
          <p className="pf-card__note">
            No assignments set for this class yet. <Link className="pf-row-link" to="/lecturer/assignments/new">Create one</Link>.
          </p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Due</th>
                  <th className="pf-table__num">Submitted</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td>
                      <Link className="pf-row-link" to={`/lecturer/assignments/${assignment.id}`}>
                        {assignment.title}
                      </Link>
                    </td>
                    <td>{formatDate(assignment.dueOn)}</td>
                    <td className="pf-table__num">
                      {assignment.submitted}/{assignment.assigned}
                    </td>
                    <td>
                      <Badge tone={statusTone(assignment.status)}>{assignment.status}</Badge>
                    </td>
                    <td>
                      <Link className="pf-btn pf-btn--ghost pf-btn--sm" to={`/lecturer/assignments/${assignment.id}`}>
                        Open
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

/** Search the platform's players and add one to the class. */
function AddStudentForm({
  classId,
  onAdded,
  onError,
}: {
  classId: string
  onAdded: (name: string) => void
  onError: (message: string) => void
}) {
  const [term, setTerm] = useState('')
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<PlayerOption | null>(null)
  const [busy, setBusy] = useState(false)

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(term.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [term])

  const players = useApi<PlayersPayload>(
    `/lecturer/players?q=${encodeURIComponent(query)}&classId=${encodeURIComponent(classId)}`,
  )
  const options = players.data?.players ?? []

  async function add() {
    if (!chosen) return
    setBusy(true)
    try {
      await api(`/lecturer/classes/${classId}/students`, { method: 'POST', body: { studentId: chosen.id } })
      onAdded(chosen.fullName)
      setChosen(null)
      setTerm('')
      setQuery('')
      players.reload()
    } catch (cause) {
      onError(cause instanceof ApiError ? cause.message : 'That student could not be added.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Add a student" meta="Search by name, email or company">
      <div className="pf-toolbar">
        <input
          className="pf-input pf-input--grow"
          type="search"
          placeholder="Search players not already in this class"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <select
          className="pf-select"
          value={chosen?.id ?? ''}
          onChange={(event) => setChosen(options.find((option) => option.id === event.target.value) ?? null)}
          disabled={players.loading}
        >
          <option value="">{players.loading ? 'Searching…' : `${options.length} match${options.length === 1 ? '' : 'es'}`}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.fullName} — {option.email}
            </option>
          ))}
        </select>
        <button className="pf-btn" type="button" disabled={!chosen || busy} onClick={add}>
          {busy ? 'Adding…' : 'Add to class'}
        </button>
      </div>
      {query && !players.loading && options.length === 0 && (
        <p className="pf-card__note">No matching player found. Only verified, active players can be added.</p>
      )}
    </Card>
  )
}
