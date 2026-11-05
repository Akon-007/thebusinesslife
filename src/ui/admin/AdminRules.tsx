import { useState } from 'react'
import { ApiError, api } from '../../api/client'
import { Badge, Card, StateBlock, StatTile, formatNumber, formatRelative } from '../portal/common'
import { useApi } from '../portal/useApi'

/**
 * Simulation rules.
 *
 * The named dials the simulation reads while it runs — starting capital, tax
 * rates, payment terms and so on. Each rule has a fixed key used by the engine
 * and a value whose meaning is set by its type. The key is the contract and
 * cannot be changed once a rule exists; everything else is editable.
 */

interface Option {
  value: string
  label: string
}

type RuleCategory = 'economy' | 'operations' | 'market' | 'funding' | 'progression'
type RuleValueType = 'number' | 'percent' | 'boolean' | 'text'

interface Rule {
  id: string
  key: string
  label: string
  category: RuleCategory
  value: string
  valueType: RuleValueType
  description: string
  active: boolean
  updatedAt: string
  updatedBy: string | null
}

interface RulesPayload {
  rules: Rule[]
  total: number
  active: number
  byCategory: { category: string; count: number }[]
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

function categoryLabel(categories: Option[], value: string): string {
  return categories.find((option) => option.value === value)?.label ?? value
}

function valueHint(valueType: RuleValueType): string {
  if (valueType === 'percent') return 'A percentage between 0 and 100.'
  if (valueType === 'number') return 'A whole or decimal number.'
  if (valueType === 'boolean') return 'On or off.'
  return 'Free text, up to 120 characters.'
}

export function AdminRules() {
  const rules = useApi<RulesPayload>('/admin/simulation/rules')
  const meta = useApi<SimMeta>('/admin/simulation/meta')
  const [category, setCategory] = useState('ALL')
  const [editing, setEditing] = useState<Rule | null>(null)
  const [creating, setCreating] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loading = rules.loading || meta.loading
  const error = rules.error ?? meta.error

  function reload() {
    rules.reload()
    meta.reload()
  }

  const payload = rules.data
  const vocabulary = meta.data
  const rows = payload?.rules ?? []
  const visible = category === 'ALL' ? rows : rows.filter((rule) => rule.category === category)

  function startCreate() {
    setEditing(null)
    setCreating(true)
    setFailure(null)
  }

  function startEdit(rule: Rule) {
    setEditing(rule)
    setCreating(false)
    setFailure(null)
  }

  function closeForm() {
    setEditing(null)
    setCreating(false)
  }

  async function remove(rule: Rule) {
    setBusyId(rule.id)
    setFailure(null)
    try {
      await api(`/admin/simulation/rules/${rule.id}`, { method: 'DELETE' })
      setFlash(`The rule "${rule.label}" was removed.`)
      if (editing?.id === rule.id) closeForm()
      reload()
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That rule could not be removed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="pf-page-head">
        <div>
          <h1>Simulation Rules</h1>
          <p>
            The named values the simulation engine reads while it runs. A rule's key is its identity
            and cannot be changed once created; the label, category, type and value can.
          </p>
        </div>
      </div>

      <div className="pf-stats">
        <StatTile label="Rules" value={rules.data ? formatNumber(rules.data.total) : '—'} sub="Defined on the platform" />
        <StatTile
          label="Active"
          value={rules.data ? formatNumber(rules.data.active) : '—'}
          sub={rules.data && rules.data.active < rules.data.total ? `${formatNumber(rules.data.total - rules.data.active)} switched off` : 'All in force'}
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
        <StateBlock loading={false} error={null} empty="The simulation rules are unavailable." />
      ) : (
        <>
          <div className="pf-toolbar">
            <select
              className="pf-select"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="ALL">All categories</option>
              {vocabulary.ruleCategories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="pf-btn" type="button" onClick={startCreate}>
              New rule
            </button>
          </div>

          {failure && !creating && !editing && (
            <div className="pf-notice pf-notice--bad">{failure}</div>
          )}

          {(creating || editing) && (
            <RuleForm
              key={editing ? editing.id : 'new'}
              rule={editing}
              categories={vocabulary.ruleCategories}
              valueTypes={vocabulary.ruleValueTypes}
              onSaved={(message) => {
                setFlash(message)
                closeForm()
                reload()
              }}
              onCancel={closeForm}
            />
          )}

          <Card title="Rules" meta={`${formatNumber(visible.length)} shown`}>
            {visible.length === 0 ? (
              <p className="pf-card__note">No rules match this category.</p>
            ) : (
              <div className="pf-table-wrap">
                <table className="pf-table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Key</th>
                      <th>Category</th>
                      <th className="pf-table__num">Value</th>
                      <th>State</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          {rule.label}
                          <div className="pf-muted" style={{ fontSize: 12 }}>
                            changed {formatRelative(rule.updatedAt)}
                          </div>
                        </td>
                        <td>
                          <span className="pf-mono pf-muted">{rule.key}</span>
                        </td>
                        <td>{categoryLabel(vocabulary.ruleCategories, rule.category)}</td>
                        <td className="pf-table__num">
                          {rule.valueType === 'percent'
                            ? `${rule.value}%`
                            : rule.valueType === 'boolean'
                              ? rule.value === 'true'
                                ? 'On'
                                : 'Off'
                              : rule.value}
                        </td>
                        <td>
                          {rule.active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Off</Badge>}
                        </td>
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

function RuleForm({
  rule,
  categories,
  valueTypes,
  onSaved,
  onCancel,
}: {
  rule: Rule | null
  categories: Option[]
  valueTypes: string[]
  onSaved: (message: string) => void
  onCancel: () => void
}) {
  const [key, setKey] = useState(rule?.key ?? '')
  const [label, setLabel] = useState(rule?.label ?? '')
  const [category, setCategory] = useState<RuleCategory>((rule?.category ?? categories[0]?.value ?? 'economy') as RuleCategory)
  const [valueType, setValueType] = useState<RuleValueType>((rule?.valueType ?? 'number') as RuleValueType)
  const [valueText, setValueText] = useState(rule && rule.valueType !== 'boolean' ? rule.value : '')
  const [valueBool, setValueBool] = useState(rule?.valueType === 'boolean' && rule.value === 'true')
  const [description, setDescription] = useState(rule?.description ?? '')
  const [active, setActive] = useState(rule?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  function valueForType(): string | number | boolean {
    if (valueType === 'boolean') return valueBool
    if (valueType === 'text') return valueText.trim()
    return Number(valueText)
  }

  async function save() {
    setBusy(true)
    setFailure(null)
    try {
      if (rule) {
        await api(`/admin/simulation/rules/${rule.id}`, {
          method: 'PUT',
          body: {
            label: label.trim(),
            category,
            valueType,
            value: valueForType(),
            description: description.trim(),
            active,
          },
        })
        onSaved(`The rule "${label.trim()}" was updated.`)
      } else {
        await api('/admin/simulation/rules', {
          method: 'POST',
          body: {
            key: key.trim(),
            label: label.trim(),
            category,
            valueType,
            value: valueForType(),
            description: description.trim(),
            active,
          },
        })
        onSaved(`The rule "${label.trim()}" was created.`)
      }
    } catch (cause) {
      setFailure(cause instanceof ApiError ? cause.message : 'That rule could not be saved.')
      setBusy(false)
    }
  }

  return (
    <Card title={rule ? `Edit "${rule.label}"` : 'New rule'} meta={rule ? <span className="pf-mono">{rule.key}</span> : 'Create'}>
      <div className="pf-form">
        {failure && <div className="pf-notice pf-notice--bad">{failure}</div>}

        {!rule && (
          <label className="pf-field">
            <span className="pf-field__label">Key</span>
            <input
              className="pf-input"
              type="text"
              value={key}
              pattern="^[a-z][a-z0-9_]{2,40}$"
              placeholder="daily_operating_cost"
              title="Lowercase letters, numbers and underscores, starting with a letter."
              onChange={(event) => setKey(event.target.value)}
            />
            <span className="pf-field__hint">
              The engine reads rules by key, so it must be lowercase and stable — letters, numbers
              and underscores only, e.g. daily_operating_cost. It cannot be changed later.
            </span>
          </label>
        )}

        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">Label</span>
            <input
              className="pf-input"
              type="text"
              maxLength={80}
              value={label}
              placeholder="Base daily operating cost"
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="pf-field">
            <span className="pf-field__label">Category</span>
            <select
              className="pf-select"
              value={category}
              onChange={(event) => setCategory(event.target.value as RuleCategory)}
            >
              {categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="pf-field-row">
          <label className="pf-field">
            <span className="pf-field__label">Value type</span>
            <select
              className="pf-select"
              value={valueType}
              onChange={(event) => setValueType(event.target.value as RuleValueType)}
            >
              {valueTypes.map((type) => (
                <option key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
            <span className="pf-field__hint">{valueHint(valueType)}</span>
          </label>

          {valueType === 'boolean' ? (
            <label className="pf-field">
              <span className="pf-field__label">Value</span>
              <label className="pf-check">
                <input
                  type="checkbox"
                  checked={valueBool}
                  onChange={(event) => setValueBool(event.target.checked)}
                />
                {valueBool ? 'On' : 'Off'}
              </label>
            </label>
          ) : (
            <label className="pf-field">
              <span className="pf-field__label">Value</span>
              <input
                className="pf-input"
                type={valueType === 'text' ? 'text' : 'number'}
                maxLength={valueType === 'text' ? 120 : undefined}
                value={valueText}
                onChange={(event) => setValueText(event.target.value)}
              />
              <span className="pf-field__hint">{valueHint(valueType)}</span>
            </label>
          )}
        </div>

        <label className="pf-field">
          <span className="pf-field__label">Description</span>
          <textarea
            className="pf-textarea"
            rows={2}
            maxLength={300}
            value={description}
            placeholder="What this rule controls, in one sentence."
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        <label className="pf-check">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Rule is active
        </label>

        <div className="pf-actions">
          <button className="pf-btn" type="button" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}
          </button>
          <button className="pf-btn pf-btn--ghost" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Card>
  )
}
