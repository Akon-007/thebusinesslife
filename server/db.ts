import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DATABASE_FILE } from './config'

/**
 * The application database.
 *
 * Uses Node's built-in SQLite driver, so the backend has no native build step
 * and no generated client — the schema below is the single source of truth and
 * is applied idempotently on boot.
 *
 * New tables are added by extending `SCHEMA`. Columns added to a table that
 * already exists are handled by `ensureColumn`, because `CREATE TABLE IF NOT
 * EXISTS` will not touch a table that is already on disk.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'PLAYER',
  email_verified INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'ACTIVE',
  last_seen_at   TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS email_codes (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_codes_user ON email_codes(user_id);

CREATE TABLE IF NOT EXISTS business_profiles (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  sector        TEXT NOT NULL,
  idea          TEXT NOT NULL,
  description   TEXT NOT NULL,
  problem       TEXT NOT NULL,
  product       TEXT NOT NULL,
  ambition      TEXT,
  avatar_id     TEXT NOT NULL DEFAULT 'founder-1',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- The player's live position in the game, mirrored from the client so the
-- portals can report on progression without reading a player's browser.
CREATE TABLE IF NOT EXISTS player_progress (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stage_index      INTEGER NOT NULL DEFAULT 1,
  level_index      INTEGER NOT NULL DEFAULT 1,
  xp               INTEGER NOT NULL DEFAULT 0,
  cash             INTEGER NOT NULL DEFAULT 0,
  reputation       INTEGER NOT NULL DEFAULT 0,
  completed_levels TEXT NOT NULL DEFAULT '[]',
  updated_at       TEXT NOT NULL
);

-- Administrator edits to the frozen level catalogue.
--
-- Levels themselves are a client-side design contract: their ids, order, titles
-- and the 15-level Beginner span never change. This table therefore holds a
-- *sparse override* per level — a NULL column means "inherit the catalogue
-- value" — so an administrator can retune a level without the server becoming
-- the owner of the progression structure.
CREATE TABLE IF NOT EXISTS level_overrides (
  level_id          TEXT PRIMARY KEY,
  summary           TEXT,
  requirements      TEXT,
  unlocks           TEXT,
  xp_reward         INTEGER,
  cash_reward       INTEGER,
  reputation_reward INTEGER,
  active            INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT NOT NULL,
  updated_by        TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Missions authored or edited in the Mission Builder.
--
-- A mission is keyed to a level id. Clearing out the catalogue's defaults is not
-- possible from here: an unpublished mission is invisible to players, and the
-- catalogue remains the fallback whenever no mission has been published.
CREATE TABLE IF NOT EXISTS missions (
  id                    TEXT PRIMARY KEY,
  level_id              TEXT NOT NULL,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  instructions          TEXT NOT NULL DEFAULT '',
  type                  TEXT NOT NULL,
  xp_reward             INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'DRAFT',
  prerequisites         TEXT NOT NULL DEFAULT '[]',
  npc_requirements      TEXT NOT NULL DEFAULT '[]',
  location_requirements TEXT NOT NULL DEFAULT '[]',
  completion_conditions TEXT NOT NULL DEFAULT '[]',
  evaluation_criteria   TEXT NOT NULL DEFAULT '[]',
  failure_conditions    TEXT NOT NULL DEFAULT '[]',
  recovery_instructions TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  created_by            TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_missions_level ON missions(level_id);
CREATE INDEX IF NOT EXISTS idx_missions_status ON missions(status);

-- The ordered objectives a mission asks the player to complete.
CREATE TABLE IF NOT EXISTS mission_objectives (
  id            TEXT PRIMARY KEY,
  mission_id    TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  ordinal       INTEGER NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'required',
  type          TEXT NOT NULL,
  target        TEXT NOT NULL,
  text          TEXT NOT NULL,
  count         INTEGER NOT NULL DEFAULT 1,
  hint          TEXT,
  hint_location TEXT
);
CREATE INDEX IF NOT EXISTS idx_mission_objectives_mission ON mission_objectives(mission_id);

-- Administrator edits to the city's crowd.
--
-- The fourteen NPC roles, their names, palettes and interactions are authored in
-- the player application. Only how many of each role walk the streets, where
-- they spawn and whether the role appears at all are adjustable here. A NULL
-- column means "inherit the catalogue value".
CREATE TABLE IF NOT EXISTS npc_role_overrides (
  role            TEXT PRIMARY KEY,
  spawn_count     INTEGER,
  spawn_districts TEXT,
  active          INTEGER,
  updated_at      TEXT NOT NULL,
  updated_by      TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Administrator edits to the business sectors offered during onboarding.
CREATE TABLE IF NOT EXISTS sector_overrides (
  sector     TEXT PRIMARY KEY,
  active     INTEGER,
  briefing   TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Administrator edits to the six districts.
CREATE TABLE IF NOT EXISTS district_overrides (
  district_id TEXT PRIMARY KEY,
  active      INTEGER,
  footfall    INTEGER,
  notes       TEXT,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Administrator edits to individual buildings. A false value closes a building:
-- it is removed from the city, from collision and from interaction.
CREATE TABLE IF NOT EXISTS building_overrides (
  building_id TEXT PRIMARY KEY,
  active      INTEGER,
  notes       TEXT,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Investors authored in the portal. Unlike the other world tables these are new
-- records rather than overrides: an active investor is spawned into the business
-- district as a named investor NPC.
CREATE TABLE IF NOT EXISTS investors (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  organisation TEXT NOT NULL DEFAULT '',
  stage_focus  TEXT NOT NULL DEFAULT 'Any stage',
  ticket       TEXT NOT NULL DEFAULT '',
  sectors      TEXT NOT NULL DEFAULT '[]',
  active       INTEGER NOT NULL DEFAULT 1,
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_investors_active ON investors(active);

CREATE TABLE IF NOT EXISTS audit_logs (
  id      TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action  TEXT NOT NULL,
  detail  TEXT NOT NULL,
  at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_logs(at);

-- The live economic configuration of the simulation.
--
-- A single row, keyed 'global'. The rates are real numbers so an administrator
-- can set 12.5% inflation, not just 12 or 13. Every field has a documented
-- starting value, so the simulation is always in a defined state.
CREATE TABLE IF NOT EXISTS simulation_settings (
  id               TEXT PRIMARY KEY,
  inflation_rate   REAL NOT NULL DEFAULT 12.5,
  interest_rate    REAL NOT NULL DEFAULT 18,
  supplier_cost    REAL NOT NULL DEFAULT 0,
  customer_demand  REAL NOT NULL DEFAULT 0,
  competition      REAL NOT NULL DEFAULT 0,
  operating_cost   REAL NOT NULL DEFAULT 0,
  funding_climate  TEXT NOT NULL DEFAULT 'neutral',
  paused           INTEGER NOT NULL DEFAULT 0,
  notes            TEXT NOT NULL DEFAULT '',
  updated_at       TEXT NOT NULL,
  updated_by       TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Tunable numeric and boolean rules that govern how the simulation behaves.
CREATE TABLE IF NOT EXISTS simulation_rules (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'economy',
  value       TEXT NOT NULL,
  value_type  TEXT NOT NULL DEFAULT 'number',
  description TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sim_rules_category ON simulation_rules(category);

-- Regulatory requirements the simulation tracks against a player's business.
CREATE TABLE IF NOT EXISTS compliance_rules (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'registration',
  requirement TEXT NOT NULL,
  penalty     TEXT NOT NULL DEFAULT '',
  severity    TEXT NOT NULL DEFAULT 'warning',
  active      INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_category ON compliance_rules(category);

-- Controlled economic events an administrator can introduce into the
-- simulation, targeted at the whole platform, a sector, a district, a class or
-- an individual student.
CREATE TABLE IF NOT EXISTS simulation_events (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  scope        TEXT NOT NULL DEFAULT 'all',
  targets      TEXT NOT NULL DEFAULT '[]',
  impact       REAL NOT NULL DEFAULT 0,
  duration_hours INTEGER NOT NULL DEFAULT 24,
  starts_at    TEXT,
  ends_at      TEXT,
  status       TEXT NOT NULL DEFAULT 'SCHEDULED',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  created_by   TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sim_events_status ON simulation_events(status);

-- The simulation clock.
--
-- A single row, keyed 'global'. sim_time is the instant the game world
-- believes it is — it advances faster than wall-clock time — and sim_started_at
-- is the instant the clock began, from which the simulated day is derived.
--
-- The clock is what moves the world forward: when it crosses a day boundary the
-- engine settles that day (operating costs, events). Every settlement is keyed
-- by company and day, so a tick that is applied twice still posts once.
CREATE TABLE IF NOT EXISTS sim_clock (
  id             TEXT PRIMARY KEY,
  sim_time       TEXT NOT NULL,
  sim_started_at TEXT NOT NULL,
  running        INTEGER NOT NULL DEFAULT 1,
  tick_minutes   INTEGER NOT NULL DEFAULT 60,
  ticks          INTEGER NOT NULL DEFAULT 0,
  last_tick_at   TEXT,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- A record of every simulated day that has been settled, so the engine can
-- report what it has done and a re-run can be recognised as already applied.
CREATE TABLE IF NOT EXISTS sim_day_runs (
  id           TEXT PRIMARY KEY,
  day          INTEGER NOT NULL UNIQUE,
  sim_time     TEXT NOT NULL,
  companies    INTEGER NOT NULL DEFAULT 0,
  charged_kobo INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

-- A lecturer's class. Owns its students, its assignments and its own
-- simulation settings, so one class can be paused while another is running.
CREATE TABLE IF NOT EXISTS classes (
  id                TEXT PRIMARY KEY,
  lecturer_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  term              TEXT NOT NULL DEFAULT '',
  invite_code       TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'ACTIVE',
  starts_on         TEXT,
  ends_on           TEXT,
  simulation_paused INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_classes_lecturer ON classes(lecturer_id);

-- Membership of a class. A student joins with the class's invitation code and
-- the lecturer approves the request.
CREATE TABLE IF NOT EXISTS class_members (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'PENDING',
  joined_at  TEXT NOT NULL,
  UNIQUE(class_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_class_members_class ON class_members(class_id);
CREATE INDEX IF NOT EXISTS idx_class_members_student ON class_members(student_id);

-- An assignment built from the platform's own stages, levels and missions.
CREATE TABLE IF NOT EXISTS assignments (
  id                   TEXT PRIMARY KEY,
  class_id             TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  lecturer_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  instructions         TEXT NOT NULL DEFAULT '',
  stage_index          INTEGER NOT NULL DEFAULT 1,
  level_id             TEXT,
  mission_id           TEXT,
  learning_objectives  TEXT NOT NULL DEFAULT '[]',
  assessment_criteria  TEXT NOT NULL DEFAULT '[]',
  starts_on            TEXT,
  due_on               TEXT,
  simulation_hours     INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'OPEN',
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);

-- Which students an assignment is set for, and how far they have got.
CREATE TABLE IF NOT EXISTS assignment_students (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'PENDING',
  submitted_at  TEXT,
  UNIQUE(assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_assignment_students_assignment ON assignment_students(assignment_id);

-- A controlled business scenario a lecturer can run against a class. The rates
-- are nullable so an unset dimension simply inherits the platform's settings.
CREATE TABLE IF NOT EXISTS scenarios (
  id                  TEXT PRIMARY KEY,
  lecturer_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id            TEXT REFERENCES classes(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  template            TEXT NOT NULL DEFAULT 'custom',
  description         TEXT NOT NULL DEFAULT '',
  inflation_rate      REAL,
  interest_rate       REAL,
  supplier_cost       REAL,
  customer_demand     REAL,
  competition         REAL,
  operating_cost      REAL,
  funding_climate     TEXT,
  duration_hours      INTEGER NOT NULL DEFAULT 48,
  evaluation_criteria TEXT NOT NULL DEFAULT '[]',
  status              TEXT NOT NULL DEFAULT 'DRAFT',
  started_at          TEXT,
  ends_at             TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenarios_lecturer ON scenarios(lecturer_id);

-- A lecturer's assessment of one student on one assignment.
CREATE TABLE IF NOT EXISTS assessments (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lecturer_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scores        TEXT NOT NULL DEFAULT '{}',
  overall       REAL,
  grade         TEXT NOT NULL DEFAULT '',
  feedback      TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_assessments_student ON assessments(student_id);

-- Everything a lecturer needs to tell a student about their learning.
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'info',
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- Platform-level settings, one row per key. Kept separate from the simulation
-- controls because these describe the product, not the game world.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- The authoritative record of a player's company.
--
-- Everything consequential — money, stock, orders, people — hangs off this row
-- and is owned by it. The onboarding draft in business_profiles is the
-- concept the player typed in; this is the company that actually trades.
CREATE TABLE IF NOT EXISTS companies (
  id                  TEXT PRIMARY KEY,
  owner_user_id       TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  sector              TEXT NOT NULL,
  business_model      TEXT NOT NULL DEFAULT '',
  legal_structure     TEXT NOT NULL DEFAULT 'UNREGISTERED',
  registration_status TEXT NOT NULL DEFAULT 'DRAFT',
  compliance_status   TEXT NOT NULL DEFAULT 'PENDING',
  premises_status     TEXT NOT NULL DEFAULT 'NONE',
  operational_status  TEXT NOT NULL DEFAULT 'CLOSED',
  currency            TEXT NOT NULL DEFAULT 'NGN',
  founded_at          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

-- The company's chart of accounts. Cash is not a stored number anywhere: it is
-- summed from the ledger lines posted against the cash account, so a balance
-- can always be explained by the entries that produced it.
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code       TEXT NOT NULL,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  is_cash    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(company_id, code)
);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_company ON ledger_accounts(company_id);

-- One journal entry per real-world business event.
--
-- idempotency_key is unique across the whole table: a retried request that
-- carries the same key returns the entry that already exists instead of posting
-- the transaction twice.
CREATE TABLE IF NOT EXISTS journal_entries (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  occurred_at     TEXT NOT NULL,
  memo            TEXT NOT NULL DEFAULT '',
  source_type     TEXT NOT NULL DEFAULT 'manual',
  source_id       TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_company ON journal_entries(company_id, occurred_at);

-- The debit or credit legs of an entry. Amounts are integer kobo; currency is
-- never held as a floating-point number.
CREATE TABLE IF NOT EXISTS journal_lines (
  id          TEXT PRIMARY KEY,
  entry_id    TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  direction   TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL,
  memo        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(company_id, account_id);

-- Events that follow from a committed action, so downstream work (notifications,
-- missions, reports) can be processed without re-deriving what happened.
CREATE TABLE IF NOT EXISTS event_outbox (
  id              TEXT PRIMARY KEY,
  company_id      TEXT REFERENCES companies(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  payload         TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'PENDING',
  idempotency_key TEXT,
  created_at      TEXT NOT NULL,
  processed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_event_outbox_status ON event_outbox(status);

-- What the player actually did in the world, recorded as evidence.
--
-- Progression is *derived* from this log rather than trusted from the client:
-- an objective is satisfied when the matching evidence exists, so a tampered
-- request cannot award a level, cash or a score. Rows are append-only, and
-- idempotency_key is unique so a retried action cannot be counted twice.
CREATE TABLE IF NOT EXISTS mission_evidence (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      TEXT REFERENCES companies(id) ON DELETE CASCADE,
  level_id        TEXT NOT NULL,
  kind            TEXT NOT NULL,
  target          TEXT NOT NULL,
  actor           TEXT,
  rule_version    TEXT NOT NULL DEFAULT '',
  occurred_at     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mission_evidence_user ON mission_evidence(user_id, level_id);
CREATE INDEX IF NOT EXISTS idx_mission_evidence_match ON mission_evidence(user_id, level_id, kind, target);

-- A level the player has finished, and the reward that was awarded for it.
--
-- The reward is a *record of what the rules granted*, not a number the client
-- supplied. Cash is deliberately absent: money only ever arrives through the
-- ledger, never as a progression prize.
CREATE TABLE IF NOT EXISTS level_results (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id     TEXT NOT NULL,
  xp_awarded   INTEGER NOT NULL DEFAULT 0,
  reputation   INTEGER NOT NULL DEFAULT 0,
  rule_version TEXT NOT NULL DEFAULT '',
  evidence     TEXT NOT NULL DEFAULT '[]',
  completed_at TEXT NOT NULL,
  UNIQUE(user_id, level_id)
);
CREATE INDEX IF NOT EXISTS idx_level_results_user ON level_results(user_id);

-- A recorded decision to put money into (or take money out of) the business.
--
-- Cash may not be minted by a route: funding always points at one of these
-- agreements, and the agreement is what the ledger entry is posted against.
-- Phase 4 extends the kinds beyond a founder contribution.
CREATE TABLE IF NOT EXISTS funding_agreements (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  counterparty    TEXT NOT NULL DEFAULT '',
  principal_kobo  INTEGER NOT NULL DEFAULT 0,
  equity_basis    REAL NOT NULL DEFAULT 0,
  terms           TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  rule_version    TEXT NOT NULL DEFAULT '',
  agreed_at       TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_funding_agreements_company ON funding_agreements(company_id);

-- What the company sells.
CREATE TABLE IF NOT EXISTS products (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  sku             TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  unit_cost_kobo  INTEGER NOT NULL DEFAULT 0,
  unit_price_kobo INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE(company_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);

-- Every change to stock. On-hand quantity is the sum of these movements, never a
-- counter that can drift away from its history.
CREATE TABLE IF NOT EXISTS stock_movements (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  quantity        INTEGER NOT NULL,
  unit_cost_kobo  INTEGER NOT NULL DEFAULT 0,
  source_type     TEXT NOT NULL DEFAULT 'manual',
  source_id       TEXT,
  supplier_id     TEXT,
  note            TEXT NOT NULL DEFAULT '',
  occurred_at     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(company_id, product_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT '',
  lead_time_days INTEGER NOT NULL DEFAULT 3,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  segment    TEXT NOT NULL DEFAULT 'individual',
  phone      TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);

-- A customer order, from enquiry to a settled invoice.
CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id   TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  reference     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT',
  channel       TEXT NOT NULL DEFAULT 'direct',
  currency      TEXT NOT NULL DEFAULT 'NGN',
  subtotal_kobo INTEGER NOT NULL DEFAULT 0,
  delivery_kobo INTEGER NOT NULL DEFAULT 0,
  total_kobo    INTEGER NOT NULL DEFAULT 0,
  placed_at     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id, status);

CREATE TABLE IF NOT EXISTS order_lines (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  description     TEXT NOT NULL DEFAULT '',
  quantity        INTEGER NOT NULL,
  unit_price_kobo INTEGER NOT NULL,
  unit_cost_kobo  INTEGER NOT NULL DEFAULT 0,
  line_total_kobo INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_order_lines_order ON order_lines(order_id);

CREATE TABLE IF NOT EXISTS deliveries (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'PENDING',
  cost_kobo     INTEGER NOT NULL DEFAULT 0,
  dispatched_at TEXT,
  delivered_at  TEXT,
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);

-- A customer invoice. Money owed by a customer, separate from money received.
CREATE TABLE IF NOT EXISTS invoices (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id     TEXT REFERENCES orders(id) ON DELETE SET NULL,
  customer_id  TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  number       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'OPEN',
  amount_kobo  INTEGER NOT NULL,
  paid_kobo    INTEGER NOT NULL DEFAULT 0,
  issued_at    TEXT NOT NULL,
  due_at       TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id, status);

CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id      TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id     TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount_kobo     INTEGER NOT NULL,
  method          TEXT NOT NULL DEFAULT 'TRANSFER',
  received_at     TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- A supplier bill. Money the company owes, settled separately from when the
-- goods were received.
CREATE TABLE IF NOT EXISTS bills (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id  TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  reference    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'OPEN',
  amount_kobo  INTEGER NOT NULL,
  paid_kobo    INTEGER NOT NULL DEFAULT 0,
  issued_at    TEXT NOT NULL,
  due_at       TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bills_company ON bills(company_id, status);

CREATE TABLE IF NOT EXISTS bill_payments (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bill_id         TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount_kobo     INTEGER NOT NULL,
  method          TEXT NOT NULL DEFAULT 'TRANSFER',
  paid_at         TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill ON bill_payments(bill_id);
`

mkdirSync(dirname(DATABASE_FILE), { recursive: true })

export const db = new DatabaseSync(DATABASE_FILE)

db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')
db.exec(SCHEMA)

type Param = string | number | bigint | null | Uint8Array

/** Fetch a single row, or undefined. */
export function one<T>(sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined
}

/** Fetch every matching row. */
export function many<T>(sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[]
}

/** Execute a statement for its side effects. */
export function run(sql: string, ...params: Param[]): void {
  db.prepare(sql).run(...params)
}

/**
 * Runs `fn` inside a transaction, committing on return and rolling back on a
 * thrown error.
 *
 * The driver is synchronous, so this is a plain BEGIN/COMMIT. Nested calls use
 * a savepoint, so a helper that posts an entry can safely be called from inside
 * a larger transaction without knowing it is already one.
 */
let transactionDepth = 0

export function transaction<T>(fn: () => T): T {
  if (transactionDepth > 0) {
    const savepoint = `sp_${transactionDepth}`
    db.exec(`SAVEPOINT ${savepoint}`)
    transactionDepth += 1
    try {
      const result = fn()
      transactionDepth -= 1
      db.exec(`RELEASE ${savepoint}`)
      return result
    } catch (error) {
      transactionDepth -= 1
      db.exec(`ROLLBACK TO ${savepoint}`)
      db.exec(`RELEASE ${savepoint}`)
      throw error
    }
  }

  db.exec('BEGIN IMMEDIATE')
  transactionDepth = 1
  try {
    const result = fn()
    transactionDepth = 0
    db.exec('COMMIT')
    return result
  } catch (error) {
    transactionDepth = 0
    try {
      db.exec('ROLLBACK')
    } catch {
      /* the transaction is already gone */
    }
    throw error
  }
}

/** Adds a column to an existing table when it is not already there. */
function ensureColumn(table: string, column: string, definition: string): void {
  const columns = many<{ name: string }>(`PRAGMA table_info(${table})`)
  if (columns.some((c) => c.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

// Applied to databases created before these columns existed.
ensureColumn('users', 'status', "TEXT NOT NULL DEFAULT 'ACTIVE'")
ensureColumn('users', 'last_seen_at', 'TEXT')
// Which administrative areas a staff account may reach. An empty list is read
// as "every area", so accounts that predate the column keep full access.
ensureColumn('users', 'permissions', "TEXT NOT NULL DEFAULT '[]'")
ensureColumn('business_profiles', 'avatar_id', "TEXT NOT NULL DEFAULT 'founder-1'")
// The event outbox gained a de-duplication key after it was first created.
ensureColumn('event_outbox', 'idempotency_key', 'TEXT')
// Verification codes and password-reset codes share one table, distinguished by
// purpose, so a reset code can never be replayed as an email verification.
ensureColumn('email_codes', 'purpose', "TEXT NOT NULL DEFAULT 'EMAIL_VERIFY'")
// Every company carries the seed its simulation outcomes are generated from.
ensureColumn('companies', 'seed', "TEXT NOT NULL DEFAULT ''")
ensureColumn('companies', 'premises_status', "TEXT NOT NULL DEFAULT 'NONE'")
ensureColumn('companies', 'operational_status', "TEXT NOT NULL DEFAULT 'CLOSED'")
ensureColumn('companies', 'bank_account_status', "TEXT NOT NULL DEFAULT 'CLOSED'")

// A unique index rather than a column constraint: the column was added to a
// table that may already exist, and SQLite cannot add a UNIQUE column in place.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_event_outbox_key ON event_outbox(idempotency_key)')

/**
 * The audit trail is append-only.
 *
 * Auditing is part of the record, not a convenience: if an entry could be
 * edited or deleted after the fact it would prove nothing. These triggers make
 * that a property of the database rather than a rule the application must
 * remember.
 */
db.exec(`
CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs
WHEN NOT (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
`)
db.exec(`
CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;
`)
