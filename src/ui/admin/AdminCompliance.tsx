import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * Compliance & regulations.
 *
 * The regulatory requirements the city runs under and the penalty a business
 * faces for breaching each one. The severity decides how loudly the player is
 * warned; the administrator keeps this register honest.
 */

interface Option {
  value: string
  label: string
}

type Severity = 'info' | 'warning' | 'critical'

interface Compliance {
  id: string
  code: string
  title: string
  category: string
  requirement: string
  penalty: string
  severity: Severity
  active: boolean
  updatedAt: string
  updatedBy: string | null
}

interface CompliancePayload {
  rules: Compliance[]
  total: number
  active: number
}

interface SimMeta {
  complianceCategories: Option[]
  severities: string[]
}

function severityTone(severity: string): '' | 'warn' | 'bad' {
  if (severity === 'critical') return 'bad'
  if (severity === 'warning') return 'warn'
  return ''
}

export function AdminCompliance() {
  const compliance = useApi<CompliancePayload>('/admin/simulation/compliance')
  const meta = useApi<SimMeta>('/admin/simulation/meta')
  const [selected, setSelected] = useState<Compliance | null>(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const payload = compliance.data
  const vocabulary = meta.data
  const loading = compliance.loading || meta.loading
  const error = compliance.error ?? meta.error

  function reload() {
    compliance.reload()
    meta.reload()
  }

  const rows = payload?.rules ?? []

  function startCreate() {
    setSelected(null)
    setCreating(true)
    setFailure(null)
  }

  function startEdit(rule: Compliance) {
    setSelected(rule)
    setCreating(false)
    setFailure(null)
  }

  function closeForm() {
    setSelected(null)
    setCreating(false)
  }

  async function remove(rule: Compliance) {
    setBusyId(rule.id)
    setFailure(null)
    try {
      await api(`/admin/simulation/compliance/${rule.id}`, { method: 'DELETE' })
      setFlash(`The requirement ${rule.code} was removed.`)
      if (selected?.id === rule.id) closeForm()
      reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That requirement could not be removed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Compliance &amp; Regulations</h1>
          <p>
            The rules a business must satisfy to trade, and the penalty if it does not. Severity
            decides how the player is warned — informational, a warning, or a critical breach.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile
          label="Requirements"
          value={payload ? formatNumber(payload.total) : '—'}
          sub="On the register"
        />
        <StatTile
          label="Active"
          value={payload ? formatNumber(payload.active) : '—'}
          sub={payload && payload.active < payload.total ? `${formatNumber(payload.total - payload.active)} withdrawn` : 'All enforced'}
          tone="accent"
        />
      </div>

      {flash && (
        <div className="pf-notice pf-notice--good" style={{ marginBottom: 16 }}>
          {flash}
        </div>
      )}

      {loading || error ? (
        <StateBlock loading={loading} error={error} onRetry={reload} />
      ) : !payload || !vocabulary ? (
        <StateBlock loading={false} error={null} empty="The compliance register is unavailable." />
      ) : (
        <>
          <div className="pf-toolbar">
            <button className="pf-btn" type="button" onClick={startCreate}>
              New requirement
            </button>
          </div>

          {failure && !creating && !selected && <div className="pf-notice pf-notice--bad">{failure}</div>}

          {(creating || selected) && (
            <ComplianceForm
              key={selected ? selected.id : 'new'}
              rule={selected}
              categories={vocabulary.complianceCategories}
              severities={vocabulary.severities}
              onSaved={(message) => {
                setFlash(message)
                closeForm()
                reload()
              }}
              onCancel={closeForm}
            />
          )}

          <Card title="Register" meta={`${formatNumber(rows.length)} requirement${rows.length === 1 ? '' : 's'}`}>
            {rows.length === 0 ? (
              <p className="pf-card__note">No requirements have been recorded yet.</p>
            ) : (
              <div className="pf-table-wrap">
                <table className="pf-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Title</th>
                      <th>Category</th>
                      <th>Severity</th>
                      <th>State</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <span className="pf-mono">{rule.code}</span>
                        </td>
                        <td>
                          {rule.title}
                          <div className="pf-muted" style={{ fontSize: 12 }}>
                            changed {formatRelative(rule.updatedAt)}
                          </div>
                        </td>
                        <td>
                          {vocabulary.complianceCategories.find((option) => option.value === rule.category)?.label ??
                            rule.category}
                        </td>
                        <td>
                          <Badge tone={severityTone(rule.severity)}>
                            {rule.severity.charAt(0).toUpperCase() + rule.severity.slice(1)}
                          </Badge>
                        </td>
                        <td>{rule.active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Withdrawn</Badge>}</td>
                        <td>
                          <div className="pf-actions">
                            <button
                              className="pf-btn pf-btn--ghost pf-btn--sm"
                              type="button"
                              onClick={() => startEdit(rule)}
                            >
                              Edit
                            </button>
                            <button
                              className="pf-btn pf-btn--danger pf-btn--sm"
                              type="button"
                              disabled={busyId === rule.id}
                              onClick={() => remove(rule)}
                            >
                              {busyId === rule.id ? 'Removing…' : 'Delete'}
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
      )}
    </>
  )
}

function ComplianceForm({
  rule,
  categories,
  severities,
  onSaved,
  onCancel,
}: {
  rule: Compliance | null
  categories: Option[]
  severities: string[]
  onSaved: (message: string) => void
  onCancel: () => void
}) {
  const [code, setCode] = useState(rule?.code ?? '')
  const [title, setTitle] = useState(rule?.title ?? '')
  const [category, setCategory] = useState(rule?.category ?? categories[0]?.value ?? '')
  const [requirement, setRequirement] = useState(rule?.requirement ?? '')
  const [penalty, setPenalty] = useState(rule?.penalty ?? '')
  const [severity, setSeverity] = useState<Severity>((rule?.severity ?? 'info') as Severity)
  const [active, setActive] = useState(rule?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setFailure(null)
    const body = {
      code: code.trim(),
      title: title.trim(),
      category,
      requirement: requirement.trim(),
      penalty: penalty.trim(),
      severity,
      active,
    }
    try {
      if (rule) {
        await api(`/admin/simulation/compliance/${rule.id}`, { method: 'PUT', body })
        onSaved(`The requirement ${body.code} was updated.`)
      } else {
        await api('/admin/simulation/compliance', { method: 'POST', body })
        onSaved(`The requirement ${body.code} was added.`)
      }
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That requirement could not be saved.')
      setBusy(false)
    }
  }

  return (
    <Card title={rule ? `Edit ${rule.code}` : 'New requirement'}>
      <div className="pf-form">
        {failure && <div className="pf-notice pf-notice--bad">{failure}</div>}

        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">Code</span>
            <input
              className="pf-input"
              type="text"
              maxLength={20}
              value={code}
              placeholder="CAC-001"
              onChange={(event) => setCode(event.target.value)}
            />
            <span className="pf-field__hint">A short reference, e.g. CAC-001.</span>
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Category</span>
            <select
              className="pf-select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="pf-field">
          <span className="pf-field__label">Title</span>
          <input
            className="pf-input"
            type="text"
            maxLength={90}
            value={title}
            placeholder="Company registration"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>

        <label className="pf-field">
          <span className="pf-field__label">Requirement</span>
          <textarea
            className="pf-textarea"
            rows={3}
            maxLength={500}
            value={requirement}
            placeholder="What the business must satisfy."
            onChange={(event) => setRequirement(event.target.value)}
          />
          <span className="pf-field__hint">Between 8 and 500 characters.</span>
        </label>

        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">Penalty</span>
            <input
              className="pf-input"
              type="text"
              maxLength={200}
              value={penalty}
              placeholder="₦50,000 fine"
              onChange={(event) => setPenalty(event.target.value)}
            />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Severity</span>
            <select
              className="pf-select"
              value={severity}
              onChange={(event) => setSeverity(event.target.value as Severity)}
            >
              {severities.map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="pf-check">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Requirement is enforced
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : rule ? 'Save changes' : 'Add requirement'}
          </button>
          <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Card>
  )
}
