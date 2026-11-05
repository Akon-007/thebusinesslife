import { many, one, run, transaction } from './db'
import { CODES, cashBalanceKobo, formatKobo, postJournalEntry, toKobo } from './finance'
import { emitEvent } from './outbox'
import { RULE_VERSIONS } from './rules'
import { newId } from './security'
import { getSimSettings, type EventRow } from './simulation'

/**
 * The simulation clock.
 *
 * The world runs on its own time, which advances faster than wall-clock time.
 * One discrete step — a *tick* — moves the simulated instant forward by a
 * configured number of minutes; a tick that carries the clock across a day
 * boundary settles that day.
 *
 * Settling a day is the moment the economy actually happens: every business
 * that is open pays its operating cost for that day. The charge is posted to
 * the company's ledger under a key derived from the company and the day, so a
 * tick that is applied twice still posts once — the same guarantee the rest of
 * the money layer holds.
 *
 * Nothing here invents money. The cost is a real expense on the company's books
 * and is only ever paid out of cash the ledger says the company has.
 */

export const MINUTES_PER_DAY = 24 * 60
const MS_PER_MINUTE = 60_000
const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE

/** Bounds an administrator's tick length. */
export const TICK_MINUTES_RANGE = { min: 1, max: MINUTES_PER_DAY } as const

/**
 * How often the running clock ticks, in real milliseconds.
 *
 * One tick per five real seconds at the default one-hour tick means a simulated
 * day passes in about two real minutes — fast enough to see a business age
 * within a lesson, slow enough that a decision made now still matters.
 */
export const TICK_INTERVAL_MS = 5_000

/** The rule that sets the authored daily cost, before economic modifiers. */
const OPERATING_COST_RULE = 'daily_operating_cost'
const DEFAULT_DAILY_OPERATING_COST = 12_000

/** Something the caller asked for that cannot be done. Routes turn this into a 400. */
export class ClockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClockError'
  }
}

export interface ClockRow {
  id: string
  sim_time: string
  sim_started_at: string
  running: number
  tick_minutes: number
  ticks: number
  last_tick_at: string | null
  updated_at: string
  updated_by: string | null
}

/** The simulated day a given instant falls on, counting from when the clock began. */
export function dayNumber(simMs: number, startedAt: string): number {
  const startMs = Date.parse(startedAt)
  if (!Number.isFinite(simMs) || !Number.isFinite(startMs)) return 1
  return Math.floor(Math.max(0, simMs - startMs) / MS_PER_DAY) + 1
}

export function toClock(row: ClockRow) {
  const simMs = Date.parse(row.sim_time)
  const elapsedMinutes = Math.max(0, Math.floor((simMs - Date.parse(row.sim_started_at)) / MS_PER_MINUTE))
  const minutesPerRealMinute = row.tick_minutes / (TICK_INTERVAL_MS / MS_PER_MINUTE)

  return {
    simTime: row.sim_time,
    simStartedAt: row.sim_started_at,
    day: dayNumber(simMs, row.sim_started_at),
    minuteOfDay: elapsedMinutes % MINUTES_PER_DAY,
    elapsedMinutes,
    running: row.running === 1,
    tickMinutes: row.tick_minutes,
    ticks: row.ticks,
    lastTickAt: row.last_tick_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    /** How much simulated time passes per minute of real time at this tick rate. */
    simMinutesPerRealMinute: Math.round(minutesPerRealMinute * 100) / 100,
    tickIntervalMs: TICK_INTERVAL_MS,
    tickMinutesRange: { ...TICK_MINUTES_RANGE },
  }
}

export type ClockView = ReturnType<typeof toClock>

/**
 * The clock row, created on first ask.
 *
 * A hand-edited or freshly-created database still reads as a defined state: the
 * simulation is never "off", it is at a known instant waiting to be advanced.
 */
export function ensureClock(): ClockRow {
  const existing = one<ClockRow>("SELECT * FROM sim_clock WHERE id = 'global'")
  if (existing) return existing

  const now = new Date().toISOString()
  run(
    `INSERT INTO sim_clock (id, sim_time, sim_started_at, running, tick_minutes, ticks, updated_at)
     VALUES ('global', ?, ?, 1, 60, 0, ?)`,
    now,
    now,
    now,
  )
  const created = one<ClockRow>("SELECT * FROM sim_clock WHERE id = 'global'")
  if (!created) throw new ClockError('the simulation clock could not be created.')
  return created
}

export function getClock(): ClockRow {
  return ensureClock()
}

/** Changes how fast the world runs, or stops it. */
export function updateClock(
  input: { running?: boolean; tickMinutes?: number },
  userId: string | null,
): ClockRow {
  const row = ensureClock()
  const running = input.running ?? row.running === 1
  const tickMinutes = input.tickMinutes ?? row.tick_minutes

  if (
    !Number.isInteger(tickMinutes) ||
    tickMinutes < TICK_MINUTES_RANGE.min ||
    tickMinutes > TICK_MINUTES_RANGE.max
  ) {
    throw new ClockError(
      `a tick must be a whole number of minutes between ${TICK_MINUTES_RANGE.min} and ${TICK_MINUTES_RANGE.max}.`,
    )
  }

  run(
    `UPDATE sim_clock SET running = ?, tick_minutes = ?, updated_at = ?, updated_by = ? WHERE id = 'global'`,
    running ? 1 : 0,
    tickMinutes,
    new Date().toISOString(),
    userId,
  )
  return ensureClock()
}

/* ----------------------------------------------------------- the economy -- */

/** Reads a numeric simulation rule, falling back to a safe default. */
function ruleNumber(ruleKey: string, fallback: number): number {
  const row = one<{ value: string }>('SELECT value FROM simulation_rules WHERE key = ?', ruleKey)
  const parsed = row ? Number(row.value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * The daily operating cost one business pays, in kobo.
 *
 * The authored figure is the baseline; the administrator's operating-cost dial
 * and the rate of inflation both scale it, so the economy screen is felt here
 * rather than sitting inert in a table.
 */
export function dailyOperatingCostKobo(): number {
  const settings = getSimSettings()
  const base = ruleNumber(OPERATING_COST_RULE, DEFAULT_DAILY_OPERATING_COST)
  const modified = base * (1 + settings.operating_cost / 100) * (1 + settings.inflation_rate / 100)
  if (!Number.isFinite(modified) || modified <= 0) return 0
  return toKobo(modified)
}

export interface SettledDay {
  day: number
  /** How many open businesses were charged. */
  companies: number
  chargedKobo: number
  /** Open businesses that could not afford the cost. */
  unpaid: number
  /** True when this day had already been settled by an earlier tick. */
  alreadySettled: boolean
}

/**
 * Charges every open business for one simulated day.
 *
 * A business that cannot cover the cost is left alone rather than pushed
 * negative: the day is recorded against it and an outbox event explains the
 * shortfall, so the books never show money the company does not have.
 */
function settleDay(day: number, occurredAt: string): SettledDay {
  if (one<{ id: string }>('SELECT id FROM sim_day_runs WHERE day = ?', day)) {
    return { day, companies: 0, chargedKobo: 0, unpaid: 0, alreadySettled: true }
  }

  const costKobo = dailyOperatingCostKobo()
  const open = many<{ id: string }>("SELECT id FROM companies WHERE operational_status = 'OPEN'")

  let chargedKobo = 0
  let companies = 0
  let unpaid = 0

  for (const company of open) {
    if (costKobo <= 0) break

    const idempotencyKey = `tick:operating:${company.id}:${day}`
    // A day can only be settled once, but the ledger is the authority on that:
    // if the key is already there, the charge for this company is already made.
    if (one<{ id: string }>('SELECT id FROM journal_entries WHERE idempotency_key = ?', idempotencyKey)) {
      continue
    }

    if (cashBalanceKobo(company.id) < costKobo) {
      unpaid += 1
      emitEvent({
        companyId: company.id,
        type: 'company.operating_cost_unpaid',
        payload: { day, dueKobo: costKobo, ruleVersion: RULE_VERSIONS.simulation },
        idempotencyKey: `evt:tick-unpaid:${company.id}:${day}`,
        occurredAt,
      })
      continue
    }

    postJournalEntry({
      companyId: company.id,
      memo: `Daily operating cost — simulated day ${day}`,
      sourceType: 'tick',
      sourceId: `day:${day}`,
      idempotencyKey,
      occurredAt,
      lines: [
        { code: CODES.OPERATING, direction: 'debit', amountKobo: costKobo, memo: `Day ${day} running costs` },
        { code: CODES.CASH, direction: 'credit', amountKobo: costKobo },
      ],
    })

    chargedKobo += costKobo
    companies += 1
  }

  run(
    `INSERT INTO sim_day_runs (id, day, sim_time, companies, charged_kobo, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newId(),
    day,
    occurredAt,
    companies,
    chargedKobo,
    new Date().toISOString(),
  )

  return { day, companies, chargedKobo, unpaid, alreadySettled: false }
}

/* ------------------------------------------------------------ the events -- */

/**
 * Moves administrator-controlled events through their lifecycle.
 *
 * An event scheduled for an instant the world has now reached starts; one whose
 * window has closed ends. Both are judged against simulated time, so the events
 * screen and the clock agree on when "now" is.
 */
function advanceEvents(simTimeIso: string): { started: number; ended: number } {
  const simMs = Date.parse(simTimeIso)
  if (!Number.isFinite(simMs)) return { started: 0, ended: 0 }

  let started = 0
  let ended = 0

  const pending = many<EventRow>(
    "SELECT * FROM simulation_events WHERE status = 'SCHEDULED' AND starts_at IS NOT NULL",
  )
  for (const event of pending) {
    const startsAt = Date.parse(event.starts_at ?? '')
    if (!Number.isFinite(startsAt) || startsAt > simMs) continue
    const endsAt = new Date(startsAt + event.duration_hours * 3_600_000).toISOString()
    run(
      "UPDATE simulation_events SET status = 'ACTIVE', ends_at = ?, updated_at = ? WHERE id = ?",
      endsAt,
      simTimeIso,
      event.id,
    )
    started += 1
  }

  const active = many<EventRow>(
    "SELECT * FROM simulation_events WHERE status = 'ACTIVE' AND ends_at IS NOT NULL",
  )
  for (const event of active) {
    const endsAt = Date.parse(event.ends_at ?? '')
    if (!Number.isFinite(endsAt) || endsAt > simMs) continue
    run("UPDATE simulation_events SET status = 'ENDED', updated_at = ? WHERE id = ?", simTimeIso, event.id)
    ended += 1
  }

  return { started, ended }
}

/* ------------------------------------------------------------- the tick -- */

export interface TickResult {
  /** How many ticks were applied. Zero when the clock is stopped. */
  applied: number
  simTime: string
  day: number
  settledDays: SettledDay[]
  chargedKobo: number
  eventsStarted: number
  eventsEnded: number
}

const NO_TICK = (row: ClockRow): TickResult => ({
  applied: 0,
  simTime: row.sim_time,
  day: dayNumber(Date.parse(row.sim_time), row.sim_started_at),
  settledDays: [],
  chargedKobo: 0,
  eventsStarted: 0,
  eventsEnded: 0,
})

/**
 * Advances the world by `count` ticks.
 *
 * The whole step — moving the instant, settling any day boundaries it crosses
 * and advancing the event lifecycle — happens in one transaction, so the clock
 * and the books can never disagree about what has been paid for.
 *
 * A stopped clock does nothing unless the caller forces it, which is what lets
 * an administrator step the simulation forward while it is paused.
 */
export function runTick(count = 1, options: { force?: boolean } = {}): TickResult {
  const steps = Number.isFinite(count) ? Math.max(1, Math.floor(count)) : 1

  return transaction(() => {
    const row = getClock()
    if (row.running !== 1 && !options.force) return NO_TICK(row)

    const fromMs = Date.parse(row.sim_time)
    const toMs = fromMs + steps * row.tick_minutes * MS_PER_MINUTE
    const toIso = new Date(toMs).toISOString()
    const nowIso = new Date().toISOString()

    const fromDay = dayNumber(fromMs, row.sim_started_at)
    const toDay = dayNumber(toMs, row.sim_started_at)

    const settledDays: SettledDay[] = []
    for (let day = fromDay + 1; day <= toDay; day++) {
      // A day is settled at the instant it closes, so its costs land on the
      // same simulated date the reports show.
      const boundaryIso = new Date(Date.parse(row.sim_started_at) + day * MS_PER_DAY).toISOString()
      settledDays.push(settleDay(day, boundaryIso))
    }

    const events = advanceEvents(toIso)

    run(
      `UPDATE sim_clock SET sim_time = ?, ticks = ticks + ?, last_tick_at = ?, updated_at = ? WHERE id = 'global'`,
      toIso,
      steps,
      nowIso,
      nowIso,
    )

    return {
      applied: steps,
      simTime: toIso,
      day: toDay,
      settledDays,
      chargedKobo: settledDays.reduce((sum, day) => sum + day.chargedKobo, 0),
      eventsStarted: events.started,
      eventsEnded: events.ended,
    }
  })
}

/** The most recent days the clock has settled, for the administrator's view. */
export function recentDayRuns(limit = 14) {
  return many<{
    day: number
    sim_time: string
    companies: number
    charged_kobo: number
    created_at: string
  }>(`SELECT day, sim_time, companies, charged_kobo, created_at FROM sim_day_runs ORDER BY day DESC LIMIT ?`, limit).map(
    (row) => ({
      day: Number(row.day),
      simTime: row.sim_time,
      companies: Number(row.companies),
      chargedKobo: Number(row.charged_kobo),
      settledAt: row.created_at,
    }),
  )
}

/* --------------------------------------------------------------- the loop -- */

let timer: ReturnType<typeof setInterval> | null = null

/**
 * Starts the background clock.
 *
 * Deliberately started by `index.ts` rather than by the application itself, so
 * the test suite can import the real routes without a timer firing underneath
 * it. Each tick is wrapped: a failure is logged and the next one tries again,
 * because a stopped world is worse than a late one.
 */
export function startClock(intervalMs = TICK_INTERVAL_MS): void {
  if (timer) return
  ensureClock()

  timer = setInterval(() => {
    try {
      const result = runTick(1)
      if (result.applied === 0) return
      for (const day of result.settledDays) {
        if (day.alreadySettled) continue
        console.log(
          `[sim] day ${day.day} settled — ${day.companies} business(es), ${formatKobo(day.chargedKobo)} operating cost` +
            (day.unpaid > 0 ? `, ${day.unpaid} could not pay` : ''),
        )
      }
    } catch (error) {
      console.error('[sim] tick failed:', error)
    }
  }, intervalMs)

  // A background clock must not be the reason the process stays alive.
  if (typeof timer.unref === 'function') timer.unref()
}

export function stopClock(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
