import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { SECTOR_BRIEFINGS } from '../../data/sectors'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import type { SectorRow, SectorsPayload } from './worldApi'

/**
 * Business sectors.
 *
 * The ten sector names are part of the platform's language: a company is stored
 * against one of them and reported on across the portal, so they cannot be
 * renamed or invented here. What an administrator controls is whether a sector
 * is offered during onboarding, and the one-line description a new player reads
 * underneath it.
 *
 * Switching a sector off removes it from the list a new company chooses from.
 * Companies already registered in it keep trading — the register is not
 * rewritten behind anybody's back.
 */

export function AdminSectors() {
  const sectors = useApi<SectorsPayload>('/admin/world/sectors')
  const [selected, setSelected] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const rows = sectors.data?.sectors ?? []
  const inUse = rows.filter((row) => row.companies > 0).length
  const switchedOff = rows.filter((row) => row.override?.active === false).length

  const current = selected ? rows.find((row) => row.sector === selected) ?? null : null

  function handleSaved(message: string, select: string | null) {
    setFlash(message)
    setSelected(select)
    sectors.reload()
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Business Sectors</h1>
          <p>
            The sectors a player chooses between when they start a company, and the line of
            description each one carries. The names are fixed; the offer is yours to shape.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile
          label="Sectors"
          value={sectors.data ? formatNumber(sectors.data.totalSectors) : '—'}
          sub="Fixed by the platform"
        />
        <StatTile
          label="Companies trading"
          value={sectors.data ? formatNumber(rows.reduce((sum, row) => sum + row.companies, 0)) : '—'}
          sub={`across ${formatNumber(inUse)} sector${inUse === 1 ? '' : 's'}`}
          tone="accent"
        />
        <StatTile
          label="Switched off"
          value={sectors.data ? formatNumber(switchedOff) : '—'}
          sub={switchedOff > 0 ? 'Hidden from onboarding' : 'All on offer'}
          tone={switchedOff > 0 ? 'warn' : ''}
        />
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}

      {sectors.loading || sectors.error ? (
        <StateBlock loading={sectors.loading} error={sectors.error} onRetry={sectors.reload} />
      ) : (
        <div className="pf-split">
          <Card title="Sectors" meta={`${rows.length} on offer`}>
            <div className="pf-level-list">
              {rows.map((row) => {
                const off = row.override?.active === false
                return (
                  <button
                    className={`pf-level-list__item${
                      selected === row.sector ? ' pf-level-list__item--on' : ''
                    }`}
                    key={row.sector}
                    type="button"
                    onClick={() => setSelected(row.sector)}
                  >
                    <span className="pf-level-list__id">{row.companies}</span>
                    <span className="pf-level-list__title">{row.sector}</span>
                    {off ? (
                      <span className="pf-level-list__flag">off</span>
                    ) : (
                      row.override && <span className="pf-level-list__flag">described</span>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>

          {current ? (
            <SectorEditor
              key={`${current.sector}:${current.override?.updatedAt ?? 'catalogue'}`}
              row={current}
              onSaved={handleSaved}
            />
          ) : (
            <Card title="Sector detail">
              <p className="pf-card__note">
                Choose a sector to see how many companies are traded in it, and to change what a new
                player reads about it.
              </p>
            </Card>
          )}
        </div>
      )}
    </>
  )
}

function SectorEditor({
  row,
  onSaved,
}: {
  row: SectorRow
  onSaved: (message: string, select: string | null) => void
}) {
  const catalogueBriefing = SECTOR_BRIEFINGS[row.sector] ?? ''

  const [briefing, setBriefing] = useState(row.override?.briefing ?? catalogueBriefing)
  const [enabled, setEnabled] = useState(row.override?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/world/sectors/${encodeURIComponent(row.sector)}`, {
        method: 'PUT',
        body: { active: enabled, briefing: briefing.trim() || null },
      })
      onSaved(`${row.sector} updated. New companies see the change immediately.`, row.sector)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That change could not be saved.')
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/world/sectors/${encodeURIComponent(row.sector)}`, { method: 'DELETE' })
      setBriefing(catalogueBriefing)
      setEnabled(true)
      onSaved(`${row.sector} restored to the catalogue.`, row.sector)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That sector could not be reset.')
      setBusy(false)
    }
  }

  const warnings: string[] = []
  if (!enabled && row.companies > 0) {
    warnings.push(
      `${row.companies} compan${row.companies === 1 ? 'y is' : 'ies are'} already registered in this sector. Switching it off only removes it from the choices a new company sees — those businesses keep trading, and their sector is still reported on.`,
    )
  }

  return (
    <Card
      title={row.sector}
      meta={
        row.override ? (
          <Badge tone={row.override.active === false ? 'warn' : 'good'}>
            {row.override.active === false ? 'Switched off' : 'Retuned'}
          </Badge>
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
          <strong>{formatNumber(row.companies)}</strong> compan{row.companies === 1 ? 'y' : 'ies'}
        </span>
        <span>
          <strong>{formatNumber(row.players)}</strong> player{row.players === 1 ? '' : 's'} with
          progress
        </span>
        {row.players > 0 && (
          <span>
            average level <strong>{Math.round(row.averageLevel)}</strong>
          </span>
        )}
        {row.override && <span>changed {formatRelative(row.override.updatedAt)}</span>}
      </div>

      <div className="pf-form">
        <label className="pf-field">
          <span className="pf-field__label">What this sector means</span>
          <textarea
            className="pf-textarea"
            rows={3}
            maxLength={400}
            placeholder={catalogueBriefing}
            value={briefing}
            onChange={(event) => setBriefing(event.target.value)}
          />
          <span className="pf-field__hint">
            Shown under the sector name when a player creates their company. Leave it empty to fall
            back to the catalogue wording.
          </span>
        </label>

        <label className="pf-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Offer this sector to new companies
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save sector'}
          </button>
          {row.override && (
            <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={reset}>
              Reset to catalogue
            </button>
          )}
        </div>
      </div>

      <div className="pf-preview">
        <div className="pf-preview__eyebrow">Player view · onboarding</div>
        <h3 className="pf-preview__title">{row.sector}</h3>
        <p className="pf-preview__body">
          {enabled
            ? briefing.trim() || catalogueBriefing || 'No description — the player sees the name only.'
            : 'This sector is not offered. A new company cannot choose it.'}
        </p>
        <div className="pf-preview__label">Where it stands</div>
        <ul className="pf-preview__list">
          <li>{formatNumber(row.companies)} companies already trading here</li>
          <li>
            {row.players > 0
              ? `${formatNumber(row.players)} players, average level ${Math.round(row.averageLevel)}`
              : 'No player progress recorded here yet'}
          </li>
        </ul>
      </div>
    </Card>
  )
}
