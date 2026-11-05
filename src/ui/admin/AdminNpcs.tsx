import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { ROLE_BY_ID } from '../../data/npcCatalog'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  districtName,
  fetchWorldVocabulary,
  type NpcsPayload,
  type RoleRow,
  type WorldVocabulary,
} from './worldApi'

/**
 * NPC management.
 *
 * The fourteen roles, their names, their palettes and the interactions they
 * offer are authored in the game and are not editable here. What an
 * administrator controls is the street itself: how many of a role are walking
 * around, which districts they belong to, and whether the role appears at all.
 *
 * Those three settings are what the player application reads when it seeds the
 * crowd, so a saved change is a real change: fewer bankers on Broad Street, or
 * no mentors anywhere, the next time the city loads.
 */

export function AdminNpcs() {
  const vocabulary = useApi<WorldVocabulary>('/admin/world/meta')
  const npcs = useApi<NpcsPayload>('/admin/world/npcs')
  const [selected, setSelected] = useState<string | null>(null)

  const roles = npcs.data?.roles ?? []

  // The crowd the player will actually meet, using the same rule the game does:
  // an override wins, otherwise the catalogue value stands.
  const crowd = roles.reduce((total, role) => {
    const def = ROLE_BY_ID[role.value as keyof typeof ROLE_BY_ID]
    const active = role.override?.active ?? true
    if (!def || !active) return total
    return total + (role.override?.spawnCount ?? def.spawnCount)
  }, 0)

  const muted = roles.filter((role) => role.override?.active === false).length

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>NPC Management</h1>
          <p>
            Fourteen roles populate the city, each with its own duties and conversations. The roles
            themselves are fixed; how many walk the streets, and where, is yours to set.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Roles" value={formatNumber(roles.length || 14)} sub="Fixed by the game" />
        <StatTile
          label="People on the street"
          value={npcs.data ? formatNumber(crowd) : '—'}
          sub="With current settings"
          tone="accent"
        />
        <StatTile
          label="Retuned roles"
          value={npcs.data ? formatNumber(npcs.data.overridden) : '—'}
          sub={muted > 0 ? `${muted} switched off` : 'Using the catalogue'}
        />
      </div>

      {npcs.loading || npcs.error ? (
        <StateBlock loading={npcs.loading} error={npcs.error} onRetry={npcs.reload} />
      ) : (
        <div className="pf-split">
          <Card title="Roles" meta={`${roles.length} in the city`}>
            <div className="pf-level-list">
              {roles.map((role) => (
                <RoleButton
                  key={role.value}
                  role={role}
                  active={selected === role.value}
                  onSelect={() => setSelected(role.value)}
                />
              ))}
            </div>
          </Card>

          {selected ? (
            <RoleEditor
              key={`${selected}:${roles.find((r) => r.value === selected)?.override?.updatedAt ?? 'none'}`}
              role={roles.find((r) => r.value === selected)!}
              vocabulary={vocabulary.data}
              onSaved={npcs.reload}
            />
          ) : (
            <Card title="Role detail">
              <p className="pf-card__note">
                Choose a role to see how many of them the player will meet, and where they belong.
              </p>
            </Card>
          )}
        </div>
      )}
    </>
  )
}

function RoleButton({
  role,
  active,
  onSelect,
}: {
  role: RoleRow
  active: boolean
  onSelect: () => void
}) {
  const def = ROLE_BY_ID[role.value as keyof typeof ROLE_BY_ID]
  const muted = role.override?.active === false
  return (
    <button
      className={`pf-level-list__item${active ? ' pf-level-list__item--on' : ''}`}
      type="button"
      onClick={onSelect}
    >
      <span className="pf-level-list__id">{role.override?.spawnCount ?? def?.spawnCount ?? 0}</span>
      <span className="pf-level-list__title">{role.label}</span>
      {muted ? (
        <span className="pf-level-list__flag">switched off</span>
      ) : (
        role.override && <span className="pf-level-list__flag">retuned</span>
      )}
    </button>
  )
}

function RoleEditor({
  role,
  vocabulary,
  onSaved,
}: {
  role: RoleRow
  vocabulary: WorldVocabulary | null
  onSaved: () => void
}) {
  const def = ROLE_BY_ID[role.value as keyof typeof ROLE_BY_ID]
  const catalogueDistricts = def?.spawnDistricts ?? []

  const [spawnCount, setSpawnCount] = useState(role.override?.spawnCount ?? def?.spawnCount ?? 0)
  const [districts, setDistricts] = useState<string[]>(
    role.override?.spawnDistricts ?? catalogueDistricts,
  )
  const [enabled, setEnabled] = useState(role.override?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  function toggleDistrict(id: string) {
    setDistricts((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    )
  }

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/world/npcs/${role.value}`, {
        method: 'PUT',
        body: {
          spawnCount: Math.max(0, Math.round(spawnCount)),
          spawnDistricts: districts,
          active: enabled,
        },
      })
      setNotice(
        `${role.label} updated. Players meet the new crowd the next time they enter the city.`,
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
      await api(`/admin/world/npcs/${role.value}`, { method: 'DELETE' })
      setSpawnCount(def?.spawnCount ?? 0)
      setDistricts(catalogueDistricts)
      setEnabled(true)
      setNotice(`${role.label} restored to the catalogue.`)
      onSaved()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That role could not be reset.')
    } finally {
      setBusy(false)
    }
  }

  const warnings: string[] = []
  if (role.requiredByMissions > 0 && !enabled) {
    warnings.push(
      `${role.requiredByMissions} authored mission objective${role.requiredByMissions === 1 ? '' : 's'} ask${role.requiredByMissions === 1 ? 's' : ''} the player to talk to this role. Switching it off can make ${role.requiredByMissions === 1 ? 'that mission' : 'those missions'} impossible to finish.`,
    )
  }
  if (enabled && spawnCount === 0) {
    warnings.push('No one of this role will be placed, which is the same as switching the role off.')
  }
  if (enabled && districts.length === 0) {
    warnings.push('No district is selected, so nobody of this role can be placed.')
  }

  return (
    <Card
      title={role.label}
      meta={
        role.override ? (
          <Badge tone={role.override.active === false ? 'warn' : 'good'}>
            {role.override.active === false ? 'Switched off' : 'Retuned'}
          </Badge>
        ) : (
          <Badge>Catalogue</Badge>
        )
      }
    >
      {notice && <div className="pf-notice pf-notice--good" style={{ marginBottom: 14 }}>{notice}</div>}
      {failure && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }}>{failure}</div>}
      {warnings.map((warning) => (
        <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }} key={warning}>
          {warning}
        </div>
      ))}

      <div className="pf-inline-stats">
        <span>
          <strong>{formatNumber(def?.interactions.length ?? 0)}</strong> interactions
        </span>
        <span>
          <strong>{formatNumber(role.requiredByMissions)}</strong> mission objective
          {role.requiredByMissions === 1 ? '' : 's'}
        </span>
        {role.override && <span>changed {formatRelative(role.override.updatedAt)}</span>}
      </div>

      <p className="pf-card__note" style={{ marginBottom: 12 }}>
        {role.blurb}
      </p>

      <div className="pf-form">
        <label className="pf-field">
          <span className="pf-field__label">People of this role in the city</span>
          <input
            className="pf-input"
            type="number"
            min={0}
            max={60}
            value={spawnCount}
            onChange={(event) => setSpawnCount(Number(event.target.value) || 0)}
          />
          <span className="pf-field__hint">
            Catalogue sets {formatNumber(def?.spawnCount ?? 0)}.
          </span>
        </label>

        <div className="pf-field">
          <span className="pf-field__label">Districts they belong to</span>
          <div className="pf-picker">
            {(vocabulary?.districts ?? []).map((district) => {
              const on = districts.includes(district.id)
              return (
                <button
                  className={`pf-picker__opt${on ? ' pf-picker__opt--on' : ''}`}
                  key={district.id}
                  type="button"
                  onClick={() => toggleDistrict(district.id)}
                >
                  {district.name}
                </button>
              )
            })}
          </div>
          <span className="pf-field__hint">
            Districts the administrator has closed carry no crowd at all, whatever is set here.
          </span>
        </div>

        <label className="pf-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          This role walks the city
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save role'}
          </button>
          {role.override && (
            <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={reset}>
              Reset to catalogue
            </button>
          )}
        </div>
      </div>

      <div className="pf-preview">
        <div className="pf-preview__eyebrow">Player view · crowd</div>
        <h3 className="pf-preview__title">
          {enabled ? `${formatNumber(Math.max(0, Math.round(spawnCount)))} ${role.label}` : 'Nobody'}
        </h3>
        <p className="pf-preview__body">
          {enabled
            ? `These will be placed around ${districts.length === 0 ? 'nowhere — no district is selected' : districts.map((id) => districtName(vocabulary, id)).join(', ')}.`
            : 'This role will not appear anywhere in the city.'}
        </p>
        <div className="pf-preview__label">Interactions they offer</div>
        <ul className="pf-preview__list">
          {(def?.interactions ?? []).map((interaction) => (
            <li key={interaction.id}>
              {interaction.label}
              {interaction.minLevel ? ` — from level ${interaction.minLevel}` : ''}
              {interaction.requiresUnlock ? ` — needs ${interaction.requiresUnlock.replace(/_/g, ' ')}` : ''}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}
