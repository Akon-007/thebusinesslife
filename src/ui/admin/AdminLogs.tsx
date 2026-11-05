import { useState } from 'react'
import {
  StateBlock,
  formatNumber,
  formatRelative,
  humaniseAction,
} from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * Activity logs.
 *
 * The audit trail: every meaningful action taken on the platform, who took it
 * and when. Search and category filters are applied by the server, so the totals
 * shown are the real ones rather than a count of the current page.
 */

interface LogEntry {
  id: string
  action: string
  detail: string
  at: string
  actor: string | null
  actorEmail: string | null
  actorRole: string | null
}

interface LogsPayload {
  logs: LogEntry[]
  total: number
  page: number
  pageSize: number
  pages: number
  categories: string[]
}

export function AdminLogs() {
  const [term, setTerm] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('ALL')
  const [page, setPage] = useState(1)

  const path = `/admin/insights/logs?q=${encodeURIComponent(query)}&category=${category}&page=${page}&pageSize=30`
  const { data, loading, error, reload } = useApi<LogsPayload>(path)

  function submitSearch() {
    setQuery(term.trim())
    setPage(1)
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Activity Logs</h1>
          <p>
            The platform&rsquo;s audit trail — sign-ins, profile changes, administrative actions and
            everything the system records. Search by action, detail, name or email address.
          </p>
        </div>
      </div>

      <div className="pf-toolbar">
        <input
          className="pf-input pf-input--grow"
          type="search"
          placeholder="Search actions, details, people or emails"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submitSearch()
          }}
        />
        <select
          className="pf-select"
          value={category}
          onChange={(event) => {
            setCategory(event.target.value)
            setPage(1)
          }}
        >
          <option value="ALL">All activity</option>
          {(data?.categories ?? []).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button className="pf-btn" type="button" onClick={submitSearch}>
          Search
        </button>
        <button className="pf-btn pf-btn--ghost" type="button" onClick={reload}>
          Refresh
        </button>
      </div>

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : data.logs.length === 0 ? (
        <StateBlock loading={false} error={null} empty="No activity matches these filters." />
      ) : (
        <section className="pf-card">
          <div className="pf-card__head">
            <h2 className="pf-card__title">
              {formatNumber(data.total)} entr{data.total === 1 ? 'y' : 'ies'}
            </h2>
            <span className="pf-card__meta">
              Page {data.page} of {data.pages}
            </span>
          </div>

          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Detail</th>
                  <th>Actor</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {humaniseAction(entry.action)}
                      <div className="pf-muted pf-mono" style={{ fontSize: 12 }}>
                        {entry.action}
                      </div>
                    </td>
                    <td>{entry.detail || <span className="pf-muted">—</span>}</td>
                    <td>
                      {entry.actor ? (
                        <>
                          {entry.actor}
                          {entry.actorEmail && (
                            <div className="pf-muted" style={{ fontSize: 12 }}>
                              {entry.actorEmail}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="pf-muted">system</span>
                      )}
                    </td>
                    <td>{formatRelative(entry.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pf-pager">
            <span>
              Page {data.page} of {data.pages} — {formatNumber(data.total)} entr
              {data.total === 1 ? 'y' : 'ies'}
            </span>
            <div className="pf-pager__buttons">
              <button
                className="pf-btn pf-btn--ghost pf-btn--sm"
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <button
                className="pf-btn pf-btn--ghost pf-btn--sm"
                type="button"
                disabled={data.page >= data.pages}
                onClick={() => setPage((current) => current + 1)}
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
