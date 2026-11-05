import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber } from '../portal/common'
import { useApi } from '../portal/useApi'
import {
  FUNDING_CLIMATES,
  formatDateTime,
  statusTone,
  type ClassesPayload,
  type ScenarioInput,
  type ScenarioRow,
  type ScenarioRates,
  type ScenarioTemplate,
  type ScenariosPayload,
} from './api'

/**
 * The scenario builder.
 *
 * A scenario is a set of economic conditions a lecturer runs against a class —
 * a downturn, a supplier crisis, a funding round, or their own custom mix. Only
 * one scenario may run per class at a time, because two competing sets of
 * conditions would make the students' results impossible to read.
 */

const RATE_FIELDS: { key: keyof ScenarioRates; label: string; hint: string }[] = [
  { key: 'inflationRate', label: 'Inflation rate', hint: '% change' },
  { key: 'interestRate', label: 'Interest rate', hint: '% level' },
  { key: 'supplierCost', label: 'Supplier cost', hint: '% change' },
  { key: 'customerDemand', label: 'Customer demand', hint: '% change' },
  { key: 'competition', label: 'Competition', hint: '% change' },
  { key: 'operatingCost', label: 'Operating cost', hint: '% change' },
]

export function LecturerScenarios() {
  const { data, loading, error, reload } = useApi<ScenariosPayload>('/lecturer/scenarios')
  const classes = useApi<ClassesPayload>('/lecturer/classes')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const rows = data?.scenarios ?? []
  const running = rows.filter((row) => row.status === 'RUNNING')
  const templates = data?.templates ?? []

  const current = selected ? rows.find((row) => row.id === selected) ?? null : null

  function afterChange(message: string, select: string | null) {
    setFlash(message)
    setSelected(select)
    setCreating(false)
    reload()
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Scenario Builder</h1>
          <p>
            Run an economic scenario against a class. Students must trade through the conditions you
            set and defend the decisions they make.
          </p>
        </div>
        <div className="pf-actions">
          <button className="pf-btn" type="button" onClick={() => { setCreating(true); setSelected(null) }}>
            New scenario
          </button>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Scenarios" value={data ? formatNumber(rows.length) : '—'} sub="Saved for your classes" />
        <StatTile
          label="Running now"
          value={data ? formatNumber(running.length) : '—'}
          sub={running.length > 0 ? 'Live against a class' : 'Nothing running'}
          tone={running.length > 0 ? 'accent' : ''}
        />
      </div>

      {flash && <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>{flash}</div>}

      {loading || error || !data ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : rows.length === 0 && !creating ? (
        <StateBlock loading={false} error={null} empty="No scenarios yet. Build one from a template to run against a class." />
      ) : (
        <div className="pf-split">
          <Card title="Scenarios" meta={`${rows.length} saved`}>
            {rows.length === 0 ? (
              <p className="pf-card__note">None yet.</p>
            ) : (
              <div className="pf-level-list">
                {rows.map((row) => (
                  <button
                    className={`pf-level-list__item${selected === row.id ? ' pf-level-list__item--on' : ''}`}
                    key={row.id}
                    type="button"
                    onClick={() => { setSelected(row.id); setCreating(false) }}
                  >
                    <span className="pf-level-list__id">{row.template.slice(0, 2).toUpperCase()}</span>
                    <span className="pf-level-list__title">
                      {row.name}
                      <span className="pf-muted" style={{ display: 'block', fontSize: 12, fontWeight: 400 }}>
                        {row.className ?? 'No class'} · {row.status}
                      </span>
                    </span>
                    {row.status === 'RUNNING' && <span className="pf-level-list__flag">live</span>}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <div className="pf-col-stack">
            {creating ? (
              <ScenarioEditor templates={templates} classes={classes.data?.classes ?? []} onDone={afterChange} onCancel={() => setCreating(false)} />
            ) : current ? (
              <ScenarioPanel
                key={current.id}
                row={current}
                templates={templates}
                classes={classes.data?.classes ?? []}
                onDone={afterChange}
              />
            ) : (
              <Card title="Scenario detail">
                <p className="pf-card__note">Choose a scenario to edit, start or end it — or build a new one.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function ratesFromTemplate(template: ScenarioTemplate | undefined): Record<keyof ScenarioRates, string> {
  const rates = template?.rates
  const asText = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value))
  return {
    inflationRate: asText(rates?.inflationRate),
    interestRate: asText(rates?.interestRate),
    supplierCost: asText(rates?.supplierCost),
    customerDemand: asText(rates?.customerDemand),
    competition: asText(rates?.competition),
    operatingCost: asText(rates?.operatingCost),
    fundingClimate: rates?.fundingClimate ?? '',
  }
}

function toRates(values: Record<keyof ScenarioRates, string>): ScenarioRates {
  const num = (value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return {
    inflationRate: num(values.inflationRate),
    interestRate: num(values.interestRate),
    supplierCost: num(values.supplierCost),
    customerDemand: num(values.customerDemand),
    competition: num(values.competition),
    operatingCost: num(values.operatingCost),
    fundingClimate: values.fundingClimate.trim() || null,
  }
}

function ScenarioEditor({
  templates,
  classes,
  row,
  onDone,
  onCancel,
}: {
  templates: ScenarioTemplate[]
  classes: { id: string; name: string }[]
  row?: ScenarioRow
  onDone: (message: string, select: string | null) => void
  onCancel: () => void
}) {
  const firstTemplate = templates[0]
  const [name, setName] = useState(row?.name ?? '')
  const [classId, setClassId] = useState(row?.classId ?? '')
  const [template, setTemplate] = useState(row?.template ?? firstTemplate?.value ?? 'economic_downturn')
  const [description, setDescription] = useState(row?.description ?? firstTemplate?.description ?? '')
  const [rates, setRates] = useState<Record<keyof ScenarioRates, string>>(
    row
      ? ratesFromTemplate({ value: row.template, label: '', description: '', rates: row.rates, durationHours: row.durationHours, evaluationCriteria: [] })
      : ratesFromTemplate(firstTemplate),
  )
  const [durationHours, setDurationHours] = useState(row?.durationHours ?? firstTemplate?.durationHours ?? 48)
  const [criteria, setCriteria] = useState((row?.evaluationCriteria ?? firstTemplate?.evaluationCriteria ?? []).join('\n'))
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  function applyTemplate(value: string) {
    setTemplate(value)
    const def = templates.find((entry) => entry.value === value)
    if (!def) return
    setDescription(def.description)
    setRates(ratesFromTemplate(def))
    setDurationHours(def.durationHours || 48)
    setCriteria(def.evaluationCriteria.join('\n'))
  }

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      const body: ScenarioInput = {
        classId: classId || null,
        name: name.trim(),
        template,
        description: description.trim(),
        rates: toRates(rates),
        durationHours: Math.max(1, Math.round(durationHours)),
        evaluationCriteria: criteria
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0),
      }
      if (row) {
        await api(`/lecturer/scenarios/${row.id}`, { method: 'PUT', body })
        onDone(`"${body.name}" updated.`, row.id)
      } else {
        const created = await api<{ scenario: ScenarioRow | null }>('/lecturer/scenarios', { method: 'POST', body })
        onDone(`"${body.name}" built. Start it when you are ready.`, created.scenario?.id ?? null)
      }
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That scenario could not be saved.')
      setBusy(false)
    }
  }

  return (
    <Card title={row ? 'Edit scenario' : 'New scenario'}>
      {failure && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }}>{failure}</div>}
      <div className="pf-form">
        <label className="pf-field">
          <span className="pf-field__label">Template</span>
          <select className="pf-select" value={template} onChange={(event) => applyTemplate(event.target.value)}>
            {templates.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <span className="pf-field__hint">
            {templates.find((entry) => entry.value === template)?.description ?? ''}
          </span>
        </label>

        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">Name</span>
            <input
              className="pf-input"
              value={name}
              maxLength={90}
              placeholder="e.g. Term 2 inflation shock"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Class</span>
            <select className="pf-select" value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="">No class yet</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Duration (hours)</span>
            <input
              className="pf-input"
              type="number"
              min={1}
              max={720}
              value={durationHours}
              onChange={(event) => setDurationHours(Number(event.target.value) || 1)}
            />
          </label>
        </div>

        <label className="pf-field">
          <span className="pf-field__label">Description</span>
          <textarea
            className="pf-textarea"
            rows={3}
            maxLength={800}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <span className="pf-field__label">Conditions — leave a field blank to leave it unchanged</span>
        <div className="pf-field-row">
          {RATE_FIELDS.map((field) => (
            <label className="pf-field" key={field.key}>
              <span className="pf-field__label">{field.label}</span>
              <input
                className="pf-input"
                type="number"
                placeholder="—"
                value={rates[field.key] ?? ''}
                onChange={(event) => setRates((current) => ({ ...current, [field.key]: event.target.value }))}
              />
              <span className="pf-field__hint">{field.hint}</span>
            </label>
          ))}
          <label className="pf-field">
            <span className="pf-field__label">Funding climate</span>
            <select
              className="pf-select"
              value={rates.fundingClimate ?? ''}
              onChange={(event) => setRates((current) => ({ ...current, fundingClimate: event.target.value }))}
            >
              <option value="">Unchanged</option>
              {FUNDING_CLIMATES.map((climate) => (
                <option key={climate} value={climate}>
                  {climate}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="pf-field">
          <span className="pf-field__label">Evaluation criteria — one per line</span>
          <textarea
            className="pf-textarea"
            rows={3}
            value={criteria}
            placeholder="What the students are judged on during this scenario."
            onChange={(event) => setCriteria(event.target.value)}
          />
          <span className="pf-field__hint">Up to 10 criteria, each up to 200 characters.</span>
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy || name.trim().length < 2} onClick={save}>
            {busy ? 'Saving…' : row ? 'Save scenario' : 'Build scenario'}
          </button>
          <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Card>
  )
}

function ScenarioPanel({
  row,
  templates,
  classes,
  onDone,
}: {
  row: ScenarioRow
  templates: ScenarioTemplate[]
  classes: { id: string; name: string }[]
  onDone: (message: string, select: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function setStatus(status: 'RUNNING' | 'ENDED') {
    setBusy(status)
    setFailure(null)
    try {
      await api(`/lecturer/scenarios/${row.id}/status`, { method: 'POST', body: { status } })
      onDone(status === 'RUNNING' ? `"${row.name}" is now running.` : `"${row.name}" ended.`, row.id)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That action could not be completed.')
      setBusy(null)
    }
  }

  async function remove() {
    setBusy('delete')
    setFailure(null)
    try {
      await api(`/lecturer/scenarios/${row.id}`, { method: 'DELETE' })
      onDone(`"${row.name}" deleted.`, null)
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That scenario could not be deleted.')
      setBusy(null)
    }
  }

  if (editing) {
    return <ScenarioEditor row={row} templates={templates} classes={classes} onDone={onDone} onCancel={() => setEditing(false)} />
  }

  const templateLabel = templates.find((entry) => entry.value === row.template)?.label ?? row.template

  return (
    <Card
      title={row.name}
      meta={
        <div className="pf-chips">
          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
          <Badge>{templateLabel}</Badge>
        </div>
      }
    >
      {failure && <div className="pf-notice pf-notice--bad" style={{ marginBottom: 14 }}>{failure}</div>}

      <div className="pf-inline-stats">
        <span>{row.className ?? <span className="pf-muted">No class assigned</span>}</span>
        <span>{formatNumber(row.durationHours)} hours</span>
        {row.startedAt && <span>started {formatDateTime(row.startedAt)}</span>}
        {row.endsAt && <span>ends {formatDateTime(row.endsAt)}</span>}
      </div>

      {row.description && <p className="pf-card__note">{row.description}</p>}

      <div className="pf-dl" style={{ marginTop: 12 }}>
        <dt>Introduced in the game</dt>
        <dd>{templateLabel}</dd>
        <dt>Inflation</dt>
        <dd>{row.rates.inflationRate ?? <span className="pf-muted">unchanged</span>}%</dd>
        <dt>Interest rate</dt>
        <dd>{row.rates.interestRate ?? <span className="pf-muted">unchanged</span>}%</dd>
        <dt>Supplier cost</dt>
        <dd>{row.rates.supplierCost ?? <span className="pf-muted">unchanged</span>}%</dd>
        <dt>Customer demand</dt>
        <dd>{row.rates.customerDemand ?? <span className="pf-muted">unchanged</span>}%</dd>
        <dt>Competition</dt>
        <dd>{row.rates.competition ?? <span className="pf-muted">unchanged</span>}%</dd>
        <dt>Operating cost</dt>
        <dd>{row.rates.operatingCost ?? <span className="pf-muted">unchanged</span>}%</dd>
        <dt>Funding climate</dt>
        <dd>{row.rates.fundingClimate ?? <span className="pf-muted">unchanged</span>}</dd>
      </div>

      {row.evaluationCriteria.length > 0 && (
        <>
          <div className="pf-preview__label">Evaluation criteria</div>
          <ul className="pf-preview__list">
            {row.evaluationCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </>
      )}

      <div className="pf-actions" style={{ marginTop: 14 }}>
        {row.status === 'RUNNING' ? (
          <button className="pf-btn pf-btn--good" type="button" disabled={busy !== null} onClick={() => setStatus('ENDED')}>
            {busy === 'ENDED' ? 'Ending…' : 'End scenario'}
          </button>
        ) : (
          <>
            <button className="pf-btn" type="button" disabled={busy !== null} onClick={() => setStatus('RUNNING')}>
              {busy === 'RUNNING' ? 'Starting…' : 'Start scenario'}
            </button>
            <button className="pf-btn pf-btn--ghost" type="button" disabled={busy !== null} onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
        {row.status !== 'RUNNING' &&
          (confirmDelete ? (
            <>
              <button className="pf-btn pf-btn--danger" type="button" disabled={busy !== null} onClick={remove}>
                {busy === 'delete' ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button className="pf-btn pf-btn--ghost" type="button" disabled={busy !== null} onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="pf-btn pf-btn--ghost" type="button" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          ))}
      </div>

      <p className="pf-card__note" style={{ marginTop: 10 }}>
        Only one scenario may run per class at a time — if another is already running for this class,
        the server will refuse to start a second. A running scenario cannot be edited or deleted until
        it is ended.
      </p>
    </Card>
  )
}
