import { one, run, transaction } from './db'
import { CODES, FinanceError, postJournalEntry, seedChartOfAccounts, toKobo } from './finance'
import { seedStringFor } from './rng'
import { newId } from './security'

/**
 * The player's company.
 *
 * The company is the thing that actually trades: money, stock, orders and
 * people all belong to it. It is provisioned once from the business profile the
 * player typed in during onboarding, and its books are opened with the starting
 * capital the simulation is configured with.
 */

/** Something the caller asked for that cannot be done. Routes turn this into a 400. */
export class CompanyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CompanyError'
  }
}

export interface CompanyRow {
  id: string
  owner_user_id: string
  name: string
  sector: string
  business_model: string
  legal_structure: string
  registration_status: string
  compliance_status: string
  premises_status: string
  operational_status: string
  bank_account_status: string
  currency: string
  seed: string
  founded_at: string | null
  created_at: string
  updated_at: string
}

export function toCompany(row: CompanyRow) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    name: row.name,
    sector: row.sector,
    businessModel: row.business_model,
    legalStructure: row.legal_structure,
    registrationStatus: row.registration_status,
    complianceStatus: row.compliance_status,
    premisesStatus: row.premises_status,
    operationalStatus: row.operational_status,
    bankAccountStatus: row.bank_account_status,
    currency: row.currency,
    seed: row.seed,
    foundedAt: row.founded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getCompanyByOwner(userId: string): CompanyRow | undefined {
  return one<CompanyRow>('SELECT * FROM companies WHERE owner_user_id = ?', userId)
}

/**
 * The starting capital an administrator has configured for the simulation.
 *
 * Zero by default. A new company begins with no money at all, and the only way
 * cash can appear is a recorded ledger transaction: a founder contribution, a
 * funding agreement or a customer payment. An administrator may configure a
 * non-zero figure, which is posted as an explicit opening capital entry, so the
 * balance is still explainable by the ledger.
 */
function startingCapitalNaira(): number {
  const row = one<{ value: string }>(
    "SELECT value FROM simulation_rules WHERE key = 'starting_capital'",
  )
  const parsed = row ? Number(row.value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export interface ProvisionResult {
  company: CompanyRow
  /** False when a company already existed and nothing was changed. */
  created: boolean
}

/**
 * Creates the player's company from their onboarding profile and opens its
 * books. Idempotent: calling it again returns the company that already exists.
 *
 * The opening entry is a capital injection — debit cash, credit owner's capital
 * — so the company starts with money that the ledger can explain.
 */
export function provisionCompany(userId: string): ProvisionResult {
  const existing = getCompanyByOwner(userId)
  if (existing) return { company: existing, created: false }

  const profile = one<{
    business_name: string
    sector: string
    product: string
    description: string
  }>(
    'SELECT business_name, sector, product, description FROM business_profiles WHERE user_id = ?',
    userId,
  )
  if (!profile) {
    throw new CompanyError('Finish creating your business before opening its books.')
  }

  const now = new Date().toISOString()
  const companyId = newId()

  // The seed every simulated outcome for this company is derived from. Storing
  // it with the company makes the simulation reproducible: the same company
  // replays the same rolls, and grading can explain a result after the fact.
  const seed = seedStringFor(companyId)

  const company = transaction(() => {
    run(
      `INSERT INTO companies
         (id, owner_user_id, name, sector, business_model, legal_structure, registration_status,
          compliance_status, currency, seed, founded_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'UNREGISTERED', 'DRAFT', 'PENDING', 'NGN', ?, ?, ?, ?)`,
      companyId,
      userId,
      profile.business_name,
      profile.sector,
      profile.product || profile.description,
      seed,
      now,
      now,
      now,
    )

    seedChartOfAccounts(companyId)

    const openingKobo = toKobo(startingCapitalNaira())
    if (openingKobo > 0) {
      postJournalEntry({
        companyId,
        memo: 'Opening capital',
        sourceType: 'opening',
        idempotencyKey: `opening:${companyId}`,
        createdBy: userId,
        lines: [
          { code: CODES.CASH, direction: 'debit', amountKobo: openingKobo },
          { code: CODES.CAPITAL, direction: 'credit', amountKobo: openingKobo },
        ],
      })
    }

    const row = one<CompanyRow>('SELECT * FROM companies WHERE id = ?', companyId)
    if (!row) throw new FinanceError('the company could not be created.')
    return row
  })

  return { company, created: true }
}

/**
 * The company for a signed-in player, provisioning it the first time it is
 * asked for. Convenience for the read endpoints, so a player who signed up
 * before this feature existed still gets books on their next visit.
 */
export function ensureCompany(userId: string): CompanyRow {
  return provisionCompany(userId).company
}
