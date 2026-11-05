import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api } from '../../api/client'
import { BEGINNER_LEVELS } from '../../data/beginnerLevels'
import { MISSIONS } from '../../data/missions'
import { STAGES } from '../../data/stages'
import { Badge, Card, StateBlock, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  formatDate,
  isoToLocalInput,
  localInputToIso,
  statusTone,
  type AssignmentDetailPayload,
  type AssignmentInput,
  type AssignmentRow,
  type AssignmentsPayload,
  type ClassSummary,
  type ClassesPayload,
  type Meta,
  type StudentsPayload,
} from './api'

/**
 * The assignment builder.
 *
 * An assignment is drawn from the simulation's existing stages, levels and
 * missions — a lecturer selects where in the game the work sits, rather than
 * authoring new content. Learning objectives and assessment criteria are the
 * lecturer's own words; the assessment dimensions can be dropped in as criteria
 * with one click.
 */

interface Draft {
  classId: string
  title: string
  instructions: string
  stageIndex: number
  levelId: string
  missionId: string
  learningObjectives: string
  assessmentCriteria: string
  startsOn: string
  dueOn: string
  simulationHours: number
  assignAll: boolean
  assignTo: string[]
}

function emptyDraft(classId: string): Draft {
  return {
    classId,
    title: '',
    instructions: '',
    stageIndex: 1,
    levelId: '',
    missionId: '',
    learningObjectives: '',
    assessmentCriteria: '',
    startsOn: '',
    dueOn: '',
    simulationHours: 0,
    assignAll: true,
    assignTo: [],
  }
}

function draftFrom(assignment: AssignmentRow | AssignmentDetailPayload['assignment']): Draft {
  return {
    classId: assignment.classId,
    title: assignment.title,
    instructions: assignment.instructions,
    stageIndex: assignment.stageIndex,
    levelId: assignment.levelId ?? '',
    missionId: assignment.missionId ?? '',
    learningObjectives: assignment.learningObjectives.join('\n'),
    assessmentCriteria: assignment.assessmentCriteria.join('\n'),
    startsOn: isoToLocalInput(assignment.startsOn),
    dueOn: isoToLocalInput(assignment.dueOn),
    simulationHours: assignment.simulationHours,
    // The server does not return the current target set, so a save re-computes
    // it. Default to the whole class unless the lecturer chooses otherwise.
    assignAll: true,
    assignTo: [],
  }
}

function linesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function LecturerAssignmentBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const classes = useApi<ClassesPayload>('/lecturer/classes')
  const meta = useApi<Meta>('/lecturer/meta')
  const existing = useApi<AssignmentDetailPayload>(id ? `/lecturer/assignments/${id}` : null)
  const catalogue = useApi<AssignmentsPayload>('/lecturer/assignments?status=ALL')

  const [draft, setDraft] = useState<Draft | null>(null)
  const [roster, setRoster] = useState<{ id: string; fullName: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null)
  const [failure, setFailure] = useState<string | null>(null)

  const classList: ClassSummary[] = classes.data?.classes ?? []

  // Seed the form once the class list has arrived (needed for the default class).
  useEffect(() => {
    if (id) {
      if (existing.data) setDraft(draftFrom(existing.data.assignment))
      return
    }
    if (classes.data && !draft) setDraft(emptyDraft(classList[0]?.id ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, existing.data, classes.data])

  // Load the chosen class's students, for the "assign to specific students" case.
  useEffect(() => {
    if (!draft?.classId) {
      setRoster([])
      return
    }
    let cancelled = false
    api<StudentsPayload>(`/lecturer/students?classId=${encodeURIComponent(draft.classId)}&status=ACTIVE`)
      .then((result) => {
        if (cancelled) return
        setRoster(result.students.map((student) => ({ id: student.id, fullName: student.fullName })))
      })
      .catch(() => {
        if (!cancelled) setRoster([])
      })
    return () => {
      cancelled = true
    }
  }, [draft?.classId])

  if (id && (existing.loading || existing.error)) {
    return (
      <>
        <Link className="pf-row-link" to="/lecturer/assignments">
          ← Back to assignments
        </Link>
        <StateBlock loading={existing.loading} error={existing.error} onRetry={existing.reload} />
      </>
    )
  }

  if (classes.loading || classes.error || !classes.data) {
    return (
      <>
        <Link className="pf-row-link" to="/lecturer/assignments">
          ← Back to assignments
        </Link>
        <StateBlock loading={classes.loading} error={classes.error} onRetry={classes.reload} />
      </>
    )
  }

  if (!draft) return null

  const existingAssignment = existing.data?.assignment ?? null
  const objectiveSuggestions = unique(
    (catalogue.data?.assignments ?? []).flatMap((assignment) => assignment.learningObjectives),
  ).filter((objective) => !linesToList(draft.learningObjectives).includes(objective))

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  function addObjective(objective: string) {
    setDraft((current) => {
      if (!current) return current
      const lines = linesToList(current.learningObjectives)
      if (lines.includes(objective) || lines.length >= 10) return current
      return { ...current, learningObjectives: [...lines, objective].join('\n') }
    })
  }

  function addDimensionsAsCriteria() {
    const labels = (meta.data?.dimensions ?? []).map((dimension) => dimension.label)
    setDraft((current) => {
      if (!current) return current
      const lines = linesToList(current.assessmentCriteria)
      const merged = unique([...lines, ...labels]).slice(0, 10)
      return { ...current, assessmentCriteria: merged.join('\n') }
    })
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    setFailure(null)
    try {
      const body: AssignmentInput = {
        classId: draft.classId,
        title: draft.title.trim(),
        instructions: draft.instructions.trim(),
        stageIndex: draft.stageIndex,
        levelId: draft.levelId.trim() || null,
        missionId: draft.missionId.trim() || null,
        learningObjectives: linesToList(draft.learningObjectives),
        assessmentCriteria: linesToList(draft.assessmentCriteria),
        startsOn: localInputToIso(draft.startsOn),
        dueOn: localInputToIso(draft.dueOn),
        simulationHours: Math.max(0, Math.round(draft.simulationHours)),
        assignTo: draft.assignAll ? [] : draft.assignTo,
      }
      if (id) {
        await api(`/lecturer/assignments/${id}`, { method: 'PUT', body })
        setNotice('Assignment saved.')
        existing.reload()
      } else {
        const created = await api<{ assignment: { id: string } | null }>('/lecturer/assignments', { method: 'POST', body })
        navigate(`/lecturer/assignments/${created.assignment?.id ?? ''}`, {
          replace: true,
          state: { notice: 'Assignment created and open to the class.' },
        })
      }
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That assignment could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(next: 'OPEN' | 'CLOSED') {
    if (!id) return
    setBusy(true)
    setFailure(null)
    try {
      await api(`/lecturer/assignments/${id}/status`, { method: 'POST', body: { status: next } })
      setNotice(`Assignment ${next.toLowerCase()}.`)
      existing.reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That status change could not be made.')
    } finally {
      setBusy(false)
    }
  }

  const objectiveLines = linesToList(draft.learningObjectives)
  const criterionLines = linesToList(draft.assessmentCriteria)

  return (
    <>
      <div className="pf-page-head">
        <div>
          <Link className="pf-row-link" to="/lecturer/assignments">
            ← Back to assignments
          </Link>
          <h1 style={{ marginTop: 8 }}>{existingAssignment ? existingAssignment.title : 'New assignment'}</h1>
          <p>
            Build the assignment from the game's existing stages, levels and missions. Set the class,
            the instructions and the deadline.
          </p>
        </div>
        {existingAssignment && (
          <div className="pf-actions">
            <Badge tone={statusTone(existingAssignment.status)}>{existingAssignment.status}</Badge>
            {existingAssignment.status === 'OPEN' ? (
              <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={() => changeStatus('CLOSED')}>
                Close assignment
              </button>
            ) : (
              <button className="pf-btn pf-btn--good" type="button" disabled={busy} onClick={() => changeStatus('OPEN')}>
                Open assignment
              </button>
            )}
          </div>
        )}
      </div>

      {notice && <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>{notice}</div>}
      {failure && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 16 }}>{failure}</div>}

      <div className="pf-cols pf-cols--2">
        <div className="pf-col-stack">
          <Card title="The work">
            <div className="pf-form">
              <label className="pf-field">
                <span className="pf-field__label">Class</span>
                <select className="pf-select" value={draft.classId} onChange={(event) => set('classId', event.target.value)}>
                  {classList.length === 0 && <option value="">No classes yet</option>}
                  {classList.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="pf-field">
                <span className="pf-field__label">Title</span>
                <input
                  className="pf-input pf-input--block"
                  value={draft.title}
                  maxLength={90}
                  placeholder="e.g. Write a defensible business plan"
                  onChange={(event) => set('title', event.target.value)}
                />
              </label>

              <label className="pf-field">
                <span className="pf-field__label">Instructions</span>
                <textarea
                  className="pf-textarea"
                  rows={4}
                  maxLength={1500}
                  value={draft.instructions}
                  placeholder="What the students must do, in practical terms."
                  onChange={(event) => set('instructions', event.target.value)}
                />
              </label>
            </div>
          </Card>

          <Card title="Where in the game" meta="Drawn from the existing catalogue">
            <div className="pf-form">
              <div className="pf-field-row">
                <label className="pf-field">
                  <span className="pf-field__label">Stage</span>
                  <select
                    className="pf-select"
                    value={draft.stageIndex}
                    onChange={(event) => set('stageIndex', Number(event.target.value))}
                  >
                    {STAGES.map((stage) => (
                      <option key={stage.id} value={stage.index}>
                        {stage.index}. {stage.name} — {stage.description}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pf-field">
                  <span className="pf-field__label">Level</span>
                  <input
                    className="pf-input"
                    list="lecturer-levels"
                    value={draft.levelId}
                    placeholder="e.g. L3"
                    onChange={(event) => set('levelId', event.target.value)}
                  />
                  <datalist id="lecturer-levels">
                    {BEGINNER_LEVELS.map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.title}
                      </option>
                    ))}
                  </datalist>
                </label>
                <label className="pf-field">
                  <span className="pf-field__label">Mission</span>
                  <select className="pf-select" value={draft.missionId} onChange={(event) => set('missionId', event.target.value)}>
                    <option value="">No specific mission</option>
                    {MISSIONS.map((mission) => (
                      <option key={mission.levelId} value={mission.levelId}>
                        {mission.levelId} — {mission.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="pf-field-row">
                <label className="pf-field">
                  <span className="pf-field__label">Starts on</span>
                  <input
                    className="pf-input"
                    type="datetime-local"
                    value={draft.startsOn}
                    onChange={(event) => set('startsOn', event.target.value)}
                  />
                </label>
                <label className="pf-field">
                  <span className="pf-field__label">Due on</span>
                  <input
                    className="pf-input"
                    type="datetime-local"
                    value={draft.dueOn}
                    onChange={(event) => set('dueOn', event.target.value)}
                  />
                </label>
                <label className="pf-field">
                  <span className="pf-field__label">Simulation hours</span>
                  <input
                    className="pf-input"
                    type="number"
                    min={0}
                    max={500}
                    value={draft.simulationHours}
                    onChange={(event) => set('simulationHours', Number(event.target.value) || 0)}
                  />
                  <span className="pf-field__hint">In-game hours the students have to work this through.</span>
                </label>
              </div>
            </div>
          </Card>

          <Card title="Learning objectives" meta={`${objectiveLines.length}/10`}>
            <div className="pf-form">
              <label className="pf-field">
                <span className="pf-field__label">One per line</span>
                <textarea
                  className="pf-textarea"
                  rows={4}
                  value={draft.learningObjectives}
                  placeholder={'Understand the cost structure of a small business\nExplain pricing decisions'}
                  onChange={(event) => set('learningObjectives', event.target.value)}
                />
                <span className="pf-field__hint">Up to 10 objectives, each up to 160 characters.</span>
              </label>

              {objectiveSuggestions.length > 0 && (
                <>
                  <span className="pf-field__label">Reuse an objective from another assignment</span>
                  <div className="pf-chips">
                    {objectiveSuggestions.slice(0, 12).map((objective) => (
                      <button
                        className="pf-chip"
                        key={objective}
                        type="button"
                        disabled={objectiveLines.length >= 10}
                        onClick={() => addObjective(objective)}
                      >
                        + {objective}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card title="Assessment criteria" meta={`${criterionLines.length}/10`}>
            <div className="pf-form">
              <label className="pf-field">
                <span className="pf-field__label">One per line</span>
                <textarea
                  className="pf-textarea"
                  rows={4}
                  value={draft.assessmentCriteria}
                  placeholder={'Revised forecasts when costs rose\nExplained the trade-offs behind each decision'}
                  onChange={(event) => set('assessmentCriteria', event.target.value)}
                />
                <span className="pf-field__hint">
                  Describe what good decision-making looks like — this is what the grading is judged
                  against, not XP or cash.
                </span>
              </label>
              <div className="pf-actions">
                <button
                  className="pf-btn pf-btn--ghost"
                  type="button"
                  disabled={(meta.data?.dimensions ?? []).length === 0}
                  onClick={addDimensionsAsCriteria}
                >
                  Add the ten assessment dimensions
                </button>
              </div>
            </div>
          </Card>

          <Card title="Who it is for" meta={draft.assignAll ? 'Whole class' : `${draft.assignTo.length} selected`}>
            <label className="pf-check">
              <input type="checkbox" checked={draft.assignAll} onChange={(event) => set('assignAll', event.target.checked)} />
              Assign to every active student in the class
            </label>
            {!draft.assignAll && (
              <div className="pf-picker" style={{ marginTop: 10 }}>
                {roster.length === 0 ? (
                  <p className="pf-card__note">No active students in this class yet.</p>
                ) : (
                  roster.map((student) => {
                    const on = draft.assignTo.includes(student.id)
                    return (
                      <button
                        className={`pf-picker__opt${on ? ' pf-picker__opt--on' : ''}`}
                        key={student.id}
                        type="button"
                        onClick={() =>
                          set('assignTo', on ? draft.assignTo.filter((sid) => sid !== student.id) : [...draft.assignTo, student.id])
                        }
                      >
                        {student.fullName}
                      </button>
                    )
                  })
                )}
              </div>
            )}
            <p className="pf-card__note" style={{ marginTop: 8 }}>
              Saving an assignment re-sets who it is assigned to. Last saved{' '}
              {existingAssignment ? formatRelative(existingAssignment.updatedAt) : 'never'}.
            </p>
          </Card>

          <div className="pf-actions">
            <button
              className="pf-btn"
              type="button"
              disabled={busy || !draft.classId || draft.title.trim().length < 2}
              onClick={save}
            >
              {busy ? 'Saving…' : id ? 'Save assignment' : 'Create assignment'}
            </button>
            <Link className="pf-btn pf-btn--ghost" to="/lecturer/assignments">
              Cancel
            </Link>
          </div>
        </div>

        <div className="pf-col-stack">
          <Card title="Preview" meta={draft.classId ? classList.find((c) => c.id === draft.classId)?.name : 'No class'}>
            <div className="pf-preview">
              <div className="pf-preview__eyebrow">
                Stage {draft.stageIndex}
                {draft.levelId ? ` · ${draft.levelId}` : ''}
                {draft.missionId ? ` · ${draft.missionId}` : ''}
              </div>
              <h3 className="pf-preview__title">{draft.title || 'Untitled assignment'}</h3>
              <p className="pf-preview__body">{draft.instructions || 'No instructions written yet.'}</p>

              <div className="pf-preview__label">Learning objectives</div>
              {objectiveLines.length === 0 ? (
                <p className="pf-card__note">None set.</p>
              ) : (
                <ul className="pf-preview__list">
                  {objectiveLines.map((objective) => (
                    <li key={objective}>{objective}</li>
                  ))}
                </ul>
              )}

              <div className="pf-preview__label">Assessment criteria</div>
              {criterionLines.length === 0 ? (
                <p className="pf-card__note">None set.</p>
              ) : (
                <ul className="pf-preview__list">
                  {criterionLines.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              )}

              <div className="pf-preview__label">Timing</div>
              <ul className="pf-preview__list">
                <li>Starts {draft.startsOn ? formatDate(localInputToIso(draft.startsOn)) : 'immediately'}</li>
                <li>Due {draft.dueOn ? formatDate(localInputToIso(draft.dueOn)) : 'no deadline'}</li>
                <li>{formatNumber(draft.simulationHours)} simulation hours</li>
              </ul>
            </div>
          </Card>

          {id && existing.data && (
            <Card title="Student progress" meta={`${existing.data.progress.length} student${existing.data.progress.length === 1 ? '' : 's'}`}>
              {existing.data.progress.length === 0 ? (
                <p className="pf-card__note">No students are assigned this work.</p>
              ) : (
                <div className="pf-table-wrap">
                  <table className="pf-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Status</th>
                        <th className="pf-table__num">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existing.data.progress.map((entry) => (
                        <tr key={entry.studentId}>
                          <td>
                            {entry.fullName}
                            <div className="pf-muted" style={{ fontSize: 12 }}>{entry.email}</div>
                          </td>
                          <td>
                            <Badge tone={statusTone(entry.status)}>{entry.status}</Badge>
                          </td>
                          <td className="pf-table__num">
                            {entry.score != null ? `${Math.round(entry.score)}% (${entry.grade})` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="pf-card__note" style={{ marginTop: 10 }}>
                Grade these students on the <Link className="pf-row-link" to="/lecturer/grading">Grading</Link> page.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}
