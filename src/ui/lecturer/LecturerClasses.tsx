import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import { copyText, formatDate, statusTone, type ClassRow, type ClassesPayload } from './api'

/**
 * The lecturer's classes.
 *
 * A class is the unit everything else hangs from: students join it, assignments
 * are set for it, scenarios run against it. The invite code is the one thing a
 * lecturer actually hands out, so it is shown prominently and can be copied or
 * rotated in place.
 */
export function LecturerClasses() {
  const { data, loading, error, reload } = useApi<ClassesPayload>('/lecturer/classes')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const rows = data?.classes ?? []
  const active = rows.filter((row) => row.status === 'ACTIVE').length
  const pending = rows.reduce((sum, row) => sum + row.pending, 0)
  const students = rows.reduce((sum, row) => sum + row.students, 0)

  const current = selected ? rows.find((row) => row.id === selected) ?? null : null

  function afterChange(message: string, select: string | null) {
    setFlash(message)
    setSelected(select)
    setCreating(false)
    reload()
  }

  async function copyCode(code: string) {
    const ok = await copyText(code)
    setCopied(ok ? code : null)
    if (!ok) setFlash('Could not copy automatically — select the code and copy it manually.')
    window.setTimeout(() => setCopied(null), 2000)
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>My Classes</h1>
          <p>
            Create a class, give students its invite code, and manage who is enrolled. Archiving a
            class keeps its records but removes it from active teaching.
          </p>
        </div>
        <div className="pf-actions">
          <button className="pf-btn" type="button" onClick={() => { setCreating(true); setSelected(null) }}>
            New class
          </button>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Classes" value={data ? formatNumber(rows.length) : '—'} sub={`${active} active`} />
        <StatTile label="Students enrolled" value={data ? formatNumber(students) : '—'} sub="Active memberships" tone="accent" />
        <StatTile
          label="Awaiting approval"
          value={data ? formatNumber(pending) : '—'}
          sub={pending > 0 ? 'Across your classes' : 'Nothing waiting'}
          tone={pending > 0 ? 'warn' : ''}
        />
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : rows.length === 0 && !creating ? (
        <StateBlock loading={false} error={null} empty="You have no classes yet. Create your first class to get started." />
      ) : (
        <div className="pf-split">
          <Card title="Classes" meta={`${rows.length} total`}>
            {rows.length === 0 ? (
              <p className="pf-card__note">No classes yet.</p>
            ) : (
              <div className="pf-level-list">
                {rows.map((row) => (
                  <button
                    className={`pf-level-list__item${selected === row.id ? ' pf-level-list__item--on' : ''}`}
                    key={row.id}
                    type="button"
                    onClick={() => { setSelected(row.id); setCreating(false) }}
                  >
                    <span className="pf-level-list__id">{row.students}</span>
                    <span className="pf-level-list__title">
                      {row.name}
                      <span className="pf-muted" style={{ display: 'block', fontSize: 12, fontWeight: 400 }}>
                        {row.term || 'No term'} · {row.pending} pending
                      </span>
                    </span>
                    {row.status !== 'ACTIVE' && <span className="pf-level-list__flag">archived</span>}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <div className="pf-col-stack">
            {creating ? (
              <ClassEditor onDone={afterChange} onCancel={() => setCreating(false)} />
            ) : current ? (
              <ClassPanel
                key={current.id}
                row={current}
                copied={copied === current.inviteCode}
                onCopy={copyCode}
                onDone={afterChange}
              />
            ) : (
              <Card title="Class detail">
                <p className="pf-card__note">
                  Choose a class to edit it, manage its status and share its invite code — or create
                  a new one.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** The create/edit form. Create when `row` is absent. */
function ClassEditor({
  row,
  onDone,
  onCancel,
}: {
  row?: ClassRow
  onDone: (message: string, select: string | null) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(row?.name ?? '')
  const [description, setDescription] = useState(row?.description ?? '')
  const [term, setTerm] = useState(row?.term ?? '')
  const [startsOn, setStartsOn] = useState(row?.startsOn ?? '')
  const [endsOn, setEndsOn] = useState(row?.endsOn ?? '')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        term: term.trim(),
        startsOn: startsOn.trim() || null,
        endsOn: endsOn.trim() || null,
      }
      if (row) {
        await api(`/lecturer/classes/${row.id}`, { method: 'PUT', body })
        onDone(`"${body.name}" updated.`, row.id)
      } else {
        const created = await api<{ class: ClassRow | null }>('/lecturer/classes', { method: 'POST', body })
        onDone(`"${body.name}" created. Share the invite code with your students.`, created.class?.id ?? null)
      }
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That class could not be saved.')
      setBusy(false)
    }
  }

  return (
    <Card title={row ? 'Edit class' : 'New class'}>
      {failure && (
        <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }}>
          {failure}
        </div>
      )}
      <div className="pf-form">
        <label className="pf-field">
          <span className="pf-field__label">Class name</span>
          <input
            className="pf-input pf-input--block"
            value={name}
            maxLength={80}
            placeholder="e.g. Introduction to Entrepreneurship — Group A"
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">Term</span>
            <input
              className="pf-input"
              value={term}
              maxLength={60}
              placeholder="e.g. 2025/2026 First Semester"
              onChange={(event) => setTerm(event.target.value)}
            />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Starts on</span>
            <input className="pf-input" type="date" value={startsOn ?? ''} onChange={(event) => setStartsOn(event.target.value)} />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Ends on</span>
            <input className="pf-input" type="date" value={endsOn ?? ''} onChange={(event) => setEndsOn(event.target.value)} />
          </label>
        </div>

        <label className="pf-field">
          <span className="pf-field__label">Description</span>
          <textarea
            className="pf-textarea"
            rows={3}
            maxLength={500}
            value={description}
            placeholder="What this class covers, and who it is for."
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy || name.trim().length < 2} onClick={save}>
            {busy ? 'Saving…' : row ? 'Save class' : 'Create class'}
          </button>
          <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Card>
  )
}

/** The selected class: invite code, quick facts, status and destructive actions. */
function ClassPanel({
  row,
  copied,
  onCopy,
  onDone,
}: {
  row: ClassRow
  copied: boolean
  onCopy: (code: string) => void
  onDone: (message: string, select: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function act(action: 'archive' | 'reopen' | 'pause' | 'resume') {
    setBusy(action)
    setFailure(null)
    try {
      await api(`/lecturer/classes/${row.id}/status`, { method: 'POST', body: { action } })
      onDone(`${row.name}: ${action}d.`, row.id)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That action could not be completed.')
      setBusy(null)
    }
  }

  async function rotateInvite() {
    setBusy('invite')
    setFailure(null)
    try {
      const result = await api<{ inviteCode: string }>(`/lecturer/classes/${row.id}/invite-code`, { method: 'POST' })
      onDone(`New invite code for "${row.name}": ${result.inviteCode}`, row.id)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'The invite code could not be regenerated.')
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('delete')
    setFailure(null)
    try {
      await api(`/lecturer/classes/${row.id}`, { method: 'DELETE' })
      onDone(`"${row.name}" deleted.`, null)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That class could not be deleted.')
      setBusy(null)
    }
  }

  if (editing) {
    return <ClassEditor row={row} onDone={onDone} onCancel={() => setEditing(false)} />
  }

  return (
    <Card
      title={row.name}
      meta={
        <div className="pf-chips">
          <Badge tone={statusTone(row.status)}>{row.status === 'ACTIVE' ? 'Active' : 'Archived'}</Badge>
          {row.simulationPaused && <Badge tone="warn">Simulation paused</Badge>}
        </div>
      }
    >
      {failure && (
        <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }}>
          {failure}
        </div>
      )}

      <div className="pf-inline-stats">
        <span>
          <strong>{formatNumber(row.students)}</strong> student{row.students === 1 ? '' : 's'}
        </span>
        <span>
          <strong>{formatNumber(row.pending)}</strong> pending
        </span>
        <span>
          <strong>{formatNumber(row.assignments)}</strong> assignment{row.assignments === 1 ? '' : 's'}
        </span>
      </div>

      {row.description && <p className="pf-card__note">{row.description}</p>}

      <div className="pf-dl" style={{ marginTop: 12 }}>
        <dt>Term</dt>
        <dd>{row.term || <span className="pf-muted">Not set</span>}</dd>
        <dt>Runs</dt>
        <dd>
          {formatDate(row.startsOn)} → {formatDate(row.endsOn)}
        </dd>
      </div>

      <div className="pf-card" style={{ marginTop: 14 }}>
        <header className="pf-card__head">
          <h2 className="pf-card__title">Invite code</h2>
          <span className="pf-card__meta">Students enter this to ask to join</span>
        </header>
        <div className="pf-inline-stats">
          <span className="pf-mono" style={{ fontSize: 22, letterSpacing: 3 }}>
            {row.inviteCode}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <button className="pf-btn pf-btn--sm" type="button" onClick={() => onCopy(row.inviteCode)}>
              {copied ? 'Copied' : 'Copy code'}
            </button>
          </span>
        </div>
      </div>

      <div className="pf-actions" style={{ marginTop: 14 }}>
        <Link className="pf-btn pf-btn--ghost" to={`/lecturer/classes/${row.id}`}>
          Open class
        </Link>
        <button className="pf-btn pf-btn--ghost" type="button" onClick={() => setEditing(true)}>
          Edit details
        </button>
        {row.status === 'ACTIVE' ? (
          <button className="pf-btn pf-btn--ghost" type="button" disabled={busy !== null} onClick={() => act('archive')}>
            {busy === 'archive' ? 'Archiving…' : 'Archive'}
          </button>
        ) : (
          <button className="pf-btn pf-btn--ghost" type="button" disabled={busy !== null} onClick={() => act('reopen')}>
            {busy === 'reopen' ? 'Reopening…' : 'Reopen'}
          </button>
        )}
        {row.simulationPaused ? (
          <button className="pf-btn pf-btn--ghost" type="button" disabled={busy !== null} onClick={() => act('resume')}>
            {busy === 'resume' ? 'Resuming…' : 'Resume simulation'}
          </button>
        ) : (
          <button className="pf-btn pf-btn--ghost" type="button" disabled={busy !== null} onClick={() => act('pause')}>
            {busy === 'pause' ? 'Pausing…' : 'Pause simulation'}
          </button>
        )}
        <button className="pf-btn pf-btn--ghost" type="button" disabled={busy !== null} onClick={rotateInvite}>
          {busy === 'invite' ? 'Regenerating…' : 'Regenerate code'}
        </button>
      </div>

      <div className="pf-actions" style={{ marginTop: 10 }}>
        {confirmDelete ? (
          <>
            <button className="pf-btn pf-btn--danger" type="button" disabled={busy !== null} onClick={remove}>
              {busy === 'delete' ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button className="pf-btn pf-btn--ghost" type="button" disabled={busy !== null} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="pf-btn pf-btn--ghost" type="button" onClick={() => setConfirmDelete(true)}>
            Delete class
          </button>
        )}
      </div>
      <p className="pf-card__note" style={{ marginTop: 8 }}>
        Deleting removes the class and its enrolment. Archiving instead keeps the records and hides
        it from active teaching.
      </p>
    </Card>
  )
}
