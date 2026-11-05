import { useEffect, useState } from 'react'
import { ApiError, api } from '../../api/client'
import { useAuthStore } from '../../state/authStore'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * Users & permissions.
 *
 * The staff who run the platform — administrators and lecturers — and the
 * administrative areas each administrator may reach. The server is the authority
 * on permissions: an empty grant means full access, and only ADMIN accounts carry
 * grants at all. This screen reflects that model rather than inventing one.
 */

interface Option {
  value: string
  label: string
}

interface Staff {
  id: string
  email: string
  fullName: string
  role: 'ADMIN' | 'LECTURER'
  status: 'ACTIVE' | 'SUSPENDED'
  emailVerified: boolean
  permissions: string[]
  classes: number
  createdAt: string
  lastSeenAt: string | null
}

interface UsersPayload {
  users: Staff[]
  total: number
  admins: number
  lecturers: number
  meta: { permissions: Option[]; roles: string[]; statuses: string[] }
}

function permissionSummary(user: Staff): string {
  if (user.role !== 'ADMIN') return '—'
  if (user.permissions.length === 0) return 'Full access'
  return `${user.permissions.length} area${user.permissions.length === 1 ? '' : 's'}`
}

export function AdminUsers() {
  const currentUser = useAuthStore((state) => state.user)
  const [term, setTerm] = useState('')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(term.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [term])

  const path = `/admin/system/users?q=${encodeURIComponent(query)}&role=${role}`
  const { data, loading, error, reload } = useApi<UsersPayload>(path)

  const rows = data?.users ?? []
  const selected = selectedId ? rows.find((user) => user.id === selectedId) ?? null : null
  const permissions = data?.meta.permissions ?? []

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Users &amp; Permissions</h1>
          <p>
            The administrators and lecturers who run the platform. Permission grants apply only to
            administrator accounts, and an empty selection means full access — the server enforces
            the areas listed here.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Staff" value={data ? formatNumber(data.total) : '—'} sub="Administrators and lecturers" />
        <StatTile label="Administrators" value={data ? formatNumber(data.admins) : '—'} sub="Full or scoped access" tone="accent" />
        <StatTile label="Lecturers" value={data ? formatNumber(data.lecturers) : '—'} sub="Classroom teaching staff" />
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}

      <div className="pf-toolbar">
        <input
          className="pf-input pf-input--grow"
          type="search"
          placeholder="Search by name or email"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <select className="pf-select" value={role} onChange={(event) => setRole(event.target.value)}>
          <option value="ALL">All staff</option>
          <option value="ADMIN">Administrators</option>
          <option value="LECTURER">Lecturers</option>
        </select>
        <button className="pf-btn pf-btn--ghost" type="button" onClick={reload}>
          Refresh
        </button>
      </div>

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <StateBlock loading={false} error={null} empty="No staff match these filters." />
      ) : (
        <Card title="Staff" meta={`${formatNumber(data.total)} account${data.total === 1 ? '' : 's'}`}>
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Permissions</th>
                  <th className="pf-table__num">Classes</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <button
                        className="pf-row-link"
                        type="button"
                        onClick={() => setSelectedId(user.id)}
                      >
                        {user.fullName}
                      </button>
                      <div className="pf-muted" style={{ fontSize: 12 }}>
                        {user.email}
                      </div>
                    </td>
                    <td>{user.role === 'ADMIN' ? 'Administrator' : 'Lecturer'}</td>
                    <td>
                      {user.status === 'SUSPENDED' ? (
                        <Badge tone="bad">Suspended</Badge>
                      ) : user.emailVerified ? (
                        <Badge tone="good">Active</Badge>
                      ) : (
                        <Badge tone="warn">Unverified</Badge>
                      )}
                    </td>
                    <td>{permissionSummary(user)}</td>
                    <td className="pf-table__num">{formatNumber(user.classes)}</td>
                    <td>{user.lastSeenAt ? formatRelative(user.lastSeenAt) : <span className="pf-muted">Never</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selected && (
        <UserEditor
          key={`${selected.id}:${selected.role}:${selected.permissions.join(',')}:${selected.status}`}
          user={selected}
          permissions={permissions}
          isSelf={currentUser?.id === selected.id}
          onFlash={setFlash}
          onChanged={reload}
        />
      )}
    </>
  )
}

function UserEditor({
  user,
  permissions,
  isSelf,
  onFlash,
  onChanged,
}: {
  user: Staff
  permissions: Option[]
  isSelf: boolean
  onFlash: (message: string) => void
  onChanged: () => void
}) {
  const [role, setRole] = useState<Staff['role']>(user.role)
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(user.permissions)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function changeRole(next: Staff['role']) {
    if (next === user.role) return
    setRole(next)
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/system/users/${user.id}/role`, { method: 'PUT', body: { role: next } })
      onFlash(`${user.fullName} is now ${next === 'ADMIN' ? 'an administrator' : 'a lecturer'}.`)
      onChanged()
    } catch (cause) {
      setRole(user.role)
      setFailure(cause instanceof ApiError ? cause.message : 'That role change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  function togglePermission(value: string) {
    setSelectedPermissions((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    )
  }

  async function savePermissions() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/system/users/${user.id}/permissions`, {
        method: 'PUT',
        body: { permissions: selectedPermissions },
      })
      onFlash(
        selectedPermissions.length === 0
          ? `${user.fullName} now has full access.`
          : `Permissions updated for ${user.fullName}.`,
      )
      onChanged()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'Those permissions could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function setStatus(next: 'suspend' | 'restore') {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/system/users/${user.id}/${next}`, { method: 'POST' })
      onFlash(
        next === 'suspend'
          ? `${user.fullName}'s account was suspended.`
          : `${user.fullName}'s account was restored.`,
      )
      onChanged()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const permissionsDirty =
    selectedPermissions.length !== user.permissions.length ||
    selectedPermissions.some((value) => !user.permissions.includes(value))

  return (
    <div className="pf-split">
      <Card title="Account">
        <dl className="pf-dl">
          <dt>Name</dt>
          <dd>{user.fullName}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>{user.role === 'ADMIN' ? 'Administrator' : 'Lecturer'}</dd>
          <dt>Status</dt>
          <dd>
            {user.status === 'SUSPENDED' ? <Badge tone="bad">Suspended</Badge> : <Badge tone="good">Active</Badge>}
          </dd>
          <dt>Classes</dt>
          <dd>{formatNumber(user.classes)}</dd>
          <dt>Joined</dt>
          <dd>{formatRelative(user.createdAt)}</dd>
          <dt>Last seen</dt>
          <dd>{user.lastSeenAt ? formatRelative(user.lastSeenAt) : <span className="pf-muted">Never</span>}</dd>
        </dl>
      </Card>

      <Card title="Permissions" meta={user.role === 'ADMIN' ? permissionSummary(user) : 'Not an administrator'}>
        <div className="pf-form">
          {failure && <div className="pf-notice pf-notice--bad">{failure}</div>}

          {isSelf ? (
            <p className="pf-card__note">
              This is the account you are signed in with. You cannot change your own role or suspend
              your own account.
            </p>
          ) : (
            <label className="pf-field">
              <span className="pf-field__label">Role</span>
              <select
                className="pf-select"
                value={role}
                disabled={busy}
                onChange={(event) => changeRole(event.target.value as Staff['role'])}
              >
                <option value="ADMIN">Administrator</option>
                <option value="LECTURER">Lecturer</option>
              </select>
              <span className="pf-field__hint">
                Lecturers run classrooms; administrators manage the platform.
              </span>
            </label>
          )}

          {user.role === 'ADMIN' ? (
            <>
              <p className="pf-card__note">
                Leave every area unticked to grant full access — this is how an administrator who
                pre-dates the permission list keeps working. The server enforces exactly what is
                ticked here.
              </p>
              <div className="pf-field">
                <span className="pf-field__label">Administrative areas</span>
                <div className="pf-picker">
                  {permissions.map((option) => {
                    const on = selectedPermissions.includes(option.value)
                    return (
                      <button
                        key={option.value}
                        className={`pf-picker__opt${on ? ' pf-picker__opt--on' : ''}`}
                        type="button"
                        aria-pressed={on}
                        disabled={busy}
                        onClick={() => togglePermission(option.value)}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                <span className="pf-field__hint">
                  {selectedPermissions.length === 0
                    ? 'Full access — every administrative area.'
                    : `${selectedPermissions.length} area${selectedPermissions.length === 1 ? '' : 's'} granted.`}
                </span>
              </div>
              <div className="pf-actions">
                <button
                  className="pf-btn"
                  type="button"
                  disabled={busy || !permissionsDirty}
                  onClick={savePermissions}
                >
                  {busy ? 'Saving…' : 'Save permissions'}
                </button>
              </div>
            </>
          ) : (
            <p className="pf-card__note">
              Lecturer accounts do not carry administrative permissions. Promote the account to an
              administrator to grant areas.
            </p>
          )}

          {!isSelf && (
            <div className="pf-actions">
              {user.status === 'SUSPENDED' ? (
                <button
                  className="pf-btn pf-btn--good"
                  type="button"
                  disabled={busy}
                  onClick={() => setStatus('restore')}
                >
                  Restore account
                </button>
              ) : (
                <button
                  className="pf-btn pf-btn--danger"
                  type="button"
                  disabled={busy}
                  onClick={() => setStatus('suspend')}
                >
                  Suspend account
                </button>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
