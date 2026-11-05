import { Router } from 'express'
import { z } from 'zod'
import {
  ClockError,
  TICK_MINUTES_RANGE,
  getClock,
  recentDayRuns,
  runTick,
  toClock,
  updateClock,
} from '../clock'
import { many, one, run } from '../db'
import { wrap } from '../middleware'
import { newId } from '../security'
import { audit } from '../users'
import {
  COMPLIANCE_CATEGORIES,
  EVENT_SCOPES,
  EVENT_STATUSES,
  EVENT_KINDS,
  FUNDING_CLIMATES,
  RULE_CATEGORIES,
  RULE_VALUE_TYPES,
  SEVERITIES,
  getSimSettings,
  simulationVocabulary,
  toCompliance,
  toEvent,
  toRule,
  toSimSettings,
  type ComplianceRow,
  type EventRow,
  type RuleRow,
} from '../simulation'

/**
 * Administrator simulation control.
 *
 * Four related controls live here: the economic dials, the behavioural rules,
 * the regulatory regime and the controlled events an administrator can inject
 * into the running simulation.
 *
 * Everything is validated against the vocabulary in `simulation.ts` and every
 * write is attributed in the audit trail, because these settings change the
 * conditions every player experiences.
 */

const router = Router()

router.get(
  '/simulation/meta',
  wrap(async (_req, res) => {
    res.json(simulationVocabulary())
  }),
)

/* --------------------------------------------------------------- the clock -- */

router.get(
  '/simulation/clock',
  wrap(async (_req, res) => {
    res.json({ clock: toClock(getClock()), days: recentDayRuns(14) })
  }),
)

const clockSchema = z.object({
  running: z.boolean().optional(),
  tickMinutes: z.number().int().min(TICK_MINUTES_RANGE.min).max(TICK_MINUTES_RANGE.max).optional(),
})

router.put(
  '/simulation/clock',
  wrap(async (req, res) => {
    const parsed = clockSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those values.' })
      return
    }

    try {
      updateClock(parsed.data, req.user!.id)
    } catch (error) {
      if (error instanceof ClockError) {
        res.status(400).json({ error: error.message })
        return
      }
      throw error
    }

    const clock = toClock(getClock())
    audit(
      req.user!.id,
      'admin.simulation.clock.update',
      `Clock ${clock.running ? 'running' : 'paused'} at ${clock.tickMinutes} min/tick`,
    )
    res.json({ clock })
  }),
)

const tickSchema = z.object({ count: z.number().int().min(1).max(1440).default(1) })

/**
 * Steps the world forward by hand.
 *
 * This is what lets an administrator advance a paused simulation — the tick is
 * forced, so the day boundaries it crosses are settled even while the clock is
 * stopped.
 */
router.post(
  '/simulation/clock/tick',
  wrap(async (req, res) => {
    const parsed = tickSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check that tick count.' })
      return
    }

    const result = runTick(parsed.data.count, { force: true })
    audit(
      req.user!.id,
      'admin.simulation.clock.tick',
      `Advanced the world ${result.applied} tick(s) to simulated day ${result.day}`,
    )
    res.json({ clock: toClock(getClock()), result, days: recentDayRuns(14) })
  }),
)

/* ------------------------------------------------------------- the economy -- */

router.get(
  '/simulation/settings',
  wrap(async (_req, res) => {
    res.json({ settings: toSimSettings(getSimSettings()) })
  }),
)

const settingsSchema = z.object({
  inflationRate: z.number().min(-50).max(200),
  interestRate: z.number().min(0).max(100),
  supplierCost: z.number().min(-100).max(400),
  customerDemand: z.number().min(-100).max(400),
  competition: z.number().min(-100).max(400),
  operatingCost: z.number().min(-100).max(400),
  fundingClimate: z.enum(FUNDING_CLIMATES),
  paused: z.boolean(),
  notes: z.string().trim().max(600).default(''),
})

router.put(
  '/simulation/settings',
  wrap(async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those values.' })
      return
    }

    const data = parsed.data
    run(
      `INSERT INTO simulation_settings
         (id, inflation_rate, interest_rate, supplier_cost, customer_demand, competition,
          operating_cost, funding_climate, paused, notes, updated_at, updated_by)
       VALUES ('global', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         inflation_rate = excluded.inflation_rate,
         interest_rate = excluded.interest_rate,
         supplier_cost = excluded.supplier_cost,
         customer_demand = excluded.customer_demand,
         competition = excluded.competition,
         operating_cost = excluded.operating_cost,
         funding_climate = excluded.funding_climate,
         paused = excluded.paused,
         notes = excluded.notes,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
      data.inflationRate,
      data.interestRate,
      data.supplierCost,
      data.customerDemand,
      data.competition,
      data.operatingCost,
      data.fundingClimate,
      data.paused ? 1 : 0,
      data.notes,
      new Date().toISOString(),
      req.user!.id,
    )

    audit(
      req.user!.id,
      'admin.simulation.settings',
      `Economy updated (inflation ${data.inflationRate}%, interest ${data.interestRate}%, ${data.paused ? 'paused' : 'running'})`,
    )

    res.json({ settings: toSimSettings(getSimSettings()) })
  }),
)

/* --------------------------------------------------------------- the rules -- */

router.get(
  '/simulation/rules',
  wrap(async (_req, res) => {
    const rows = many<RuleRow>('SELECT * FROM simulation_rules ORDER BY category ASC, label ASC')
    const byCategory = new Map<string, number>()
    for (const row of rows) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1)

    res.json({
      rules: rows.map(toRule),
      total: rows.length,
      active: rows.filter((row) => row.active === 1).length,
      byCategory: Array.from(byCategory.entries()).map(([category, count]) => ({ category, count })),
    })
  }),
)

/** A rule's value is stored as text; its type decides what "valid" means. */
function coerceRuleValue(valueType: string, raw: unknown): string | null {
  if (valueType === 'boolean') {
    if (typeof raw !== 'boolean') return null
    return raw ? 'true' : 'false'
  }
  if (valueType === 'text') {
    if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > 120) return null
    return raw.trim()
  }
  const num = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(num)) return null
  if (valueType === 'percent' && (num < 0 || num > 100)) return null
  if (valueType === 'number' && (num < -1_000_000 || num > 1_000_000_000)) return null
  return String(num)
}

const ruleSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{2,40}$/, 'Use a lowercase key, e.g. daily_operating_cost.'),
  label: z.string().trim().min(2, 'Give the rule a label.').max(80),
  category: z.enum(RULE_CATEGORIES),
  valueType: z.enum(RULE_VALUE_TYPES),
  value: z.union([z.string(), z.number(), z.boolean()]),
  description: z.string().trim().max(300).default(''),
  active: z.boolean().default(true),
})

router.post(
  '/simulation/rules',
  wrap(async (req, res) => {
    const parsed = ruleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the rule details.' })
      return
    }
    const data = parsed.data

    const value = coerceRuleValue(data.valueType, data.value)
    if (value === null) {
      res.status(400).json({ error: 'That value is not valid for the chosen type.' })
      return
    }
    if (one<{ id: string }>('SELECT id FROM simulation_rules WHERE key = ?', data.key)) {
      res.status(409).json({ error: 'A rule with that key already exists.' })
      return
    }

    const id = newId()
    run(
      `INSERT INTO simulation_rules (id, key, label, category, value, value_type, description, active, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.key,
      data.label,
      data.category,
      value,
      data.valueType,
      data.description,
      data.active ? 1 : 0,
      new Date().toISOString(),
      req.user!.id,
    )

    audit(req.user!.id, 'admin.simulation.rule.create', `Added the rule "${data.label}"`)
    const row = one<RuleRow>('SELECT * FROM simulation_rules WHERE id = ?', id)
    res.status(201).json({ rule: row ? toRule(row) : null })
  }),
)

const ruleUpdateSchema = z.object({
  label: z.string().trim().min(2).max(80),
  category: z.enum(RULE_CATEGORIES),
  valueType: z.enum(RULE_VALUE_TYPES),
  value: z.union([z.string(), z.number(), z.boolean()]),
  description: z.string().trim().max(300).default(''),
  active: z.boolean().default(true),
})

router.put(
  '/simulation/rules/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<RuleRow>('SELECT * FROM simulation_rules WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That rule does not exist.' })
      return
    }

    const parsed = ruleUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the rule details.' })
      return
    }
    const data = parsed.data
    const value = coerceRuleValue(data.valueType, data.value)
    if (value === null) {
      res.status(400).json({ error: 'That value is not valid for the chosen type.' })
      return
    }

    run(
      `UPDATE simulation_rules
       SET label = ?, category = ?, value = ?, value_type = ?, description = ?, active = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
      data.label,
      data.category,
      value,
      data.valueType,
      data.description,
      data.active ? 1 : 0,
      new Date().toISOString(),
      req.user!.id,
      id,
    )

    audit(req.user!.id, 'admin.simulation.rule.update', `Updated the rule "${data.label}" (${existing.key})`)
    const row = one<RuleRow>('SELECT * FROM simulation_rules WHERE id = ?', id)
    res.json({ rule: row ? toRule(row) : null })
  }),
)

router.delete(
  '/simulation/rules/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<RuleRow>('SELECT * FROM simulation_rules WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That rule does not exist.' })
      return
    }
    run('DELETE FROM simulation_rules WHERE id = ?', id)
    audit(req.user!.id, 'admin.simulation.rule.delete', `Removed the rule "${existing.label}"`)
    res.json({ ok: true })
  }),
)

/* ---------------------------------------------------------- the regulations -- */

router.get(
  '/simulation/compliance',
  wrap(async (_req, res) => {
    const rows = many<ComplianceRow>('SELECT * FROM compliance_rules ORDER BY category ASC, code ASC')
    res.json({
      rules: rows.map(toCompliance),
      total: rows.length,
      active: rows.filter((row) => row.active === 1).length,
    })
  }),
)

const complianceSchema = z.object({
  code: z.string().trim().min(2, 'Give the requirement a code.').max(20),
  title: z.string().trim().min(2, 'Give the requirement a title.').max(90),
  category: z.enum(COMPLIANCE_CATEGORIES),
  requirement: z.string().trim().min(8, 'Describe what must be satisfied.').max(500),
  penalty: z.string().trim().max(200).default(''),
  severity: z.enum(SEVERITIES),
  active: z.boolean().default(true),
})

router.post(
  '/simulation/compliance',
  wrap(async (req, res) => {
    const parsed = complianceSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those details.' })
      return
    }
    const data = parsed.data
    if (one<{ id: string }>('SELECT id FROM compliance_rules WHERE code = ?', data.code)) {
      res.status(409).json({ error: 'A requirement with that code already exists.' })
      return
    }

    const id = newId()
    run(
      `INSERT INTO compliance_rules (id, code, title, category, requirement, penalty, severity, active, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      data.code,
      data.title,
      data.category,
      data.requirement,
      data.penalty,
      data.severity,
      data.active ? 1 : 0,
      new Date().toISOString(),
      req.user!.id,
    )

    audit(req.user!.id, 'admin.simulation.compliance.create', `Added the requirement ${data.code}`)
    const row = one<ComplianceRow>('SELECT * FROM compliance_rules WHERE id = ?', id)
    res.status(201).json({ rule: row ? toCompliance(row) : null })
  }),
)

router.put(
  '/simulation/compliance/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<ComplianceRow>('SELECT * FROM compliance_rules WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That requirement does not exist.' })
      return
    }
    const parsed = complianceSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check those details.' })
      return
    }
    const data = parsed.data

    run(
      `UPDATE compliance_rules
       SET code = ?, title = ?, category = ?, requirement = ?, penalty = ?, severity = ?, active = ?, updated_at = ?, updated_by = ?
       WHERE id = ?`,
      data.code,
      data.title,
      data.category,
      data.requirement,
      data.penalty,
      data.severity,
      data.active ? 1 : 0,
      new Date().toISOString(),
      req.user!.id,
      id,
    )

    audit(req.user!.id, 'admin.simulation.compliance.update', `Updated the requirement ${data.code}`)
    const row = one<ComplianceRow>('SELECT * FROM compliance_rules WHERE id = ?', id)
    res.json({ rule: row ? toCompliance(row) : null })
  }),
)

router.delete(
  '/simulation/compliance/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<ComplianceRow>('SELECT * FROM compliance_rules WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That requirement does not exist.' })
      return
    }
    run('DELETE FROM compliance_rules WHERE id = ?', id)
    audit(req.user!.id, 'admin.simulation.compliance.delete', `Removed the requirement ${existing.code}`)
    res.json({ ok: true })
  }),
)

/* ---------------------------------------------------------------- events -- */

router.get(
  '/simulation/events',
  wrap(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : 'ALL'
    const clause =
      EVENT_STATUSES.includes(status as (typeof EVENT_STATUSES)[number]) ? 'WHERE status = ?' : ''
    const rows = many<EventRow>(
      `SELECT * FROM simulation_events ${clause} ORDER BY created_at DESC LIMIT 200`,
      ...(clause ? [status] : []),
    )
    res.json({
      events: rows.map(toEvent),
      total: rows.length,
      active: rows.filter((row) => row.status === 'ACTIVE').length,
      scheduled: rows.filter((row) => row.status === 'SCHEDULED').length,
    })
  }),
)

const eventSchema = z.object({
  name: z.string().trim().min(2, 'Name the event.').max(90),
  kind: z.enum(EVENT_KINDS),
  description: z.string().trim().max(600).default(''),
  scope: z.enum(EVENT_SCOPES),
  targets: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  impact: z.number().min(-100).max(400),
  durationHours: z.number().int().min(1).max(24 * 30),
  startsAt: z.string().trim().max(40).nullish(),
})

function validateTargets(scope: string, targets: string[]): string | null {
  if (scope === 'all') return null
  if (targets.length === 0) return 'Choose at least one target for this event.'
  return null
}

router.post(
  '/simulation/events',
  wrap(async (req, res) => {
    const parsed = eventSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the event details.' })
      return
    }
    const data = parsed.data
    const targetError = validateTargets(data.scope, data.targets)
    if (targetError) {
      res.status(400).json({ error: targetError })
      return
    }

    const id = newId()
    const now = new Date().toISOString()
    run(
      `INSERT INTO simulation_events
         (id, name, kind, description, scope, targets, impact, duration_hours, starts_at, ends_at, status, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'SCHEDULED', ?, ?, ?)`,
      id,
      data.name,
      data.kind,
      data.description,
      data.scope,
      JSON.stringify(data.scope === 'all' ? [] : data.targets),
      data.impact,
      data.durationHours,
      data.startsAt ?? null,
      now,
      now,
      req.user!.id,
    )

    audit(req.user!.id, 'admin.simulation.event.create', `Scheduled the event "${data.name}"`)
    const row = one<EventRow>('SELECT * FROM simulation_events WHERE id = ?', id)
    res.status(201).json({ event: row ? toEvent(row) : null })
  }),
)

router.put(
  '/simulation/events/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<EventRow>('SELECT * FROM simulation_events WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That event does not exist.' })
      return
    }
    if (existing.status === 'ENDED' || existing.status === 'CANCELLED') {
      res.status(400).json({ error: 'That event has finished and cannot be edited.' })
      return
    }

    const parsed = eventSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the event details.' })
      return
    }
    const data = parsed.data
    const targetError = validateTargets(data.scope, data.targets)
    if (targetError) {
      res.status(400).json({ error: targetError })
      return
    }

    run(
      `UPDATE simulation_events
       SET name = ?, kind = ?, description = ?, scope = ?, targets = ?, impact = ?, duration_hours = ?, starts_at = ?, updated_at = ?
       WHERE id = ?`,
      data.name,
      data.kind,
      data.description,
      data.scope,
      JSON.stringify(data.scope === 'all' ? [] : data.targets),
      data.impact,
      data.durationHours,
      data.startsAt ?? null,
      new Date().toISOString(),
      id,
    )

    audit(req.user!.id, 'admin.simulation.event.update', `Updated the event "${data.name}"`)
    const row = one<EventRow>('SELECT * FROM simulation_events WHERE id = ?', id)
    res.json({ event: row ? toEvent(row) : null })
  }),
)

/**
 * Drives an event through its lifecycle.
 *
 * Activating an event stamps the window it applies for: the duration chosen by
 * the administrator decides when it ends, so the impact is bounded rather than
 * permanent.
 */
router.post(
  '/simulation/events/:id/:action',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const action = String(req.params.action)
    if (!['activate', 'end', 'cancel'].includes(action)) {
      res.status(404).json({ error: 'Unknown action.' })
      return
    }

    const existing = one<EventRow>('SELECT * FROM simulation_events WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That event does not exist.' })
      return
    }

    const now = Date.now()
    const nowIso = new Date(now).toISOString()

    if (action === 'activate') {
      if (existing.status === 'ACTIVE') {
        res.status(400).json({ error: 'That event is already running.' })
        return
      }
      const endsAt = new Date(now + existing.duration_hours * 3_600_000).toISOString()
      run(
        "UPDATE simulation_events SET status = 'ACTIVE', starts_at = ?, ends_at = ?, updated_at = ? WHERE id = ?",
        nowIso,
        endsAt,
        nowIso,
        id,
      )
      audit(req.user!.id, 'admin.simulation.event.activate', `Activated the event "${existing.name}"`)
    } else if (action === 'end') {
      run(
        "UPDATE simulation_events SET status = 'ENDED', ends_at = ?, updated_at = ? WHERE id = ?",
        nowIso,
        nowIso,
        id,
      )
      audit(req.user!.id, 'admin.simulation.event.end', `Ended the event "${existing.name}"`)
    } else {
      run(
        "UPDATE simulation_events SET status = 'CANCELLED', updated_at = ? WHERE id = ?",
        nowIso,
        id,
      )
      audit(req.user!.id, 'admin.simulation.event.cancel', `Cancelled the event "${existing.name}"`)
    }

    const row = one<EventRow>('SELECT * FROM simulation_events WHERE id = ?', id)
    res.json({ event: row ? toEvent(row) : null })
  }),
)

router.delete(
  '/simulation/events/:id',
  wrap(async (req, res) => {
    const id = String(req.params.id)
    const existing = one<EventRow>('SELECT * FROM simulation_events WHERE id = ?', id)
    if (!existing) {
      res.status(404).json({ error: 'That event does not exist.' })
      return
    }
    run('DELETE FROM simulation_events WHERE id = ?', id)
    audit(req.user!.id, 'admin.simulation.event.delete', `Deleted the event "${existing.name}"`)
    res.json({ ok: true })
  }),
)

export default router
