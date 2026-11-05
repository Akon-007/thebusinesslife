import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import type { NotificationsPayload } from './api'

/**
 * Notifications.
 *
 * The same notification stream the rest of the platform writes to — a message
 * from the administrator, a grade confirmation, a classroom change. Unread items
 * are counted and can be marked read individually or all at once.
 */
export function LecturerNotifications() {
  const { data, loading, error, reload } = useApi<NotificationsPayload>('/lecturer/notifications')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const rows = data?.notifications ?? []
  const unread = data?.unread ?? 0

  async function markRead(id?: string) {
    setBusyId(id ?? 'all')
    setFlash(null)
    setFailure(null)
    try {
      await api('/lecturer/notifications/read', { method: 'POST', body: id ? { id } : {} })
      setFlash(id ? 'Notification marked as read.' : 'All notifications marked as read.')
      reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That action could not be completed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Notifications</h1>
          <p>Messages and confirmations from across BUSINESSLIFE.</p>
        </div>
        <div className="pf-actions">
          <button className="pf-btn pf-btn--ghost" type="button" disabled={unread === 0 || busyId !== null} onClick={() => markRead()}>
            {busyId === 'all' ? 'Marking…' : 'Mark all read'}
          </button>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Unread" value={formatNumber(unread)} sub={unread > 0 ? 'Needs your attention' : 'All caught up'} tone={unread > 0 ? 'warn' : ''} />
        <StatTile label="Total" value={data ? formatNumber(rows.length) : '—'} sub="Most recent 50" />
      </div>

      {flash && <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>{flash}</div>}
      {failure && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 16 }}>{failure}</div>}

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <StateBlock loading={false} error={null} empty="You have no notifications yet." />
      ) : (
        <Card title="Inbox">
          <div className="pf-feed">
            {rows.map((notification) => (
              <div className="pf-feed__item" key={notification.id}>
                <span className={`pf-feed__dot${notification.read ? '' : ' pf-feed__dot--admin'}`} />
                <div className="pf-feed__body" style={{ flex: 1 }}>
                  <div className="pf-feed__title">
                    {notification.title}{' '}
                    {!notification.read && <Badge tone="warn">New</Badge>}{' '}
                    <Badge>{notification.kind}</Badge>
                  </div>
                  <div className="pf-feed__meta">
                    {notification.body} · {formatRelative(notification.createdAt)}
                  </div>
                </div>
                {!notification.read && (
                  <button
                    className="pf-btn pf-btn--ghost pf-btn--sm"
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => markRead(notification.id)}
                  >
                    {busyId === notification.id ? 'Marking…' : 'Mark read'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  )
}
