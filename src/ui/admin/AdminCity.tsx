import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  humaniseToken,
  type BuildingRow,
  type CityPayload,
  type DistrictRow,
} from './worldApi'

/**
 * City management.
 *
 * The city's shape — six districts, twenty-two named places and where each one
 * stands — is authored in the game and is not redrawn here. What an
 * administrator controls is which of it is open: the footfall a district
 * attracts, and whether a place is trading at all.
 *
 * Closing something is a real closure. A closed district carries no crowd and
 * its buildings are removed from the city, from the player's collisions and
 * from the places they can walk into. Because authored missions send players to
 * particular kinds of place, the screens count those dependencies first and say
 * so before the change is saved.
 */

type Selection = { kind: 'district' | 'building'; id: string } | null

export function AdminCity() {
  const city = useApi<CityPayload>('/admin/world/city')
  const [selected, setSelected] = useState<Selection>(null)
  const [filter, setFilter] = useState('ALL')
  const [flash, setFlash] = useState<string | null>(null)

  const districts = city.data?.districts ?? []
  const buildings = city.data?.buildings ?? []
  const nameOfDistrict = new Map(districts.map((district) => [district.id, district.name]))

  const closedDistricts = districts.filter(
    (district) => district.override?.active === false || district.override?.footfall === 0,
  ).length
  const closedBuildings = buildings.filter((row) => row.override?.active === false).length
  const closed = closedDistricts + closedBuildings

  const visibleBuildings =
    filter === 'ALL' ? buildings : buildings.filter((row) => row.districtId === filter)

  function handleSaved(message: string) {
    setFlash(message)
    city.reload()
  }

  const selectedDistrict =
    selected?.kind === 'district' ? districts.find((row) => row.id === selected.id) ?? null : null
  const selectedBuilding =
    selected?.kind === 'building' ? buildings.find((row) => row.id === selected.id) ?? null : null

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>City Management</h1>
          <p>
            Six districts and twenty-two places. Setting a district's footfall to zero closes it —
            the crowd moves away and its buildings come out of the city. Closing a place removes it
            the same way.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile
          label="Districts"
          value={city.data ? formatNumber(districts.length) : '—'}
          sub="Fixed by the game"
        />
        <StatTile
          label="Places"
          value={city.data ? formatNumber(buildings.length) : '—'}
          sub="Interactive buildings"
        />
        <StatTile
          label="Closed"
          value={city.data ? formatNumber(closed) : '—'}
          sub={
            closed > 0
              ? `${closedDistricts} district${closedDistricts === 1 ? '' : 's'}, ${closedBuildings} place${closedBuildings === 1 ? '' : 's'}`
              : 'The whole city is open'
          }
          tone={closed > 0 ? 'warn' : ''}
        />
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}

      {city.loading || city.error ? (
        <StateBlock loading={city.loading} error={city.error} onRetry={city.reload} />
      ) : (
        <>
          <div className="pf-split">
            <Card title="Districts" meta={`${districts.length} in the city`}>
              <div className="pf-level-list">
                {districts.map((district) => {
                  const shut =
                    district.override?.active === false || district.override?.footfall === 0
                  return (
                    <button
                      className={`pf-level-list__item${
                        selected?.kind === 'district' && selected.id === district.id
                          ? ' pf-level-list__item--on'
                          : ''
                      }`}
                      key={district.id}
                      type="button"
                      onClick={() => setSelected({ kind: 'district', id: district.id })}
                    >
                      <span className="pf-level-list__id">{district.buildingCount}</span>
                      <span className="pf-level-list__title">{district.name}</span>
                      {shut ? (
                        <span className="pf-level-list__flag">closed</span>
                      ) : (
                        district.override && <span className="pf-level-list__flag">retuned</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>

            {selectedDistrict ? (
              <DistrictEditor
                key={`${selectedDistrict.id}:${selectedDistrict.override?.updatedAt ?? 'catalogue'}`}
                district={selectedDistrict}
                buildings={buildings.filter((row) => row.districtId === selectedDistrict.id)}
                onSaved={handleSaved}
              />
            ) : selectedBuilding ? (
              <BuildingEditor
                key={`${selectedBuilding.id}:${selectedBuilding.override?.updatedAt ?? 'catalogue'}`}
                building={selectedBuilding}
                districtName={nameOfDistrict.get(selectedBuilding.districtId) ?? selectedBuilding.districtId}
                onSaved={handleSaved}
              />
            ) : (
              <Card title="District detail">
                <p className="pf-card__note">
                  Choose a district to set how busy it is, or a place in the table below to close it.
                </p>
              </Card>
            )}
          </div>

          <Card
            title="Places"
            meta={
              <select
                className="pf-select"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="ALL">All districts</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
            }
          >
            {visibleBuildings.length === 0 ? (
              <p className="pf-card__note">No place stands in that district.</p>
            ) : (
              <div className="pf-table-wrap">
                <table className="pf-table">
                  <thead>
                    <tr>
                      <th>Place</th>
                      <th>District</th>
                      <th>Type</th>
                      <th className="pf-table__num">Missions</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleBuildings.map((row) => {
                      const closedByDistrict =
                        row.override?.active !== false &&
                        districts.find((district) => district.id === row.districtId)?.override
                          ?.footfall === 0
                      return (
                        <tr key={row.id}>
                          <td>
                            <button
                              className="pf-row-link"
                              type="button"
                              onClick={() => setSelected({ kind: 'building', id: row.id })}
                            >
                              {row.name}
                            </button>
                            {row.override?.notes && (
                              <div className="pf-muted" style={{ fontSize: 12 }}>
                                {row.override.notes}
                              </div>
                            )}
                          </td>
                          <td>{nameOfDistrict.get(row.districtId) ?? row.districtId}</td>
                          <td>{humaniseToken(row.type)}</td>
                          <td className="pf-table__num">
                            {row.requiredByMissions > 0 ? (
                              <strong>{row.requiredByMissions}</strong>
                            ) : (
                              <span className="pf-muted">—</span>
                            )}
                          </td>
                          <td>
                            <div className="pf-chips">
                              {row.override?.active === false ? (
                                <Badge tone="bad">Closed</Badge>
                              ) : closedByDistrict ? (
                                <Badge tone="warn">District closed</Badge>
                              ) : (
                                <Badge tone="good">Open</Badge>
                              )}
                            </div>
                          </td>
                          <td>
                            <button
                              className="pf-btn pf-btn--ghost pf-btn--sm"
                              type="button"
                              onClick={() => setSelected({ kind: 'building', id: row.id })}
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  )
}

function DistrictEditor({
  district,
  buildings,
  onSaved,
}: {
  district: DistrictRow
  buildings: BuildingRow[]
  onSaved: (message: string) => void
}) {
  const [footfall, setFootfall] = useState(district.override?.footfall ?? 1)
  const [enabled, setEnabled] = useState(district.override?.active ?? true)
  const [notes, setNotes] = useState(district.override?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const shut = !enabled || footfall === 0
  const named = buildings.filter((row) => row.requiredByMissions > 0)

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/world/city/districts/${district.id}`, {
        method: 'PUT',
        body: {
          active: enabled,
          footfall: Math.min(10, Math.max(0, Math.round(footfall))),
          notes: notes.trim() || null,
        },
      })
      onSaved(`${district.name} updated. Players see the change next time they enter the city.`)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That change could not be saved.')
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/world/city/districts/${district.id}`, { method: 'DELETE' })
      setFootfall(1)
      setEnabled(true)
      setNotes('')
      onSaved(`${district.name} restored to the catalogue.`)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That district could not be reset.')
      setBusy(false)
    }
  }

  const warnings: string[] = []
  if (shut) {
    warnings.push(
      `Closing this district takes ${buildings.length} place${buildings.length === 1 ? '' : 's'} out of the city and moves its crowd elsewhere. Nobody of any role belongs here while it is shut.`,
    )
    if (named.length > 0) {
      warnings.push(
        `Authored missions send the player to ${named.map((row) => row.name).join(', ')}. Closing the district makes those missions impossible to finish while it stays shut.`,
      )
    }
  }

  return (
    <Card
      title={district.name}
      meta={
        district.override ? (
          <Badge tone={shut ? 'warn' : 'good'}>{shut ? 'Closed' : 'Retuned'}</Badge>
        ) : (
          <Badge>Catalogue</Badge>
        )
      }
    >
      {failure && (
        <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }}>
          {failure}
        </div>
      )}
      {warnings.map((warning) => (
        <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }} key={warning}>
          {warning}
        </div>
      ))}

      <div className="pf-inline-stats">
        <span>
          <strong>{formatNumber(buildings.length)}</strong> place{buildings.length === 1 ? '' : 's'}
        </span>
        <span>
          catalogue footfall <strong>1</strong>
        </span>
        {district.override && <span>changed {formatRelative(district.override.updatedAt)}</span>}
      </div>

      <div className="pf-form">
        <label className="pf-field">
          <span className="pf-field__label">Footfall (0–10)</span>
          <input
            className="pf-input"
            type="number"
            min={0}
            max={10}
            value={footfall}
            onChange={(event) => setFootfall(Number(event.target.value) || 0)}
          />
          <span className="pf-field__hint">
            How eagerly people are placed here relative to the rest of the city. Zero closes the
            district.
          </span>
        </label>

        <label className="pf-field">
          <span className="pf-field__label">Internal note</span>
          <textarea
            className="pf-textarea"
            rows={2}
            maxLength={400}
            placeholder="Why this district is set the way it is."
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <span className="pf-field__hint">Recorded with the override; never shown to players.</span>
        </label>

        <label className="pf-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          This district is open
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save district'}
          </button>
          {district.override && (
            <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={reset}>
              Reset to catalogue
            </button>
          )}
        </div>
      </div>

      <div className="pf-preview">
        <div className="pf-preview__eyebrow">Player view · district</div>
        <h3 className="pf-preview__title">{shut ? `${district.name} is closed` : district.name}</h3>
        <p className="pf-preview__body">
          {shut
            ? `No crowd is placed here and these places are taken out of the city: ${buildings
                .map((row) => row.name)
                .join(', ') || 'none'}.`
            : `People are placed here at footfall ${Math.max(1, Math.round(footfall))} against the rest of the city.`}
        </p>
        <div className="pf-preview__label">Places in this district</div>
        <ul className="pf-preview__list">
          {buildings.length === 0 ? (
            <li>None</li>
          ) : (
            buildings.map((row) => (
              <li key={row.id}>
                {row.name} — {humaniseToken(row.type)}
                {row.requiredByMissions > 0
                  ? `, named in ${row.requiredByMissions} mission objective${row.requiredByMissions === 1 ? '' : 's'}`
                  : ''}
              </li>
            ))
          )}
        </ul>
      </div>
    </Card>
  )
}

function BuildingEditor({
  building,
  districtName,
  onSaved,
}: {
  building: BuildingRow
  districtName: string
  onSaved: (message: string) => void
}) {
  const [open, setOpen] = useState(building.override?.active !== false)
  const [notes, setNotes] = useState(building.override?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/world/city/buildings/${building.id}`, {
        method: 'PUT',
        body: { active: open, notes: notes.trim() || null },
      })
      onSaved(`${building.name} updated.`)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That change could not be saved.')
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/world/city/buildings/${building.id}`, { method: 'DELETE' })
      setOpen(true)
      setNotes('')
      onSaved(`${building.name} restored to the catalogue.`)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That place could not be reset.')
      setBusy(false)
    }
  }

  const warnings: string[] = []
  if (!open && building.requiredByMissions > 0) {
    warnings.push(
      `${building.requiredByMissions} authored mission objective${building.requiredByMissions === 1 ? '' : 's'} send the player to a ${humaniseToken(building.type)}. Closing this place can make ${building.requiredByMissions === 1 ? 'that mission' : 'those missions'} impossible to finish.`,
    )
  }

  return (
    <Card
      title={building.name}
      meta={
        building.override ? (
          <Badge tone={open ? 'good' : 'bad'}>{open ? 'Open' : 'Closed'}</Badge>
        ) : (
          <Badge>Catalogue</Badge>
        )
      }
    >
      {failure && (
        <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }}>
          {failure}
        </div>
      )}
      {warnings.map((warning) => (
        <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }} key={warning}>
          {warning}
        </div>
      ))}

      <div className="pf-inline-stats">
        <span>{districtName}</span>
        <span>{humaniseToken(building.type)}</span>
        <span>
          <strong>{formatNumber(building.requiredByMissions)}</strong> mission objective
          {building.requiredByMissions === 1 ? '' : 's'}
        </span>
        {building.override && <span>changed {formatRelative(building.override.updatedAt)}</span>}
      </div>

      <div className="pf-form">
        <label className="pf-field">
          <span className="pf-field__label">Internal note</span>
          <textarea
            className="pf-textarea"
            rows={2}
            maxLength={400}
            placeholder="Why this place is set the way it is."
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
          <span className="pf-field__hint">Recorded with the override; never shown to players.</span>
        </label>

        <label className="pf-check">
          <input type="checkbox" checked={open} onChange={(event) => setOpen(event.target.checked)} />
          This place is trading
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save place'}
          </button>
          {building.override && (
            <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={reset}>
              Reset to catalogue
            </button>
          )}
        </div>
      </div>

      <div className="pf-preview">
        <div className="pf-preview__eyebrow">Player view · place</div>
        <h3 className="pf-preview__title">
          {open ? building.name : `${building.name} is closed`}
        </h3>
        <p className="pf-preview__body">
          {open
            ? `Stands in ${districtName} and can be walked into.`
            : 'Taken out of the city: it is not drawn, does not block the player, and cannot be entered. Choosing it reports that it is closed.'}
        </p>
        <p className="pf-preview__body" style={{ marginTop: 6 }}>
          A closed district closes every place inside it, whatever is set here.
        </p>
      </div>
    </Card>
  )
}
