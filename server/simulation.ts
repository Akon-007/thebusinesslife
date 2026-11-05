import { one, run } from './db'
import { newId } from './security'

/**
 * The controlled vocabulary of the simulation controls.
 *
 * The administrator portal can retune the economy, the rules and the regulatory
 * regime without touching source code, but only within the terms defined here —
 * the same contract pattern `content.ts` and `world.ts` use for levels and the
 * city. Everything is validated against these lists before it is stored.
 *
 * The starting rows written by `ensureSimulationDefaults` are genuine, editable
 * configuration, not sample data: the simulation is always in a defined state,
 * and an administrator changes it from that baseline.
 */

/* ------------------------------------------------------------- the economy -- */

export const FUNDING_CLIMATES = ['tight', 'neutral', 'favourable'] as const
export type FundingClimate = (typeof FUNDING_CLIMATES)[number]

export const FUNDING_CLIMATE_LABELS: Record<FundingClimate, string> = {
  tight: 'Tight — capital is scarce and terms are harsh',
  neutral: 'Neutral — normal market conditions',
  favourable: 'Favourable — investors are actively deploying',
}

export interface SimSettingsRow {
  id: string
  inflation_rate: number
  interest_rate: number
  supplier_cost: number
  customer_demand: number
  competition: number
  operating_cost: number
  funding_climate: string
  paused: number
  notes: string
  updated_at: string
  updated_by: string | null
}

export function toSimSettings(row: SimSettingsRow) {
  return {
    inflationRate: Number(row.inflation_rate),
    interestRate: Number(row.interest_rate),
    supplierCost: Number(row.supplier_cost),
    customerDemand: Number(row.customer_demand),
    competition: Number(row.competition),
    operatingCost: Number(row.operating_cost),
    fundingClimate: row.funding_climate,
    paused: row.paused === 1,
    notes: row.notes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export function getSimSettings(): SimSettingsRow {
  const row = one<SimSettingsRow>("SELECT * FROM simulation_settings WHERE id = 'global'")
  if (row) return row
  // Defensive: the row is created on boot, but a hand-edited database should
  // still read as a defined state rather than an error.
  return {
    id: 'global',
    inflation_rate: 12.5,
    interest_rate: 18,
    supplier_cost: 0,
    customer_demand: 0,
    competition: 0,
    operating_cost: 0,
    funding_climate: 'neutral',
    paused: 0,
    notes: '',
    updated_at: new Date().toISOString(),
    updated_by: null,
  }
}

/* --------------------------------------------------------------- the rules -- */

export const RULE_CATEGORIES = ['economy', 'operations', 'market', 'funding', 'progression'] as const
export type RuleCategory = (typeof RULE_CATEGORIES)[number]

export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  economy: 'Economy',
  operations: 'Operations',
  market: 'Market',
  funding: 'Funding',
  progression: 'Progression',
}

export const RULE_VALUE_TYPES = ['number', 'percent', 'boolean', 'text'] as const
export type RuleValueType = (typeof RULE_VALUE_TYPES)[number]

export interface RuleRow {
  id: string
  key: string
  label: string
  category: string
  value: string
  value_type: string
  description: string
  active: number
  updated_at: string
  updated_by: string | null
}

export function toRule(row: RuleRow) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    category: row.category,
    value: row.value,
    valueType: row.value_type,
    description: row.description,
    active: row.active === 1,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

interface RuleSeed {
  key: string
  label: string
  category: RuleCategory
  value: string
  valueType: RuleValueType
  description: string
}

const DEFAULT_RULES: RuleSeed[] = [
  { key: 'starting_capital', label: 'Starting capital', category: 'funding', value: '0', valueType: 'number', description: 'Cash a new business begins the simulation with. Zero by default: money only appears through a recorded contribution, funding agreement or customer payment.' },
  { key: 'daily_operating_cost', label: 'Base daily operating cost', category: 'operations', value: '12000', valueType: 'number', description: 'Fixed cost charged per simulated day, before economic modifiers.' },
  { key: 'company_tax_rate', label: 'Company tax rate', category: 'economy', value: '30', valueType: 'percent', description: 'Share of profit deducted by the tax office each period.' },
  { key: 'supplier_payment_terms', label: 'Supplier payment terms', category: 'operations', value: '30', valueType: 'number', description: 'Days a supplier allows before payment is due.' },
  { key: 'customer_churn', label: 'Baseline customer churn', category: 'market', value: '8', valueType: 'percent', description: 'Share of customers lost each period before retention actions.' },
  { key: 'marketing_reach', label: 'Marketing reach multiplier', category: 'market', value: '1', valueType: 'number', description: 'How far a marketing spend travels. 1.0 is the authored baseline.' },
  { key: 'loan_approval_score', label: 'Loan approval score', category: 'funding', value: '60', valueType: 'number', description: 'Business readiness score a bank requires before approving a loan.' },
  { key: 'funding_dilution', label: 'Equity per funding round', category: 'funding', value: '15', valueType: 'percent', description: 'Equity a founder gives up in a standard funding round.' },
  { key: 'max_employees_per_level', label: 'Maximum employees per level', category: 'operations', value: '5', valueType: 'number', description: 'Headcount a business may add at each progression level.' },
  { key: 'xp_multiplier', label: 'XP multiplier', category: 'progression', value: '1', valueType: 'number', description: 'Scales every experience award. 1.0 keeps the authored pace.' },
  { key: 'allow_bankruptcy', label: 'Allow bankruptcy', category: 'operations', value: 'true', valueType: 'boolean', description: 'Whether a business that runs out of cash is closed.' },
  { key: 'require_registration', label: 'Require company registration', category: 'progression', value: 'true', valueType: 'boolean', description: 'A business must be registered before it can trade.' },
]

/* ---------------------------------------------------------- the regulations -- */

export const COMPLIANCE_CATEGORIES = ['registration', 'tax', 'licensing', 'labour', 'environment'] as const
export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number]

export const COMPLIANCE_CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  registration: 'Registration',
  tax: 'Tax',
  licensing: 'Licensing',
  labour: 'Labour',
  environment: 'Environment',
}

export const SEVERITIES = ['info', 'warning', 'critical'] as const
export type Severity = (typeof SEVERITIES)[number]

export interface ComplianceRow {
  id: string
  code: string
  title: string
  category: string
  requirement: string
  penalty: string
  severity: string
  active: number
  updated_at: string
  updated_by: string | null
}

export function toCompliance(row: ComplianceRow) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    requirement: row.requirement,
    penalty: row.penalty,
    severity: row.severity,
    active: row.active === 1,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

interface ComplianceSeed {
  code: string
  title: string
  category: ComplianceCategory
  requirement: string
  penalty: string
  severity: Severity
}

const DEFAULT_COMPLIANCE: ComplianceSeed[] = [
  { code: 'CAC-001', title: 'Company registration', category: 'registration', requirement: 'The business must be registered with the Corporate Affairs Commission before trading.', penalty: '₦50,000 fine and suspension of trading', severity: 'critical' },
  { code: 'TAX-001', title: 'Tax identification number', category: 'tax', requirement: 'A valid TIN must be recorded on the business record.', penalty: '₦25,000 fine', severity: 'warning' },
  { code: 'TAX-002', title: 'VAT registration', category: 'tax', requirement: 'Businesses above the VAT threshold must be registered for VAT.', penalty: 'Back-dated VAT liability', severity: 'warning' },
  { code: 'LIC-001', title: 'Sector operating licence', category: 'licensing', requirement: 'A current sector-specific operating licence must be held.', penalty: 'Operating permit revoked', severity: 'critical' },
  { code: 'LAB-001', title: 'Written employee contracts', category: 'labour', requirement: 'Every employee must have a written contract on file.', penalty: 'Exposure at the labour tribunal', severity: 'warning' },
  { code: 'ENV-001', title: 'Waste disposal permit', category: 'environment', requirement: 'Businesses producing waste must hold a disposal permit.', penalty: '₦15,000 fine', severity: 'info' },
]

/* ------------------------------------------------------------- the events -- */

export const EVENT_KINDS = [
  'fuel_price',
  'supplier_disruption',
  'inflation_spike',
  'interest_rate',
  'demand_decline',
  'regulatory_change',
  'currency_fluctuation',
  'festive_demand',
] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
  fuel_price: 'Fuel price increase',
  supplier_disruption: 'Supplier disruption',
  inflation_spike: 'Inflation spike',
  interest_rate: 'Interest rate increase',
  demand_decline: 'Market demand decline',
  regulatory_change: 'Regulatory change',
  currency_fluctuation: 'Currency fluctuation',
  festive_demand: 'Festive demand surge',
}

export const EVENT_SCOPES = ['all', 'sector', 'district', 'class', 'student'] as const
export type EventScope = (typeof EVENT_SCOPES)[number]

export const EVENT_SCOPE_LABELS: Record<EventScope, string> = {
  all: 'Every player',
  sector: 'A business sector',
  district: 'A city district',
  class: 'A class',
  student: 'A single student',
}

export const EVENT_STATUSES = ['SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export interface EventRow {
  id: string
  name: string
  kind: string
  description: string
  scope: string
  targets: string
  impact: number
  duration_hours: number
  starts_at: string | null
  ends_at: string | null
  status: string
  created_at: string
  updated_at: string
  created_by: string | null
}

function parseTargets(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    /* fall through */
  }
  return []
}

export function toEvent(row: EventRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    kindLabel: EVENT_KIND_LABELS[row.kind as EventKind] ?? row.kind,
    description: row.description,
    scope: row.scope,
    targets: parseTargets(row.targets),
    impact: Number(row.impact),
    durationHours: Number(row.duration_hours),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
  }
}

/** The vocabulary every simulation-control screen renders its pickers from. */
export function simulationVocabulary() {
  return {
    fundingClimates: FUNDING_CLIMATES.map((value) => ({ value, label: FUNDING_CLIMATE_LABELS[value] })),
    ruleCategories: RULE_CATEGORIES.map((value) => ({ value, label: RULE_CATEGORY_LABELS[value] })),
    ruleValueTypes: [...RULE_VALUE_TYPES],
    complianceCategories: COMPLIANCE_CATEGORIES.map((value) => ({ value, label: COMPLIANCE_CATEGORY_LABELS[value] })),
    severities: [...SEVERITIES],
    eventKinds: EVENT_KINDS.map((value) => ({ value, label: EVENT_KIND_LABELS[value] })),
    eventScopes: EVENT_SCOPES.map((value) => ({ value, label: EVENT_SCOPE_LABELS[value] })),
    eventStatuses: [...EVENT_STATUSES],
  }
}

/* ------------------------------------------------------------------ seeding -- */

/**
 * Writes the simulation's starting configuration.
 *
 * Idempotent: it only inserts what is missing, so an administrator's edits are
 * never overwritten by a restart.
 */
export function ensureSimulationDefaults(): void {
  const now = new Date().toISOString()

  const settings = one<{ id: string }>("SELECT id FROM simulation_settings WHERE id = 'global'")
  if (!settings) {
    run(
      `INSERT INTO simulation_settings (id, updated_at) VALUES ('global', ?)`,
      now,
    )
  }

  const ruleCount = one<{ n: number }>('SELECT COUNT(*) AS n FROM simulation_rules')
  if (!ruleCount || Number(ruleCount.n) === 0) {
    for (const rule of DEFAULT_RULES) {
      run(
        `INSERT INTO simulation_rules (id, key, label, category, value, value_type, description, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        newId(),
        rule.key,
        rule.label,
        rule.category,
        rule.value,
        rule.valueType,
        rule.description,
        now,
      )
    }
  }

  // A database seeded before cash was removed still carries the old default of
  // ₦50,000. Correct it once, but only if an administrator never edited it —
  // a deliberately configured starting capital is left alone.
  const untouchedCapital = one<{ id: string }>(
    "SELECT id FROM simulation_rules WHERE key = 'starting_capital' AND value = '50000' AND updated_by IS NULL",
  )
  if (untouchedCapital) {
    run(
      "UPDATE simulation_rules SET value = '0', updated_at = ? WHERE id = ?",
      now,
      untouchedCapital.id,
    )
  }

  const complianceCount = one<{ n: number }>('SELECT COUNT(*) AS n FROM compliance_rules')
  if (!complianceCount || Number(complianceCount.n) === 0) {
    for (const rule of DEFAULT_COMPLIANCE) {
      run(
        `INSERT INTO compliance_rules (id, code, title, category, requirement, penalty, severity, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        newId(),
        rule.code,
        rule.title,
        rule.category,
        rule.requirement,
        rule.penalty,
        rule.severity,
        now,
      )
    }
  }
}
