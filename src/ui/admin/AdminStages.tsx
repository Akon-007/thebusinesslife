import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { LEVEL_BY_ID } from '../../data/beginnerLevels'
import { STAGES } from '../../data/stages'
import {
  Badge,
  Card,
  StateBlock,
  StatTile,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
} from '../portal/common'
import { useApi } from '../portal/useApi'
import type { LevelOverrideRecord, LevelRow, Vocabulary } from './contentApi'

/**
 * Stage and level management.
 *
 * The five stages, their fifteen Beginner levels, and each level's id, order and
 * title are the game's frozen design contract — they are shown here but cannot
 * be renamed or re-ordered. What an administrator *can* change is the authored
 * detail around them: the summary the player reads, the requirements list, which
 * features a level unlocks, its rewards, and whether the published override
 * applies at all. Saving a change is what makes it real: the player application
 * fetches these overrides and merges them over its own catalogue.
 */

interface LevelsPayload {
  levels: LevelRow[]
  overridden: number
  totalLevels: number
  totalMissions: number
}

interface LevelForm {
  summary: string
  requirements: string
  unlocks: string[]
  xpReward: number
  cashReward: number
  reputationReward: number
  active: boolean
}

function initialForm(levelId: string, override: LevelOverrideRecord | null): LevelForm {
  const base = LEVEL_BY_ID[levelId]
  return {
    summary: override?.summary ?? base.summary,
    requirements: (override?.requirements ?? base.requirements).join('\n'),
    unlocks: override?.unlocks ?? base.unlocks,
    xpReward: override?.xpReward ?? base.rewards.xp,
    cashReward: override?.cashReward ?? base.rewards.cash,
    reputationReward: override?.reputationReward ?? base.rewards.reputation,
    active: override?.active ?? true,
  }
}

export function AdminStages() {
  const vocabulary = useApi<Vocabulary>('/admin/content/meta')
  const levels = useApi<LevelsPayload>('/admin/content/levels')
  const [stageIndex, setStageIndex] = useState(1)
  const [selected, setSelected] = useState<string | null>(null)

  const stage = STAGES.find((s) => s.index === stageIndex)!
  const rows = (levels.data?.levels ?? []).filter(
    (row) => row.index >= stage.levelRange[0] && row.index <= stage.levelRange[1],
  )

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Stages &amp; Levels</h1>
          <p>
            The progression structure is fixed: five stages of fifteen levels. Level ids, order and
            titles are locked. Everything else about a level can be retuned here, and players pick the
            change up the next time they enter the city.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile
          label="Levels authored"
          value={levels.data ? formatNumber(levels.data.totalLevels) : '—'}
          sub="Beginner stage"
        />
        <StatTile
          label="Retuned"
          value={levels.data ? formatNumber(levels.data.overridden) : '—'}
          sub="Levels with an override"
          tone={levels.data && levels.data.overridden > 0 ? 'accent' : ''}
        />
        <StatTile
          label="Authored missions"
          value={levels.data ? formatNumber(levels.data.totalMissions) : '—'}
          sub="Across all levels"
        />
      </div>

      <Card title="Stages" meta="Beginner is the only stage with authored levels today">
        <div className="pf-toolbar">
          {STAGES.map((entry) => (
            <button
              className={`pf-btn ${entry.index === stageIndex ? '' : 'pf-btn--ghost'}`}
              key={entry.id}
              type="button"
              onClick={() => {
                setStageIndex(entry.index)
                setSelected(null)
              }}
            >
              {entry.index}. {entry.name} · L{entry.levelRange[0]}–{entry.levelRange[1]}
            </button>
          ))}
        </div>
        <p className="pf-card__note" style={{ marginTop: 12 }}>
          {stage.description}
        </p>
      </Card>

      {levels.loading || levels.error ? (
        <StateBlock loading={levels.loading} error={levels.error} onRetry={levels.reload} />
      ) : stageIndex === 1 ? (
        <div className="pf-split">
          <Card title="Levels" meta={`${rows.length} in this stage`}>
            <div className="pf-level-list">
              {rows.map((row) => (
                <LevelButton
                  key={row.levelId}
                  row={row}
                  active={selected === row.levelId}
                  onSelect={() => setSelected(row.levelId)}
                />
              ))}
            </div>
          </Card>

          {selected && LEVEL_BY_ID[selected] ? (
            <LevelEditor
              key={`${selected}:${rows.find((r) => r.levelId === selected)?.override?.updatedAt ?? 'none'}`}
              row={rows.find((r) => r.levelId === selected)!}
              vocabulary={vocabulary.data}
              onSaved={() => {
                levels.reload()
              }}
            />
          ) : (
            <Card title="Level detail">
              <p className="pf-card__note">
                Choose a level to review its adoption and retune what the player sees.
              </p>
            </Card>
          )}
        </div>
      ) : (
        <Card title={`${stage.name} — L${stage.levelRange[0]} to L${stage.levelRange[1]}`}>
          <p className="pf-card__note">
            The levels for this stage are not authored yet. The fifteen Beginner levels are the
            game&apos;s playable progression today, so this stage is shown for structure only.
          </p>
        </Card>
      )}
    </>
  )
}

function LevelButton({
  row,
  active,
  onSelect,
}: {
  row: LevelRow
  active: boolean
  onSelect: () => void
}) {
  const level = LEVEL_BY_ID[row.levelId]
  return (
    <button
      className={`pf-level-list__item${active ? ' pf-level-list__item--on' : ''}`}
      type="button"
      onClick={onSelect}
    >
      <span className="pf-level-list__id">{row.levelId}</span>
      <span className="pf-level-list__title">{level?.title ?? 'Unknown level'}</span>
      {row.override && (
        <span className="pf-level-list__flag">
          {row.override.active ? 'retuned' : 'override off'}
        </span>
      )}
    </button>
  )
}

function LevelEditor({
  row,
  vocabulary,
  onSaved,
}: {
  row: LevelRow
  vocabulary: Vocabulary | null
  onSaved: () => void
}) {
  const base = LEVEL_BY_ID[row.levelId]
  const [form, setForm] = useState<LevelForm>(() => initialForm(row.levelId, row.override))
  const [previewing, setPreviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  function set<K extends keyof LevelForm>(key: K, value: LevelForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function toggleUnlock(key: string) {
    setForm((current) => ({
      ...current,
      unlocks: current.unlocks.includes(key)
        ? current.unlocks.filter((entry) => entry !== key)
        : [...current.unlocks, key],
    }))
  }

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/content/levels/${row.levelId}`, {
        method: 'PUT',
        body: {
          summary: form.summary.trim() || null,
          requirements: form.requirements
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          unlocks: form.unlocks,
          xpReward: Math.max(0, Math.round(form.xpReward)),
          cashReward: Math.max(0, Math.round(form.cashReward)),
          reputationReward: Math.max(0, Math.round(form.reputationReward)),
          active: form.active,
        },
      })
      setNotice(
        form.active
          ? `${row.levelId} updated. Players pick this up on their next entry to the city.`
          : `${row.levelId} saved with the override switched off — players keep the published catalogue.`,
      )
      onSaved()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That change could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/content/levels/${row.levelId}`, { method: 'DELETE' })
      setForm(initialForm(row.levelId, null))
      setNotice(`${row.levelId} restored to the published catalogue.`)
      onSaved()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That level could not be reset.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={`${row.levelId} — ${base.title}`}
      meta={
        <>
          {row.override ? (
            <Badge tone={row.override.active ? 'good' : 'warn'}>
              {row.override.active ? 'Override applied' : 'Override off'}
            </Badge>
          ) : (
            <Badge>Catalogue</Badge>
          )}
        </>
      }
    >
      {notice && <div className="pf-notice pf-notice--good" style={{ marginBottom: 14 }}>{notice}</div>}
      {failure && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }}>{failure}</div>}

      <div className="pf-inline-stats">
        <span>
          <strong>{formatNumber(row.adoption.reached)}</strong> reached
        </span>
        <span>
          <strong>{formatNumber(row.adoption.completed)}</strong> completed
        </span>
        <span>
          <strong>{formatPercent(row.adoption.completionRate)}</strong> completion
        </span>
        <span>
          <strong>{formatNumber(row.missions.published)}</strong> published mission
          {row.missions.published === 1 ? '' : 's'}
        </span>
      </div>

      {row.override && (
        <p className="pf-card__note" style={{ marginBottom: 12 }}>
          Last changed {formatRelative(row.override.updatedAt)}.
        </p>
      )}

      <div className="pf-form">
        <label className="pf-field">
          <span className="pf-field__label">Title — locked</span>
          <input className="pf-input pf-input--block" value={base.title} readOnly />
          <span className="pf-field__hint">
            Level titles and ordering are part of the game&apos;s design contract and cannot be changed
            from the portal.
          </span>
        </label>

        <label className="pf-field">
          <span className="pf-field__label">Summary shown to the player</span>
          <textarea
            className="pf-textarea"
            rows={3}
            value={form.summary}
            onChange={(event) => set('summary', event.target.value)}
          />
        </label>

        <label className="pf-field">
          <span className="pf-field__label">Requirements — one per line</span>
          <textarea
            className="pf-textarea"
            rows={4}
            value={form.requirements}
            onChange={(event) => set('requirements', event.target.value)}
          />
        </label>

        <div className="pf-field">
          <span className="pf-field__label">Features unlocked on completion</span>
          <div className="pf-picker">
            {(vocabulary?.unlockKeys ?? []).map((key) => {
              const on = form.unlocks.includes(key.value)
              return (
                <button
                  className={`pf-picker__opt${on ? ' pf-picker__opt--on' : ''}`}
                  key={key.value}
                  type="button"
                  onClick={() => toggleUnlock(key.value)}
                >
                  {key.label}
                </button>
              )
            })}
          </div>
          <span className="pf-field__hint">
            Unlocks gate gameplay, not decoration: clearing one removes the feature for players at this
            level.
          </span>
        </div>

        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">XP reward</span>
            <input
              className="pf-input"
              type="number"
              min={0}
              value={form.xpReward}
              onChange={(event) => set('xpReward', Number(event.target.value) || 0)}
            />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Cash reward</span>
            <input
              className="pf-input"
              type="number"
              min={0}
              value={form.cashReward}
              onChange={(event) => set('cashReward', Number(event.target.value) || 0)}
            />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Reputation</span>
            <input
              className="pf-input"
              type="number"
              min={0}
              value={form.reputationReward}
              onChange={(event) => set('reputationReward', Number(event.target.value) || 0)}
            />
          </label>
        </div>

        <label className="pf-check">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => set('active', event.target.checked)}
          />
          Apply this override to players
        </label>
        <span className="pf-field__hint">
          Switched off, everything below reverts to the published catalogue — the level is never
          removed from the game.
        </span>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save level'}
          </button>
          <button
            className="pf-btn pf-btn--ghost"
            type="button"
            onClick={() => setPreviewing((value) => !value)}
          >
            {previewing ? 'Hide preview' : 'Preview as player'}
          </button>
          {row.override && (
            <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={reset}>
              Reset to catalogue
            </button>
          )}
        </div>
      </div>

      {previewing && (
        <div className="pf-preview">
          <div className="pf-preview__eyebrow">Player view · {row.levelId}</div>
          <h3 className="pf-preview__title">{base.title}</h3>
          <p className="pf-preview__body">{form.summary || 'No summary.'}</p>
          <div className="pf-preview__label">Requirements</div>
          <ul className="pf-preview__list">
            {form.requirements
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
          </ul>
          <div className="pf-preview__label">Rewards</div>
          <div className="pf-chips">
            <span className="pf-chip">{formatNumber(Math.max(0, form.xpReward))} XP</span>
            <span className="pf-chip">{formatMoney(Math.max(0, form.cashReward))}</span>
            <span className="pf-chip">{formatNumber(Math.max(0, form.reputationReward))} reputation</span>
          </div>
          {form.unlocks.length > 0 && (
            <>
              <div className="pf-preview__label">Unlocks</div>
              <div className="pf-chips">
                {form.unlocks.map((key) => (
                  <span className="pf-chip" key={key}>
                    {vocabulary?.unlockKeys.find((entry) => entry.value === key)?.label ?? key}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
