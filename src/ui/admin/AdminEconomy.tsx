import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Card, StateBlock, StatTile, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * Economy & market conditions.
 *
 * The dials here change the conditions every player experiences — inflation,
 * the cost of money, what suppliers charge and how much customers want. The
 * server holds the authoritative definitions and validates every value; this
 * screen simply presents them and writes back what the administrator chooses.
 */

interface Option {
  value: string
  label: string
}

interface SimSettings {
  inflationRate: number
  interestRate: number
  supplierCost: number
  customerDemand: number
  competition: number
  operatingCost: number
  fundingClimate: 'tight' | 'neutral' | 'favourable'
  paused: boolean
  notes: string
  updatedAt: string
  updatedBy: string | null
}

interface SimMeta {
  fundingClimates: Option[]
  ruleCategories: Option[]
  ruleValueTypes: string[]
  complianceCategories: Option[]
  severities: string[]
  eventKinds: Option[]
  eventScopes: Option[]
  eventStatuses: string[]
}

export function AdminEconomy() {
  const settings = useApi<{ settings: SimSettings }>('/admin/simulation/settings')
  const meta = useApi<SimMeta>('/admin/simulation/meta')
  const [flash, setFlash] = useState<string | null>(null)

  const loading = settings.loading || meta.loading
  const error = settings.error ?? meta.error

  function reload() {
    settings.reload()
    meta.reload()
  }

  const current = settings.data?.settings ?? null
  const climate = current && meta.data
    ? meta.data.fundingClimates.find((option) => option.value === current.fundingClimate)
    : undefined

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Economy &amp; Market Conditions</h1>
          <p>
            The macro conditions the simulation runs under. Inflation, the cost of borrowing and
            supplier pricing apply to every business; small nudges here are felt across the whole
            city, so change them deliberately.
          </p>
        </div>
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}

      {loading || error ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : !current || !meta.data ? (
        <StateBlock loading={false} error={null} empty="The simulation settings are unavailable." />
      ) : (
        <>
          {current.paused && (
            <div className="pf-alert pf-alert--warning">
              <span className="pf-alert__bar" />
              <div>
                <div className="pf-alert__title">Simulation paused</div>
                <div className="pf-alert__detail">
                  The simulation is paused — players cannot progress until it is resumed.
                </div>
              </div>
            </div>
          )}

          <div className="pf-stats">
            <StatTile
              label="Inflation"
              value={`${current.inflationRate}%`}
              sub="Annual price inflation"
              tone={current.inflationRate >= 20 ? 'warn' : ''}
            />
            <StatTile
              label="Interest rate"
              value={`${current.interestRate}%`}
              sub="Cost of borrowing"
              tone={current.interestRate >= 25 ? 'warn' : ''}
            />
            <StatTile
              label="Funding climate"
              value={climate ? climate.label.split('—')[0].trim() : current.fundingClimate}
              sub="Investor appetite"
              tone="accent"
            />
          </div>

          <Card
            title="Conditions"
            meta={
              <span>
                Last changed {formatRelative(current.updatedAt)}
                {current.updatedBy ? ` by ${current.updatedBy}` : ''}
              </span>
            }
          >
            <EconomyForm
              key={current.updatedAt}
              settings={current}
              meta={meta.data}
              onSaved={(message) => {
                setFlash(message)
                reload()
              }}
            />
          </Card>
        </>
      )}
    </>
  )
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  hint: string
  value: string
  onChange: (next: string) => void
  min: number
  max: number
}) {
  return (
    <label className="pf-field">
      <span className="pf-field__label">{label}</span>
      <input
        className="pf-input"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="pf-field__hint">{hint}</span>
    </label>
  )
}

function EconomyForm({
  settings,
  meta,
  onSaved,
}: {
  settings: SimSettings
  meta: SimMeta
  onSaved: (message: string) => void
}) {
  const [inflationRate, setInflationRate] = useState(String(settings.inflationRate))
  const [interestRate, setInterestRate] = useState(String(settings.interestRate))
  const [supplierCost, setSupplierCost] = useState(String(settings.supplierCost))
  const [customerDemand, setCustomerDemand] = useState(String(settings.customerDemand))
  const [competition, setCompetition] = useState(String(settings.competition))
  const [operatingCost, setOperatingCost] = useState(String(settings.operatingCost))
  const [fundingClimate, setFundingClimate] = useState<SimSettings['fundingClimate']>(settings.fundingClimate)
  const [paused, setPaused] = useState(settings.paused)
  const [notes, setNotes] = useState(settings.notes)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      await api('/admin/simulation/settings', {
        method: 'PUT',
        body: {
          inflationRate: Number(inflationRate),
          interestRate: Number(interestRate),
          supplierCost: Number(supplierCost),
          customerDemand: Number(customerDemand),
          competition: Number(competition),
          operatingCost: Number(operatingCost),
          fundingClimate,
          paused,
          notes: notes.trim(),
        },
      })
      onSaved('Economy updated. The new conditions apply to every player from now.')
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'Those settings could not be saved.')
      setBusy(false)
    }
  }

  return (
    <div className="pf-form">
      {failure && <div className="pf-notice pf-notice--bad">{failure}</div>}

      <div className="pf-field-row">
        <NumberField
          label="Inflation rate"
          value={inflationRate}
          onChange={setInflationRate}
          min={-50}
          max={200}
          hint="Annual price inflation, as a percentage. Between −50 and 200."
        />
        <NumberField
          label="Interest rate"
          value={interestRate}
          onChange={setInterestRate}
          min={0}
          max={100}
          hint="What borrowing costs. Between 0 and 100."
        />
      </div>

      <div className="pf-field-row">
        <NumberField
          label="Supplier cost"
          value={supplierCost}
          onChange={setSupplierCost}
          min={-100}
          max={400}
          hint="Percentage modifier to what suppliers charge. 0 leaves the authored price unchanged."
        />
        <NumberField
          label="Customer demand"
          value={customerDemand}
          onChange={setCustomerDemand}
          min={-100}
          max={400}
          hint="Percentage modifier to customer appetite. 0 leaves the authored demand unchanged."
        />
      </div>

      <div className="pf-field-row">
        <NumberField
          label="Competition"
          value={competition}
          onChange={setCompetition}
          min={-100}
          max={400}
          hint="Percentage modifier to how aggressively rivals compete. 0 is the baseline."
        />
        <NumberField
          label="Operating cost"
          value={operatingCost}
          onChange={setOperatingCost}
          min={-100}
          max={400}
          hint="Percentage modifier to the daily cost of running a business. 0 is the baseline."
        />
      </div>

      <label className="pf-field">
        <span className="pf-field__label">Funding climate</span>
        <select
          className="pf-select"
          value={fundingClimate}
          onChange={(event) => setFundingClimate(event.target.value as SimSettings['fundingClimate'])}
        >
          {meta.fundingClimates.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pf-field__hint">
          How willing investors are to deploy capital into businesses in the city.
        </span>
      </label>

      <label className="pf-check">
        <input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} />
        Pause the simulation
      </label>

      <label className="pf-field">
        <span className="pf-field__label">Notes</span>
        <textarea
          className="pf-textarea"
          rows={3}
          maxLength={600}
          value={notes}
          placeholder="Why these conditions are set this way — for the next administrator."
          onChange={(event) => setNotes(event.target.value)}
        />
        <span className="pf-field__hint">
          An internal note. It is not shown to players. Up to 600 characters.
        </span>
      </label>

      <div className="pf-actions">
        <button className="pf-btn" type="button" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save conditions'}
        </button>
      </div>
    </div>
  )
}
