import { useEffect, useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  draftFromInvestor,
  emptyInvestorDraft,
  investorDraftToPayload,
  type InvestorDraft,
  type InvestorRecord,
  type InvestorsPayload,
  type WorldVocabulary,
} from './worldApi'

/**
 * Investor management.
 *
 * Investors are the one part of the world the administrator authors outright —
 * everything else is an override on top of a client contract. A saved investor
 * is placed in the city as a named character in the business district, so this
 * register is literally the list of people a player's pitch can reach.
 *
 * Withdrawing an investor keeps the record but takes them off the street;
 * removing one deletes it and is written to the audit log.
 */

export function AdminInvestors() {
  const vocabulary = useApi<WorldVocabulary>('/admin/world/meta')
  const investors = useApi<InvestorsPayload>('/admin/world/investors')
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState<string | 'new' | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const rows = investors.data?.investors ?? []
  const query = term.trim().toLowerCase()
  const visible =
    query.length === 0
      ? rows
      : rows.filter((row) =>
          [row.name, row.organisation, row.stageFocus, row.ticket, row.sectors.join(' ')]
            .join(' ')
            .toLowerCase()
            .includes(query),
        )

  const total = investors.data?.total ?? 0
  const active = investors.data?.active ?? 0
  const withdrawn = total - active

  const current =
    selected !== null && selected !== 'new' ? rows.find((row) => row.id === selected) ?? null : null

  // A confirmation should not sit on screen indefinitely.
  useEffect(() => {
    if (flash === null) return
    const timer = window.setTimeout(() => setFlash(null), 6000)
    return () => window.clearTimeout(timer)
  }, [flash])

  function handleSaved(message: string, selectId?: string | null) {
    setFlash(message)
    if (selectId !== undefined) setSelected(selectId)
    investors.reload()
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Investor Management</h1>
          <p>
            The investors a player can pitch to. Everyone on this register is placed in the business
            district as a named character the next time the city loads.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile
          label="Investors"
          value={investors.data ? formatNumber(total) : '—'}
          sub="On the register"
        />
        <StatTile
          label="Actively pitching"
          value={investors.data ? formatNumber(active) : '—'}
          sub="Walking the city"
          tone="accent"
        />
        <StatTile
          label="Withdrawn"
          value={investors.data ? formatNumber(withdrawn) : '—'}
          sub={withdrawn > 0 ? 'Kept off the street' : 'None withdrawn'}
          tone={withdrawn > 0 ? 'warn' : ''}
        />
      </div>

      <div className="pf-toolbar">
        <input
          className="pf-input pf-input--grow"
          type="search"
          placeholder="Search by name, firm or sector"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <button className="pf-btn" type="button" onClick={() => setSelected('new')}>
          Add investor
        </button>
        <button className="pf-btn pf-btn--ghost" type="button" onClick={investors.reload}>
          Refresh
        </button>
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}

      {investors.loading || investors.error ? (
        <StateBlock loading={investors.loading} error={investors.error} onRetry={investors.reload} />
      ) : (
        <div className="pf-split">
          <Card title="Register" meta={`${visible.length} shown`}>
            {visible.length === 0 ? (
              <p className="pf-card__note">
                {rows.length === 0
                  ? 'No investors yet. Add the first one to give players somebody to pitch to.'
                  : 'No investor matches that search.'}
              </p>
            ) : (
              <div className="pf-level-list">
                {visible.map((investor) => (
                  <button
                    className={`pf-level-list__item${
                      selected === investor.id ? ' pf-level-list__item--on' : ''
                    }`}
                    key={investor.id}
                    type="button"
                    onClick={() => setSelected(investor.id)}
                  >
                    <span className="pf-level-list__id">{investor.stageFocus}</span>
                    <span className="pf-level-list__title">{investor.name}</span>
                    {!investor.active && <span className="pf-level-list__flag">withdrawn</span>}
                  </button>
                ))}
              </div>
            )}
          </Card>

          {selected === 'new' ? (
            <InvestorEditor
              key="new"
              vocabulary={vocabulary.data}
              investor={null}
              onSaved={handleSaved}
            />
          ) : current ? (
            <InvestorEditor
              key={`${current.id}:${current.updatedAt}`}
              vocabulary={vocabulary.data}
              investor={current}
              onSaved={handleSaved}
            />
          ) : (
            <Card title="Investor detail">
              <p className="pf-card__note">
                Choose an investor to edit their details, or add a new one. The ticket size and the
                sectors they back are what shapes the offer a player receives.
              </p>
            </Card>
          )}
        </div>
      )}
    </>
  )
}

function InvestorEditor({
  vocabulary,
  investor,
  onSaved,
}: {
  vocabulary: WorldVocabulary | null
  investor: InvestorRecord | null
  onSaved: (message: string, selectId?: string | null) => void
}) {
  const [draft, setDraft] = useState<InvestorDraft>(() =>
    investor ? draftFromInvestor(investor) : emptyInvestorDraft(vocabulary),
  )
  const [customSector, setCustomSector] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  function patch(next: Partial<InvestorDraft>) {
    setDraft((current) => ({ ...current, ...next }))
  }

  function toggleSector(sector: string) {
    setDraft((current) => ({
      ...current,
      sectors: current.sectors.includes(sector)
        ? current.sectors.filter((entry) => entry !== sector)
        : [...current.sectors, sector],
    }))
  }

  function addCustomSector() {
    const value = customSector.trim()
    if (value.length === 0) return
    setDraft((current) =>
      current.sectors.includes(value)
        ? current
        : { ...current, sectors: [...current.sectors, value] },
    )
    setCustomSector('')
  }

  const canSave = draft.name.trim().length >= 2
  const knownSectors = vocabulary?.sectors ?? []
  const customSectors = draft.sectors.filter((sector) => !knownSectors.includes(sector))

  async function save() {
    if (!canSave || busy) return
    setBusy(true)
    setFailure(null)
    try {
      const body = investorDraftToPayload(draft)
      if (investor) {
        await api(`/admin/world/investors/${investor.id}`, { method: 'PUT', body })
        onSaved(`${body.name} updated.`)
      } else {
        const result = await api<{ investor: InvestorRecord | null }>('/admin/world/investors', {
          method: 'POST',
          body,
        })
        onSaved(`${body.name} added to the register.`, result.investor?.id ?? null)
      }
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'Those details could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!investor) return
    setBusy(true)
    setFailure(null)
    try {
      await api(`/admin/world/investors/${investor.id}`, { method: 'DELETE' })
      onSaved(`${investor.name} removed from the register.`, null)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That investor could not be removed.')
      setBusy(false)
    }
  }

  return (
    <Card
      title={investor ? investor.name : 'New investor'}
      meta={
        investor ? (
          investor.active ? (
            <Badge tone="good">Active</Badge>
          ) : (
            <Badge tone="warn">Withdrawn</Badge>
          )
        ) : (
          <Badge>Draft</Badge>
        )
      }
    >
      {failure && (
        <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }}>
          {failure}
        </div>
      )}

      {investor && (
        <div className="pf-inline-stats">
          <span>
            added {formatRelative(investor.createdAt)}
          </span>
          <span>updated {formatRelative(investor.updatedAt)}</span>
        </div>
      )}

      <div className="pf-form">
        <label className="pf-field">
          <span className="pf-field__label">Name</span>
          <input
            className="pf-input"
            type="text"
            maxLength={80}
            placeholder="e.g. Ngozi Adeyemi"
            value={draft.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
          <span className="pf-field__hint">This is the name the player sees in the city.</span>
        </label>

        <label className="pf-field">
          <span className="pf-field__label">Firm or fund</span>
          <input
            className="pf-input"
            type="text"
            maxLength={120}
            placeholder="e.g. Lagos Growth Partners"
            value={draft.organisation}
            onChange={(event) => patch({ organisation: event.target.value })}
          />
        </label>

        <div className="pf-field">
          <span className="pf-field__label">Stage they back</span>
          <div className="pf-picker">
            {(vocabulary?.investorStages ?? ['Any stage']).map((stage) => (
              <button
                className={`pf-picker__opt${draft.stageFocus === stage ? ' pf-picker__opt--on' : ''}`}
                key={stage}
                type="button"
                onClick={() => patch({ stageFocus: stage })}
              >
                {stage}
              </button>
            ))}
          </div>
        </div>

        <label className="pf-field">
          <span className="pf-field__label">Ticket size</span>
          <input
            className="pf-input"
            type="text"
            maxLength={60}
            placeholder="e.g. ₦5m – ₦20m"
            value={draft.ticket}
            onChange={(event) => patch({ ticket: event.target.value })}
          />
          <span className="pf-field__hint">Free text — it is shown to the player as written.</span>
        </label>

        <div className="pf-field">
          <span className="pf-field__label">Sectors they back</span>
          <div className="pf-picker">
            {knownSectors.map((sector) => {
              const on = draft.sectors.includes(sector)
              return (
                <button
                  className={`pf-picker__opt${on ? ' pf-picker__opt--on' : ''}`}
                  key={sector}
                  type="button"
                  onClick={() => toggleSector(sector)}
                >
                  {sector}
                </button>
              )
            })}
          </div>
          {customSectors.length > 0 && (
            <span className="pf-field__hint">Also backing: {customSectors.join(', ')}</span>
          )}
          <div className="pf-toolbar" style={{ marginTop: 8 }}>
            <input
              className="pf-input pf-input--grow"
              type="text"
              maxLength={60}
              placeholder="Add a sector not on this list"
              value={customSector}
              onChange={(event) => setCustomSector(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addCustomSector()
                }
              }}
            />
            <button
              className="pf-btn pf-btn--ghost pf-btn--sm"
              type="button"
              onClick={addCustomSector}
              disabled={customSector.trim().length === 0}
            >
              Add
            </button>
          </div>
        </div>

        <label className="pf-field">
          <span className="pf-field__label">Notes</span>
          <textarea
            className="pf-textarea"
            rows={3}
            maxLength={600}
            placeholder="What this investor looks for, and what they avoid."
            value={draft.notes}
            onChange={(event) => patch({ notes: event.target.value })}
          />
          <span className="pf-field__hint">Internal only — the player never sees this.</span>
        </label>

        <label className="pf-check">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => patch({ active: event.target.checked })}
          />
          Actively investing
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy || !canSave} onClick={save}>
            {busy ? 'Saving…' : investor ? 'Save investor' : 'Add investor'}
          </button>
          {investor &&
            (confirming ? (
              <>
                <button className="pf-btn pf-btn--danger" type="button" disabled={busy} onClick={remove}>
                  {busy ? 'Removing…' : 'Yes, remove'}
                </button>
                <button
                  className="pf-btn pf-btn--ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                className="pf-btn pf-btn--ghost"
                type="button"
                onClick={() => setConfirming(true)}
              >
                Remove investor
              </button>
            ))}
        </div>

        {confirming && (
          <p className="pf-field__hint">
            Removing is permanent. To keep the record but take them off the street, untick
            “Actively investing” and save instead.
          </p>
        )}
      </div>

      <div className="pf-preview">
        <div className="pf-preview__eyebrow">Player view · investor</div>
        <h3 className="pf-preview__title">{draft.name.trim() || 'Unnamed investor'}</h3>
        <p className="pf-preview__body">
          {draft.active
            ? `Appears in the business district as a named character, backing ${draft.stageFocus.toLowerCase()} companies${
                draft.sectors.length > 0 ? ` in ${draft.sectors.join(', ')}` : ''
              }.`
            : 'Withdrawn — the record is kept, but the player will not meet them in the city.'}
        </p>
        <div className="pf-preview__label">Details shown to the player</div>
        <ul className="pf-preview__list">
          <li>Firm — {draft.organisation.trim() || 'not given'}</li>
          <li>Ticket — {draft.ticket.trim() || 'not given'}</li>
          <li>
            Backs — {draft.sectors.length === 0 ? 'any sector' : draft.sectors.join(', ')}
          </li>
        </ul>
      </div>
    </Card>
  )
}
