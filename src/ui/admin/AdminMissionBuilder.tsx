import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api } from '../../api/client'
import { LEVEL_BY_ID } from '../../data/beginnerLevels'
import type { ObjectiveType } from '../../types/mission'
import { Badge, Card, StateBlock, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  emptyDraft,
  emptyObjective,
  draftFromMission,
  draftToPayload,
  type AdminMission,
  type DraftObjective,
  type MissionDraft,
  type Vocabulary,
} from './contentApi'

/**
 * The Mission Builder.
 *
 * Every field the specification calls for is here: identity and type, the
 * stage/level it belongs to, required and optional objectives, prerequisites,
 * NPC and location requirements, completion conditions, evaluation criteria,
 * XP rewards, failure conditions and recovery instructions.
 *
 * A mission is saved as a draft. It only becomes part of the game when it is
 * published, and the preview shows exactly what the player will read.
 */

export function AdminMissionBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const vocabulary = useApi<Vocabulary>('/admin/content/meta')
  const existing = useApi<{ mission: AdminMission }>(id ? `/admin/content/missions/${id}` : null)

  const [draft, setDraft] = useState<MissionDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(
    (location.state as { notice?: string } | null)?.notice ?? null,
  )
  const [failure, setFailure] = useState<string | null>(null)

  // The form is seeded once the mission (or the decision that there isn't one)
  // has arrived. It is not re-seeded on every render, so edits are never lost.
  useEffect(() => {
    if (!id) {
      setDraft(emptyDraft('L1'))
      return
    }
    if (existing.data) setDraft(draftFromMission(existing.data.mission))
  }, [id, existing.data])

  if (!id && !draft) return null

  if (id && (existing.loading || existing.error || !draft)) {
    return (
      <>
        <Link className="pf-row-link" to="/admin/missions">
          ← Back to missions
        </Link>
        <StateBlock loading={existing.loading} error={existing.error} onRetry={existing.reload} />
      </>
    )
  }

  if (!draft) return null

  const mission = existing.data?.mission ?? null
  const isPublished = mission?.status === 'PUBLISHED'
  const requiredCount = draft.objectives.filter((objective) => objective.kind === 'required').length

  function set<K extends keyof MissionDraft>(key: K, value: MissionDraft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  function updateObjective(index: number, patch: Partial<DraftObjective>) {
    setDraft((current) => {
      if (!current) return current
      return {
        ...current,
        objectives: current.objectives.map((objective, i) =>
          i === index ? { ...objective, ...patch } : objective,
        ),
      }
    })
  }

  function addObjective() {
    setDraft((current) =>
      current ? { ...current, objectives: [...current.objectives, emptyObjective()] } : current,
    )
  }

  function removeObjective(index: number) {
    setDraft((current) =>
      current ? { ...current, objectives: current.objectives.filter((_, i) => i !== index) } : current,
    )
  }

  function moveObjective(index: number, delta: number) {
    setDraft((current) => {
      if (!current) return current
      const target = index + delta
      if (target < 0 || target >= current.objectives.length) return current
      const objectives = [...current.objectives]
      const [moved] = objectives.splice(index, 1)
      objectives.splice(target, 0, moved)
      return { ...current, objectives }
    })
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    setFailure(null)
    try {
      const payload = draftToPayload(draft)
      if (id) {
        await api(`/admin/content/missions/${id}`, { method: 'PUT', body: payload })
        setNotice('Mission saved. Publish it when you are ready for players to see it.')
        existing.reload()
      } else {
        const created = await api<{ mission: AdminMission }>('/admin/content/missions', {
          method: 'POST',
          body: payload,
        })
        navigate(`/admin/missions/${created.mission.id}`, {
          replace: true,
          state: { notice: 'Mission created as a draft. Publish it when it is ready.' },
        })
      }
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That mission could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function act(action: 'publish' | 'unpublish' | 'delete') {
    if (!id) return
    setBusy(true)
    setFailure(null)
    try {
      if (action === 'delete') {
        await api(`/admin/content/missions/${id}`, { method: 'DELETE' })
        navigate('/admin/missions', { replace: true })
        return
      }
      await api(`/admin/content/missions/${id}/${action}`, { method: 'POST' })
      setNotice(action === 'publish' ? 'Mission published to players.' : 'Mission returned to draft.')
      existing.reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const typeLabel = (value: string) =>
    vocabulary.data?.missionTypes.find((entry) => entry.value === value)?.label ?? value

  return (
    <>
      <div className="pf-page-head">
        <div>
          <Link className="pf-row-link" to="/admin/missions">
            ← Back to missions
          </Link>
          <h1 style={{ marginTop: 8 }}>{mission ? mission.title : 'New mission'}</h1>
          <p>
            {mission
              ? `For ${mission.levelId} — ${LEVEL_BY_ID[mission.levelId]?.title ?? 'level'}. ${isPublished ? 'Live for players.' : 'Draft: not visible to players.'}`
              : 'Author the mission, save it as a draft, then publish it when it is ready.'}
          </p>
        </div>
        <div className="pf-actions">
          {mission && (
            <Badge tone={isPublished ? 'good' : 'warn'}>{isPublished ? 'Published' : 'Draft'}</Badge>
          )}
          {isPublished ? (
            <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={() => act('unpublish')}>
              Unpublish
            </button>
          ) : (
            mission && (
              <button className="pf-btn pf-btn--good" type="button" disabled={busy} onClick={() => act('publish')}>
                Publish
              </button>
            )
          )}
        </div>
      </div>

      {notice && <div className="pf-notice pf-notice--good">{notice}</div>}
      {failure && <div className="pf-notice pf-notice--bad">{failure}</div>}
      {requiredCount === 0 && (
        <div className="pf-notice">
          This mission has no required objective. A mission with only optional work can never be
          completed, so the server will refuse to save it.
        </div>
      )}

      <div className="pf-cols pf-cols--2">
        <div className="pf-col-stack">
          <Card title="Identity">
            <div className="pf-form">
              <div className="pf-field-row">
                <label className="pf-field">
                  <span className="pf-field__label">Level</span>
                  <select
                    className="pf-select"
                    value={draft.levelId}
                    onChange={(event) => set('levelId', event.target.value)}
                  >
                    {(vocabulary.data?.levels ?? ['L1']).map((level) => (
                      <option key={level} value={level}>
                        {level} — {LEVEL_BY_ID[level]?.title ?? 'Unknown'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pf-field">
                  <span className="pf-field__label">Mission type</span>
                  <select
                    className="pf-select"
                    value={draft.type}
                    onChange={(event) => set('type', event.target.value)}
                  >
                    {(vocabulary.data?.missionTypes ?? []).map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pf-field">
                  <span className="pf-field__label">XP reward</span>
                  <input
                    className="pf-input"
                    type="number"
                    min={0}
                    value={draft.xpReward}
                    onChange={(event) => set('xpReward', Number(event.target.value) || 0)}
                  />
                </label>
              </div>

              <label className="pf-field">
                <span className="pf-field__label">Name</span>
                <input
                  className="pf-input pf-input--block"
                  value={draft.title}
                  onChange={(event) => set('title', event.target.value)}
                  placeholder="e.g. Price It Right"
                />
              </label>

              <label className="pf-field">
                <span className="pf-field__label">Description / briefing</span>
                <textarea
                  className="pf-textarea"
                  rows={4}
                  value={draft.description}
                  onChange={(event) => set('description', event.target.value)}
                  placeholder="The story the player reads when the level begins."
                />
              </label>

              <label className="pf-field">
                <span className="pf-field__label">Instructions</span>
                <textarea
                  className="pf-textarea"
                  rows={3}
                  value={draft.instructions}
                  onChange={(event) => set('instructions', event.target.value)}
                  placeholder="What to do, in practical terms. Shown to the player with the briefing."
                />
              </label>
            </div>
          </Card>

          <Card title="Objectives" meta={`${draft.objectives.length} · ${requiredCount} required`}>
            <div className="pf-form">
              {draft.objectives.map((objective, index) => (
                <div className="pf-objective" key={index}>
                  <div className="pf-objective__head">
                    <span className="pf-objective__index">Objective {index + 1}</span>
                    <div className="pf-actions">
                      <button
                        className="pf-btn pf-btn--ghost pf-btn--sm"
                        type="button"
                        onClick={() => moveObjective(index, -1)}
                        disabled={index === 0}
                      >
                        ↑
                      </button>
                      <button
                        className="pf-btn pf-btn--ghost pf-btn--sm"
                        type="button"
                        onClick={() => moveObjective(index, 1)}
                        disabled={index === draft.objectives.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        className="pf-btn pf-btn--ghost pf-btn--sm"
                        type="button"
                        onClick={() => removeObjective(index)}
                        disabled={draft.objectives.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="pf-field-row">
                    <label className="pf-field">
                      <span className="pf-field__label">Kind</span>
                      <select
                        className="pf-select"
                        value={objective.kind}
                        onChange={(event) =>
                          updateObjective(index, {
                            kind: event.target.value as DraftObjective['kind'],
                          })
                        }
                      >
                        <option value="required">Required</option>
                        <option value="optional">Optional</option>
                      </select>
                    </label>
                    <label className="pf-field">
                      <span className="pf-field__label">Watches for</span>
                      <select
                        className="pf-select"
                        value={objective.type}
                        onChange={(event) =>
                          updateObjective(index, { type: event.target.value as ObjectiveType })
                        }
                      >
                        {(vocabulary.data?.objectiveTypes ?? []).map((entry) => (
                          <option key={entry.value} value={entry.value}>
                            {entry.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="pf-field">
                      <span className="pf-field__label">Times</span>
                      <input
                        className="pf-input"
                        type="number"
                        min={1}
                        value={objective.count}
                        onChange={(event) =>
                          updateObjective(index, { count: Number(event.target.value) || 1 })
                        }
                      />
                    </label>
                  </div>

                  <label className="pf-field">
                    <span className="pf-field__label">Objective text</span>
                    <input
                      className="pf-input pf-input--block"
                      value={objective.text}
                      onChange={(event) => updateObjective(index, { text: event.target.value })}
                      placeholder="What the player is asked to do."
                    />
                  </label>

                  <div className="pf-field-row">
                    <label className="pf-field">
                      <span className="pf-field__label">Target id</span>
                      <input
                        className="pf-input"
                        value={objective.target}
                        onChange={(event) => updateObjective(index, { target: event.target.value })}
                        placeholder="e.g. market_price"
                      />
                    </label>
                    <label className="pf-field">
                      <span className="pf-field__label">Hint location</span>
                      <input
                        className="pf-input"
                        value={objective.hintLocation}
                        onChange={(event) => updateObjective(index, { hintLocation: event.target.value })}
                        placeholder="e.g. Balogun Market"
                      />
                    </label>
                    <label className="pf-field">
                      <span className="pf-field__label">Hint</span>
                      <input
                        className="pf-input"
                        value={objective.hint}
                        onChange={(event) => updateObjective(index, { hint: event.target.value })}
                        placeholder="Shown on the map"
                      />
                    </label>
                  </div>
                </div>
              ))}

              <div className="pf-actions">
                <button className="pf-btn pf-btn--ghost" type="button" onClick={addObjective}>
                  Add objective
                </button>
              </div>
            </div>
          </Card>

          <Card title="Requirements and conditions">
            <div className="pf-form">
              <div className="pf-field-row">
                <label className="pf-field">
                  <span className="pf-field__label">Prerequisites — one per line</span>
                  <textarea
                    className="pf-textarea"
                    rows={3}
                    value={draft.prerequisites}
                    onChange={(event) => set('prerequisites', event.target.value)}
                  />
                </label>
                <label className="pf-field">
                  <span className="pf-field__label">NPC requirements — one per line</span>
                  <textarea
                    className="pf-textarea"
                    rows={3}
                    value={draft.npcRequirements}
                    onChange={(event) => set('npcRequirements', event.target.value)}
                  />
                </label>
              </div>

              <div className="pf-field-row">
                <label className="pf-field">
                  <span className="pf-field__label">Location requirements — one per line</span>
                  <textarea
                    className="pf-textarea"
                    rows={3}
                    value={draft.locationRequirements}
                    onChange={(event) => set('locationRequirements', event.target.value)}
                  />
                </label>
                <label className="pf-field">
                  <span className="pf-field__label">Completion conditions — one per line</span>
                  <textarea
                    className="pf-textarea"
                    rows={3}
                    value={draft.completionConditions}
                    onChange={(event) => set('completionConditions', event.target.value)}
                  />
                </label>
              </div>

              <label className="pf-field">
                <span className="pf-field__label">Evaluation criteria — one per line</span>
                <textarea
                  className="pf-textarea"
                  rows={3}
                  value={draft.evaluationCriteria}
                  onChange={(event) => set('evaluationCriteria', event.target.value)}
                />
              </label>

              <label className="pf-field">
                <span className="pf-field__label">Failure conditions — one per line</span>
                <textarea
                  className="pf-textarea"
                  rows={3}
                  value={draft.failureConditions}
                  onChange={(event) => set('failureConditions', event.target.value)}
                />
              </label>

              <label className="pf-field">
                <span className="pf-field__label">Recovery instructions</span>
                <textarea
                  className="pf-textarea"
                  rows={3}
                  value={draft.recoveryInstructions}
                  onChange={(event) => set('recoveryInstructions', event.target.value)}
                  placeholder="What the player should do after a failure."
                />
              </label>
            </div>
          </Card>

          <div className="pf-actions">
            <button className="pf-btn" type="button" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : id ? 'Save mission' : 'Create draft'}
            </button>
            {mission && !isPublished && (
              <button className="pf-btn pf-btn--danger" type="button" disabled={busy} onClick={() => act('delete')}>
                Delete draft
              </button>
            )}
          </div>
        </div>

        <Card title="Player preview" meta={typeLabel(draft.type)}>
          <div className="pf-preview">
            <div className="pf-preview__eyebrow">
              {draft.levelId} · {LEVEL_BY_ID[draft.levelId]?.title ?? 'Level'}
            </div>
            <h3 className="pf-preview__title">{draft.title || 'Untitled mission'}</h3>
            <p className="pf-preview__body">{draft.description || 'No briefing written yet.'}</p>
            {draft.instructions && <p className="pf-preview__body">{draft.instructions}</p>}

            <div className="pf-preview__label">Objectives</div>
            {draft.objectives.length === 0 ? (
              <p className="pf-card__note">None.</p>
            ) : (
              <ul className="pf-preview__list">
                {draft.objectives.map((objective, index) => (
                  <li key={index}>
                    {objective.text || 'Untitled objective'}
                    {objective.count > 1 && <strong> ×{objective.count}</strong>}
                    {objective.kind === 'optional' && <span className="pf-chip"> optional</span>}
                  </li>
                ))}
              </ul>
            )}

            <div className="pf-preview__label">
              Reward — {formatNumber(Math.max(0, draft.xpReward))} XP
            </div>
          </div>

          <div className="pf-dl" style={{ marginTop: 16 }}>
            <dt>Prerequisites</dt>
            <dd>{draft.prerequisites.trim() || <span className="pf-muted">None</span>}</dd>
            <dt>NPC requirements</dt>
            <dd>{draft.npcRequirements.trim() || <span className="pf-muted">None</span>}</dd>
            <dt>Location requirements</dt>
            <dd>{draft.locationRequirements.trim() || <span className="pf-muted">None</span>}</dd>
            <dt>Completion conditions</dt>
            <dd>{draft.completionConditions.trim() || <span className="pf-muted">None</span>}</dd>
            <dt>Evaluation criteria</dt>
            <dd>{draft.evaluationCriteria.trim() || <span className="pf-muted">None</span>}</dd>
            <dt>Failure conditions</dt>
            <dd>{draft.failureConditions.trim() || <span className="pf-muted">None</span>}</dd>
            <dt>Recovery</dt>
            <dd>{draft.recoveryInstructions.trim() || <span className="pf-muted">None</span>}</dd>
          </div>
        </Card>
      </div>
    </>
  )
}
