import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createBusinessProfile, createTestUser, many, one, run } from './harness'

/**
 * The simulation clock, exercised against a real database.
 *
 * The clock is the thing that makes time pass for the economy: a tick moves the
 * world forward, and a tick that crosses midnight settles that day — every open
 * business pays its operating cost. These tests hold the same guarantees the
 * rest of the money layer holds: a charge is balanced, idempotent, and never
 * taken from cash a business does not have.
 */

const { startServer } = await import('../app')
const { signToken } = await import('../security')
const clock = await import('../clock')
const { provisionCompany } = await import('../company')
const { CODES, cashBalanceKobo, postJournalEntry, toKobo } = await import('../finance')

const DAY_MS = 24 * 60 * 60 * 1000
const COST_NAIRA = 1_000

let handle: Awaited<ReturnType<typeof startServer>>
let adminToken: string
let companyId: string
let brokeCompanyId: string

before(async () => {
  // A deterministic economy: no inflation dial and a round daily cost, so the
  // amounts below are exact rather than a function of the seeded defaults.
  run("UPDATE simulation_settings SET inflation_rate = 0, operating_cost = 0 WHERE id = 'global'")
  run("UPDATE simulation_rules SET value = ? WHERE key = 'daily_operating_cost'", String(COST_NAIRA))

  adminToken = signToken(createTestUser({ role: 'ADMIN' }), 'ADMIN')

  // A funded, open business.
  const playerId = createTestUser({ role: 'PLAYER', email: 'funded@example.test' })
  createBusinessProfile(playerId)
  companyId = provisionCompany(playerId).company.id
  run("UPDATE companies SET operational_status = 'OPEN' WHERE id = ?", companyId)
  postJournalEntry({
    companyId,
    memo: 'Test funding',
    sourceType: 'test',
    idempotencyKey: `test:fund:${companyId}`,
    lines: [
      { code: CODES.CASH, direction: 'debit', amountKobo: toKobo(10_000) },
      { code: CODES.CAPITAL, direction: 'credit', amountKobo: toKobo(10_000) },
    ],
  })

  // An open business with no money at all.
  const brokeId = createTestUser({ role: 'PLAYER', email: 'broke@example.test' })
  createBusinessProfile(brokeId, { businessName: 'Broke Ltd' })
  brokeCompanyId = provisionCompany(brokeId).company.id
  run("UPDATE companies SET operational_status = 'OPEN' WHERE id = ?", brokeCompanyId)

  handle = await startServer(0)
})

after(async () => {
  await handle.close()
})

/**
 * Puts the world back at day one and removes what previous tests charged, so
 * each test starts from the same place rather than from another test's history.
 */
function resetWorld(tickMinutes = 60): void {
  const now = new Date().toISOString()
  run(
    `UPDATE sim_clock SET sim_time = ?, sim_started_at = ?, ticks = 0, running = 1, tick_minutes = ?, last_tick_at = NULL
     WHERE id = 'global'`,
    now,
    now,
    tickMinutes,
  )
  run("DELETE FROM journal_lines WHERE entry_id IN (SELECT id FROM journal_entries WHERE source_type = 'tick')")
  run("DELETE FROM journal_entries WHERE source_type = 'tick'")
  run("DELETE FROM event_outbox WHERE type = 'company.operating_cost_unpaid'")
  run('DELETE FROM sim_day_runs')
}

function tickLedgerEntries(): number {
  return Number(one<{ n: number }>("SELECT COUNT(*) AS n FROM journal_entries WHERE source_type = 'tick'")?.n ?? 0)
}

/* ------------------------------------------------------------------ time -- */

test('the day number counts from the instant the clock began', () => {
  const start = '2026-01-01T00:00:00.000Z'
  const startMs = Date.parse(start)
  assert.equal(clock.dayNumber(startMs, start), 1)
  assert.equal(clock.dayNumber(startMs + 23 * 60 * 60 * 1000, start), 1, 'still the first day')
  assert.equal(clock.dayNumber(startMs + DAY_MS, start), 2, 'midnight opens the second day')
  assert.equal(clock.dayNumber(startMs + DAY_MS * 4 + 60_000, start), 5)
})

test('a tick length outside the allowed range is refused', () => {
  assert.throws(() => clock.updateClock({ tickMinutes: 0 }, null), clock.ClockError)
  assert.throws(() => clock.updateClock({ tickMinutes: 2_000 }, null), clock.ClockError)
  assert.throws(() => clock.updateClock({ tickMinutes: 60.5 }, null), clock.ClockError)
  assert.doesNotThrow(() => clock.updateClock({ tickMinutes: 60 }, null))
})

test('a tick advances the world by the configured minutes', () => {
  resetWorld(60)
  const before = clock.getClock()

  const result = clock.runTick(1)

  assert.equal(result.applied, 1)
  assert.equal(result.day, 1, 'a single hour does not close a day')
  assert.equal(result.settledDays.length, 0)
  assert.equal(Date.parse(result.simTime) - Date.parse(before.sim_time), 60 * 60 * 1000)
})

test('a stopped clock does nothing unless it is forced', () => {
  resetWorld(60)
  clock.updateClock({ running: false }, null)

  const idle = clock.runTick(1)
  assert.equal(idle.applied, 0, 'a stopped world must not advance on its own')

  const forced = clock.runTick(1, { force: true })
  assert.equal(forced.applied, 1, 'an administrator can always step a stopped world')

  clock.updateClock({ running: true }, null)
})

/* ---------------------------------------------------------- the settling -- */

test('crossing midnight settles the day and charges open businesses', () => {
  resetWorld(1440) // one tick spans a whole day
  const cashBefore = cashBalanceKobo(companyId)

  const result = clock.runTick(1)

  assert.equal(result.day, 2)
  assert.equal(result.settledDays.length, 1, 'exactly one day closed')
  const settled = result.settledDays[0]
  assert.equal(settled.alreadySettled, false)
  assert.equal(settled.companies, 1, 'only the business that could pay was charged')
  assert.equal(settled.chargedKobo, toKobo(COST_NAIRA))

  assert.equal(
    cashBalanceKobo(companyId),
    cashBefore - toKobo(COST_NAIRA),
    'the charge comes out of the ledger, not out of thin air',
  )

  // The charge is a real, balanced entry: whatever left cash arrived somewhere.
  const entry = one<{ id: string }>(
    "SELECT id FROM journal_entries WHERE source_type = 'tick' ORDER BY created_at DESC LIMIT 1",
  )
  assert.ok(entry, 'settling a day posts a ledger entry')
  const lines = many<{ direction: string; amount_kobo: number }>(
    'SELECT direction, amount_kobo FROM journal_lines WHERE entry_id = ?',
    entry.id,
  )
  const debits = lines
    .filter((line) => line.direction === 'debit')
    .reduce((sum, line) => sum + Number(line.amount_kobo), 0)
  const credits = lines
    .filter((line) => line.direction === 'credit')
    .reduce((sum, line) => sum + Number(line.amount_kobo), 0)
  assert.equal(debits, credits, 'every posting balances')
  assert.equal(debits, toKobo(COST_NAIRA))
})

test('a business that cannot pay is left alone, and the shortfall is recorded', () => {
  resetWorld(1440)

  const result = clock.runTick(1)

  const settled = result.settledDays[0]
  assert.equal(settled.unpaid, 1, 'the empty business was recognised as unable to pay')
  assert.equal(cashBalanceKobo(brokeCompanyId), 0, 'a business is never pushed into the negative')

  const event = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM event_outbox WHERE company_id = ? AND type = 'company.operating_cost_unpaid'",
    brokeCompanyId,
  )
  assert.equal(event?.n, 1, 'the shortfall is explained by an event, not silently ignored')
})

test('a day that has already been settled is never charged twice', () => {
  resetWorld(1440)

  clock.runTick(1)
  const cashAfterFirst = cashBalanceKobo(companyId)
  const entriesAfterFirst = tickLedgerEntries()

  // Rewind to the start and cross the same boundary again — as a restarted or
  // duplicated tick would.
  const row = clock.getClock()
  run("UPDATE sim_clock SET sim_time = ?, ticks = 0 WHERE id = 'global'", row.sim_started_at)

  const second = clock.runTick(1)

  assert.equal(second.settledDays[0].alreadySettled, true)
  assert.equal(cashBalanceKobo(companyId), cashAfterFirst, 'the second pass must not charge again')
  assert.equal(tickLedgerEntries(), entriesAfterFirst, 'no extra ledger entry is posted')
})

/* ------------------------------------------------------------------- api -- */

async function call<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.token !== null) headers.Authorization = `Bearer ${init.token ?? adminToken}`
  const response = await fetch(`${handle.url}/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = (await response.json().catch(() => null)) as T
  return { status: response.status, body }
}

test('the world feed exposes the current time to anyone', async () => {
  const reply = await call<{ day: number; minuteOfDay: number; running: boolean }>('/world/clock', {
    token: null,
  })
  assert.equal(reply.status, 200)
  assert.ok(reply.body.day >= 1)
  assert.ok(reply.body.minuteOfDay >= 0 && reply.body.minuteOfDay < 1440)
})

test('an administrator can read, pause and step the clock', async () => {
  resetWorld(60)

  const read = await call<{ clock: { day: number; running: boolean } }>('/admin/simulation/clock')
  assert.equal(read.status, 200)
  assert.equal(read.body.clock.day, 1)

  const paused = await call<{ clock: { running: boolean; tickMinutes: number } }>(
    '/admin/simulation/clock',
    { method: 'PUT', body: { running: false, tickMinutes: 30 } },
  )
  assert.equal(paused.status, 200)
  assert.equal(paused.body.clock.running, false)
  assert.equal(paused.body.clock.tickMinutes, 30)

  const stepped = await call<{ result: { applied: number; day: number } }>(
    '/admin/simulation/clock/tick',
    { method: 'POST', body: { count: 2 } },
  )
  assert.equal(stepped.status, 200)
  assert.equal(stepped.body.result.applied, 2, 'a paused world can still be stepped by hand')

  const bad = await call('/admin/simulation/clock', {
    method: 'PUT',
    body: { tickMinutes: 5_000 },
  })
  assert.equal(bad.status, 400, 'an out-of-range tick length is rejected')
})
