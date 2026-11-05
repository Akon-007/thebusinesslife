import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, StateBlock, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * Player management: search, filter and inspect every player account.
 *
 * The list is paged and filtered on the server, so the numbers shown here are
 * the real totals rather than a count of whatever happened to be loaded.
 */

export interface PlayerSummary {
  id: string
  fullName: string
  email: string
  status: 'ACTIVE' | 'SUSPENDED'
  emailVerified: boolean
  createdAt: string
  lastSeenAt: string | null
  businessName: string | null
  sector: string | null
  levelIndex: number | null
  stageIndex: number | null
  xp: number | null
  cash: number | null
  reputation: number | null
  completedLevels: number
}

interface PlayersResponse {
  players: PlayerSummary[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export function AdminPlayers() {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [verified, setVerified] = useState('ALL')
  const [page, setPage] = useState(1)

  // Typing should not fire a request per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(term.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [term])

  const path = `/admin/players?q=${encodeURIComponent(query)}&status=${status}&verified=${verified}&page=${page}`
  const { data, loading, error, reload } = useApi<PlayersResponse>(path)

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Players</h1>
          <p>
            Every registered player, with their company, progression and account state. Suspending
            an account blocks sign-in immediately and is written to the audit log.
          </p>
        </div>
      </div>

      <div className="pf-toolbar">
        <input
          className="pf-input pf-input--grow"
          type="search"
          placeholder="Search by name, email or business"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <select
          className="pf-select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            setPage(1)
          }}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select
          className="pf-select"
          value={verified}
          onChange={(e) => {
            setVerified(e.target.value)
            setPage(1)
          }}
        >
          <option value="ALL">Verified or not</option>
          <option value="YES">Email verified</option>
          <option value="NO">Not verified</option>
        </select>
        <button className="pf-btn pf-btn--ghost" type="button" onClick={reload}>
          Refresh
        </button>
      </div>

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : data.players.length === 0 ? (
        <StateBlock loading={false} error={null} empty="No players match these filters." />
      ) : (
        <section className="pf-card">
          <div className="pf-card__head">
            <h2 className="pf-card__title">
              {formatNumber(data.total)} player{data.total === 1 ? '' : 's'}
            </h2>
            <span className="pf-card__meta">
              Page {data.page} of {data.pages}
            </span>
          </div>

          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Business</th>
                  <th className="pf-table__num">Level</th>
                  <th className="pf-table__num">Completed</th>
                  <th>Status</th>
                  <th>Last seen</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.players.map((player) => (
                  <tr key={player.id}>
                    <td>
                      <button
                        className="pf-row-link"
                        type="button"
                        onClick={() => navigate(`/admin/players/${player.id}`)}
                      >
                        {player.fullName}
                      </button>
                      <div className="pf-muted" style={{ fontSize: 12 }}>
                        {player.email}
                      </div>
                    </td>
                    <td>
                      {player.businessName ? (
                        <>
                          {player.businessName}
                          <div className="pf-muted" style={{ fontSize: 12 }}>
                            {player.sector}
                          </div>
                        </>
                      ) : (
                        <span className="pf-muted">No company yet</span>
                      )}
                    </td>
                    <td className="pf-table__num">{player.levelIndex ?? '—'}</td>
                    <td className="pf-table__num">{player.completedLevels}</td>
                    <td>
                      <div className="pf-chips">
                        {player.status === 'SUSPENDED' ? (
                          <Badge tone="bad">Suspended</Badge>
                        ) : player.emailVerified ? (
                          <Badge tone="good">Active</Badge>
                        ) : (
                          <Badge tone="warn">Unverified</Badge>
                        )}
                      </div>
                    </td>
                    <td>{player.lastSeenAt ? formatRelative(player.lastSeenAt) : <span className="pf-muted">Never</span>}</td>
                    <td>
                      <button
                        className="pf-btn pf-btn--ghost pf-btn--sm"
                        type="button"
                        onClick={() => navigate(`/admin/players/${player.id}`)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pf-pager">
            <span>
              Showing {formatNumber(data.players.length)} of {formatNumber(data.total)}
            </span>
            <div className="pf-pager__buttons">
              <button
                className="pf-btn pf-btn--ghost pf-btn--sm"
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                className="pf-btn pf-btn--ghost pf-btn--sm"
                type="button"
                disabled={data.page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
