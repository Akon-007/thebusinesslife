import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api } from '../../api/client'
import { LEVEL_BY_ID } from '../../data/beginnerLevels'
import { STAGES } from '../../data/stages'
import {
  Card,
  StateBlock,
  StatTile,
  formatMoney,
  formatNumber,
  formatRelative,
  humaniseAction,
} from '../portal/common'
import { useApi } from '../portal/useApi'
import type { PlayerSummary } from './AdminPlayers'

/**
 * A single player's record.
 *
 * Shows what the player built, how far they have progressed and what the
 * platform has recorded them doing. Suspension is confirmed before it is sent,
 * and takes effect on the player's very next request.
 */

interface PlayerDetail {
  player: PlayerSummary
  business: {
    businessName: string
    sector: string
    idea: string
    description: string
    problem: string
    product: string
    ambition: string | null
    updatedAt: string
  } | null
  progress: {
    levelIndex: number
    stageIndex: number
    xp: number
    cash: number
    reputation: number
    completedLevels: string[]
  } | null
  history: { id: string; action: string; detail: string; at: string }[]
}

export function AdminPlayerDetail() {
  const { id } = useParams<{ id: string }>()
  const { data, loading, error, reload } = useApi<PlayerDetail>(id ? `/admin/players/${id}` : null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  async function changeStatus(action: 'suspend' | 'restore') {
    if (!id) return
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/players/${id}/${action}`, { method: 'POST' })
      setNotice(action === 'suspend' ? 'Account suspended.' : 'Account restored.')
      setConfirming(false)
      reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  if (loading || error || !data) {
    return (
      <>
        <Link className="pf-row-link" to="/admin/players">
          ← Back to players
        </Link>
        <StateBlock loading={loading} error={error} onRetry={reload} />
      </>
    )
  }

  const { player, business, progress, history } = data
  const stage = STAGES.find((s) => s.index === (progress?.stageIndex ?? 1))

  return (
    <>
      <div className="pf-page-head">
        <div>
          <Link className="pf-row-link" to="/admin/players">
            ← Back to players
          </Link>
          <h1 style={{ marginTop: 8 }}>{player.fullName}</h1>
          <p>
            {player.email} · registered {formatRelative(player.createdAt)}
            {player.lastSeenAt ? ` · last seen ${formatRelative(player.lastSeenAt)}` : ' · never signed in'}
          </p>
        </div>
        <div className="pf-actions">
          {player.status === 'SUSPENDED' ? (
            <button className="pf-btn pf-btn--good" type="button" disabled={busy} onClick={() => changeStatus('restore')}>
              {busy ? 'Working…' : 'Restore account'}
            </button>
          ) : confirming ? (
            <>
              <button className="pf-btn pf-btn--danger" type="button" disabled={busy} onClick={() => changeStatus('suspend')}>
                {busy ? 'Suspending…' : 'Confirm suspension'}
              </button>
              <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="pf-btn pf-btn--ghost" type="button" onClick={() => setConfirming(true)}>
              Suspend account
            </button>
          )}
        </div>
      </div>

      {notice && <div className="pf-notice pf-notice--good">{notice}</div>}
      {failure && <div className="pf-notice pf-notice--bad">{failure}</div>}
      {confirming && !notice && (
        <div className="pf-notice">
          Suspending <strong>{player.fullName}</strong> signs them out of the player application and blocks
          further sign-in until the account is restored. This action is recorded in the audit log.
        </div>
      )}

      <div className="pf-stats">
        <StatTile label="Account" value={player.status === 'SUSPENDED' ? 'Suspended' : 'Active'} sub={player.emailVerified ? 'Email verified' : 'Email not verified'} tone={player.status === 'SUSPENDED' ? 'warn' : 'good'} />
        <StatTile label="Level reached" value={progress ? formatNumber(progress.levelIndex) : '—'} sub={stage ? `Stage ${stage.index} — ${stage.name}` : 'Not started'} tone="accent" />
        <StatTile label="Levels completed" value={progress ? formatNumber(progress.completedLevels.length) : '—'} sub="of 15 in Beginner" />
        <StatTile label="XP" value={progress ? formatNumber(progress.xp) : '—'} sub={progress ? `${formatNumber(progress.reputation)} reputation` : undefined} />
      </div>

      <div className="pf-cols pf-cols--2">
        <Card title="Business" meta={business ? business.sector : 'None'}>
          {business ? (
            <dl className="pf-dl">
              <dt>Name</dt>
              <dd>{business.businessName}</dd>
              <dt>Sector</dt>
              <dd>{business.sector}</dd>
              <dt>Idea</dt>
              <dd>{business.idea}</dd>
              <dt>Description</dt>
              <dd>{business.description}</dd>
              <dt>Problem solved</dt>
              <dd>{business.problem}</dd>
              <dt>Product</dt>
              <dd>{business.product}</dd>
              <dt>Ambition</dt>
              <dd>{business.ambition ?? <span className="pf-muted">Not set</span>}</dd>
              <dt>Last updated</dt>
              <dd>{formatRelative(business.updatedAt)}</dd>
            </dl>
          ) : (
            <p className="pf-card__note">
              This player has not created a business yet. They cannot enter the city until they do.
            </p>
          )}
        </Card>

        <Card title="Progression" meta={progress ? `Cash ${formatMoney(progress.cash)}` : 'Not started'}>
          {progress ? (
            <>
              <p className="pf-card__note" style={{ marginBottom: 12 }}>
                Completed levels, in order:
              </p>
              <div className="pf-chips">
                {progress.completedLevels.length === 0 ? (
                  <span className="pf-muted">None completed yet.</span>
                ) : (
                  progress.completedLevels.map((levelId) => (
                    <span className="pf-chip" key={levelId}>
                      {levelId} · {LEVEL_BY_ID[levelId]?.title ?? 'Unknown level'}
                    </span>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="pf-card__note">
              No progression has been recorded for this player. Progress is captured once they enter
              the game world.
            </p>
          )}
        </Card>
      </div>

      <Card title="Account history" meta={`${history.length} recorded events`}>
        {history.length === 0 ? (
          <p className="pf-card__note">Nothing has been recorded for this account yet.</p>
        ) : (
          <div className="pf-feed">
            {history.map((event) => (
              <div className="pf-feed__item" key={event.id}>
                <span className="pf-feed__dot" />
                <div className="pf-feed__body">
                  <div className="pf-feed__title">{humaniseAction(event.action)}</div>
                  <div className="pf-feed__meta">
                    {event.detail} · {formatRelative(event.at)}
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
