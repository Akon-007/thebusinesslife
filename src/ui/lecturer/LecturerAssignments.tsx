import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../../api/client'
import { LEVEL_BY_ID } from '../../data/beginnerLevels'
import { STAGES } from '../../data/stages'
import { Badge, Card, StateBlock, StatTile, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import { formatDate, statusTone, type AssignmentRow, type AssignmentsPayload, type ClassesPayload } from './api'

/**
 * The assignments set across the lecturer's classes.
 *
 * An assignment points students at a stage, level and mission they already have
 * in the simulation, with instructions and a deadline — the builder produces
 * them and this table manages their lifecycle.
 */
export function LecturerAssignments() {
  const [classId, setClassId] = useState('')
  const [status, setStatusFilter] = useState('ALL')
  const [flash, setFlash] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const classes = useApi<ClassesPayload>('/lecturer/classes')
  const path = `/lecturer/assignments?classId=${encodeURIComponent(classId)}&status=${status}`
  const { data, loading, error, reload } = useApi<AssignmentsPayload>(path)

  const rows = data?.assignments ?? []
  const open = rows.filter((row) => row.status === 'OPEN').length
  const submitted = rows.reduce((sum, row) => sum + row.submitted, 0)
  const assigned = rows.reduce((sum, row) => sum + row.assigned, 0)

  function reset() {
    setFlash(null)
    setFailure(null)
  }

  async function setStatus(assignment: AssignmentRow, next: 'OPEN' | 'CLOSED') {
    setBusyId(assignment.id)
    reset()
    try {
      await api(`/lecturer/assignments/${assignment.id}/status`, { method: 'POST', body: { status: next } })
      setFlash(`"${assignment.title}" is now ${next.toLowerCase()}.`)
      reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That status change could not be made.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(assignment: AssignmentRow) {
    setBusyId(assignment.id)
    reset()
    try {
      await api(`/lecturer/assignments/${assignment.id}`, { method: 'DELETE' })
      setFlash(`"${assignment.title}" deleted.`)
      setConfirmId(null)
      reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That assignment could not be deleted.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Assignments</h1>
          <p>
            Work set for your classes, built from the existing stages, levels and missions. Open an
            assignment to change it, or create a new one.
          </p>
        </div>
        <div className="pf-actions">
          <Link className="pf-btn" to="/lecturer/assignments/new">
            New assignment
          </Link>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Assignments" value={data ? formatNumber(rows.length) : '—'} sub={`${open} open`} />
        <StatTile label="Assigned" value={data ? formatNumber(assigned) : '—'} sub="Student submissions expected" />
        <StatTile
          label="Submitted"
          value={data ? formatNumber(submitted) : '—'}
          sub={assigned > 0 ? `${Math.round((submitted / assigned) * 100)}% of those set` : 'Nothing set'}
          tone="accent"
        />
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

      <div className="pf-toolbar">
        <select className="pf-select" value={classId} onChange={(event) => setClassId(event.target.value)}>
          <option value="">All my classes</option>
          {(classes.data?.classes ?? []).map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </select>
        <select className="pf-select" value={status} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="ALL">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="DRAFT">Draft</option>
        </select>
        <button className="pf-btn pf-btn--ghost" type="button" onClick={reload}>
          Refresh
        </button>
      </div>

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <StateBlock loading={false} error={null} empty="No assignments match these filters." />
      ) : (
        <Card title={`${formatNumber(data.total)} assignment${data.total === 1 ? '' : 's'}`}>
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Class</th>
                  <th>Where in the game</th>
                  <th>Due</th>
                  <th className="pf-table__num">Hours</th>
                  <th>Status</th>
                  <th className="pf-table__num">Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((assignment) => {
                  const stage = STAGES.find((s) => s.index === assignment.stageIndex)
                  const level = assignment.levelId ? LEVEL_BY_ID[assignment.levelId] : null
                  return (
                    <tr key={assignment.id}>
                      <td>
                        <Link className="pf-row-link" to={`/lecturer/assignments/${assignment.id}`}>
                          {assignment.title}
                        </Link>
                      </td>
                      <td>{assignment.className}</td>
                      <td>
                        {stage ? `${stage.index}. ${stage.name}` : `Stage ${assignment.stageIndex}`}
                        <div className="pf-muted" style={{ fontSize: 12 }}>
                          {level ? `${level.id} — ${level.title}` : assignment.levelId ?? 'No level'}
                          {assignment.missionId ? ` · ${assignment.missionId}` : ''}
                        </div>
                      </td>
                      <td>{formatDate(assignment.dueOn)}</td>
                      <td className="pf-table__num">{formatNumber(assignment.simulationHours)}</td>
                      <td>
                        <Badge tone={statusTone(assignment.status)}>{assignment.status}</Badge>
                      </td>
                      <td className="pf-table__num">
                        {assignment.submitted}/{assignment.assigned}
                        <div className="pf-muted" style={{ fontSize: 12 }}>{assignment.graded} graded</div>
                      </td>
                      <td>
                        <div className="pf-actions">
                          <Link className="pf-btn pf-btn--ghost pf-btn--sm" to={`/lecturer/assignments/${assignment.id}`}>
                            Edit
                          </Link>
                          {assignment.status === 'OPEN' ? (
                            <button
                              className="pf-btn pf-btn--ghost pf-btn--sm"
                              type="button"
                              disabled={busyId === assignment.id}
                              onClick={() => setStatus(assignment, 'CLOSED')}
                            >
                              Close
                            </button>
                          ) : (
                            <button
                              className="pf-btn pf-btn--ghost pf-btn--sm"
                              type="button"
                              disabled={busyId === assignment.id || assignment.status === 'DRAFT'}
                              onClick={() => setStatus(assignment, 'OPEN')}
                            >
                              Open
                            </button>
                          )}
                          {confirmId === assignment.id ? (
                            <>
                              <button
                                className="pf-btn pf-btn--danger pf-btn--sm"
                                type="button"
                                disabled={busyId === assignment.id}
                                onClick={() => remove(assignment)}
                              >
                                {busyId === assignment.id ? 'Deleting…' : 'Confirm'}
                              </button>
                              <button
                                className="pf-btn pf-btn--ghost pf-btn--sm"
                                type="button"
                                disabled={busyId === assignment.id}
                                onClick={() => setConfirmId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="pf-btn pf-btn--ghost pf-btn--sm"
                              type="button"
                              onClick={() => setConfirmId(assignment.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}
