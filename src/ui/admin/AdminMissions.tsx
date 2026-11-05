import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api } from '../../api/client'
import { LEVEL_BY_ID } from '../../data/beginnerLevels'
import {
  Badge,
  Card,
  StateBlock,
  StatTile,
  formatNumber,
  formatRelative,
} from '../portal/common'
import { useApi } from '../portal/useApi'
import type { AdminMission, Vocabulary } from './contentApi'

/**
 * The Mission Builder's index.
 *
 * Only published missions reach players. A draft is visible here and nowhere
 * else, which is what makes the author-review-publish cycle real rather than a
 * label on a form.
 */

interface MissionListPayload {
  missions: AdminMission[]
  total: number
  summary: { total: number; published: number; draft: number }
}

export function AdminMissions() {
  const navigate = useNavigate()
  const vocabulary = useApi<Vocabulary>('/admin/content/meta')

  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [levelId, setLevelId] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [type, setType] = useState('ALL')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [q])

  const params = new URLSearchParams()
  if (debouncedQ) params.set('q', debouncedQ)
  if (levelId !== 'ALL') params.set('levelId', levelId)
  if (status !== 'ALL') params.set('status', status)
  if (type !== 'ALL') params.set('type', type)
  const query = params.toString()

  const list = useApi<MissionListPayload>(`/admin/content/missions${query ? `?${query}` : ''}`)

  async function act(id: string, action: 'publish' | 'unpublish') {
    setBusyId(id)
    setFailure(null)
    try {
      await api(`/admin/content/missions/${id}/${action}`, { method: 'POST' })
      list.reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That action could not be completed.')
    } finally {
      setBusyId(null)
    }
  }

  const typeLabel = (value: string) =>
    vocabulary.data?.missionTypes.find((entry) => entry.value === value)?.label ?? value

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Mission Builder</h1>
          <p>
            Missions are authored against a level and published when they are ready. A published
            mission replaces the catalogue mission for that level the next time a player enters the
            city; unpublishing it puts the original back.
          </p>
        </div>
        <div className="pf-actions">
          <button className="pf-btn" type="button" onClick={() => navigate('/admin/missions/new')}>
            New mission
          </button>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Missions" value={list.data ? formatNumber(list.data.summary.total) : '—'} sub="Authored in the portal" />
        <StatTile
          label="Published"
          value={list.data ? formatNumber(list.data.summary.published) : '—'}
          sub="Live for players"
          tone="good"
        />
        <StatTile
          label="Drafts"
          value={list.data ? formatNumber(list.data.summary.draft) : '—'}
          sub="Not visible to players"
          tone={list.data && list.data.summary.draft > 0 ? 'warn' : ''}
        />
      </div>

      {failure && <div className="pf-notice pf-notice--bad">{failure}</div>}

      <Card title="All missions" meta={list.data ? `${list.data.total} matching` : undefined}>
        <div className="pf-toolbar" style={{ marginBottom: 16 }}>
          <input
            className="pf-input pf-input--grow"
            placeholder="Search title or briefing…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <select className="pf-select" value={levelId} onChange={(event) => setLevelId(event.target.value)}>
            <option value="ALL">All levels</option>
            {(vocabulary.data?.levels ?? []).map((level) => (
              <option key={level} value={level}>
                {level} — {LEVEL_BY_ID[level]?.title ?? 'Unknown'}
              </option>
            ))}
          </select>
          <select className="pf-select" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ALL">Any status</option>
            <option value="PUBLISHED">Published</option>
            <option value="DRAFT">Draft</option>
          </select>
          <select className="pf-select" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="ALL">Any type</option>
            {(vocabulary.data?.missionTypes ?? []).map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        {list.loading || list.error ? (
          <StateBlock loading={list.loading} error={list.error} onRetry={list.reload} />
        ) : (list.data?.missions.length ?? 0) === 0 ? (
          <p className="pf-card__note">
            No missions match these filters. Missions authored here supplement the built-in missions
            that ship with each level.
          </p>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead>
                <tr>
                  <th>Mission</th>
                  <th>Level</th>
                  <th>Type</th>
                  <th className="pf-table__num">Objectives</th>
                  <th className="pf-table__num">XP</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data?.missions.map((mission) => (
                  <tr key={mission.id}>
                    <td>
                      <Link className="pf-row-link" to={`/admin/missions/${mission.id}`}>
                        {mission.title}
                      </Link>
                      <div className="pf-feed__meta">
                        {mission.description.slice(0, 72)}
                        {mission.description.length > 72 ? '…' : ''}
                      </div>
                    </td>
                    <td>
                      {mission.levelId}
                      <div className="pf-feed__meta">{LEVEL_BY_ID[mission.levelId]?.title ?? '—'}</div>
                    </td>
                    <td>{typeLabel(mission.type)}</td>
                    <td className="pf-table__num">
                      {formatNumber(mission.objectives.length)}
                      <div className="pf-feed__meta">
                        {mission.objectives.filter((o) => o.kind === 'required').length} required
                      </div>
                    </td>
                    <td className="pf-table__num">{formatNumber(mission.xpReward)}</td>
                    <td>
                      <Badge tone={mission.status === 'PUBLISHED' ? 'good' : 'warn'}>
                        {mission.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                      </Badge>
                    </td>
                    <td>{formatRelative(mission.updatedAt)}</td>
                    <td>
                      <div className="pf-actions">
                        <button
                          className={`pf-btn pf-btn--sm ${mission.status === 'PUBLISHED' ? 'pf-btn--ghost' : 'pf-btn--good'}`}
                          type="button"
                          disabled={busyId === mission.id}
                          onClick={() =>
                            act(mission.id, mission.status === 'PUBLISHED' ? 'unpublish' : 'publish')
                          }
                        >
                          {busyId === mission.id
                            ? 'Working…'
                            : mission.status === 'PUBLISHED'
                              ? 'Unpublish'
                              : 'Publish'}
                        </button>
                      </div>
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
