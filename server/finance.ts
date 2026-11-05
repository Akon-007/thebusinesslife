import { many, one, run, transaction } from './db'
import { newId } from './security'

/**
 * The company's books.
 *
 * Money is always an integer number of kobo — never a floating-point naira
 * amount — so a balance is exact and can always be explained by the entries
 * that produced it. Nothing here stores a running total: cash, revenue and
 * profit are all *derived* from the journal, which is the only source of truth.
 *
 * Posting is balanced (debits must equal credits) and idempotent (a repeated
 * request carrying the same key returns the entry that already exists rather
 * than posting a second time).
 */

/* ----------------------------------------------------------------- money -- */

/** Naira to kobo. Rounds to the nearest kobo so `0.1 + 0.2` style drift cannot appear. */
export function toKobo(naira: number): number {
  return Math.round(naira * 100)
}

/** Kobo back to naira, for display and for the few places a naira figure is needed. */
export function fromKobo(kobo: number): number {
  return kobo / 100
}

/** Formats kobo as a naira string, e.g. `₦12,500.00`. */
export function formatKobo(kobo: number): string {
  const negative = kobo < 0
  const absolute = Math.abs(kobo)
  const naira = Math.floor(absolute / 100)
  const koboPart = String(absolute % 100).padStart(2, '0')
  return `${negative ? '-' : ''}₦${naira.toLocaleString('en-NG')}.${koboPart}`
}

/**
 * A malformed or impossible posting. Routes translate this into a 400 rather
 * than a 500, because it describes something the caller asked for.
 */
export class FinanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FinanceError'
  }
}

/* ------------------------------------------------------ chart of accounts -- */

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value)
}

/** Debit-normal accounts rise with a debit; everything else rises with a credit. */
export function isDebitNormal(type: AccountType): boolean {
  return type === 'asset' || type === 'expense'
}

export interface AccountDef {
  code: string
  name: string
  type: AccountType
  isCash?: boolean
}

/**
 * The chart of accounts every company is seeded with. Codes are grouped by
 * class (1 assets, 2 liabilities, 3 equity, 4 revenue, 5 expenses) so the
 * ordering is meaningful in the ledger and the reports.
 */
export const CHART_OF_ACCOUNTS: AccountDef[] = [
  { code: '1000', name: 'Cash at bank', type: 'asset', isCash: true },
  { code: '1100', name: 'Accounts receivable', type: 'asset' },
  { code: '1200', name: 'Inventory', type: 'asset' },
  { code: '2000', name: 'Accounts payable', type: 'liability' },
  { code: '3000', name: "Owner's capital", type: 'equity' },
  { code: '3100', name: 'Retained earnings', type: 'equity' },
  { code: '4000', name: 'Sales revenue', type: 'revenue' },
  { code: '4100', name: 'Other income', type: 'revenue' },
  { code: '5000', name: 'Cost of goods sold', type: 'expense' },
  { code: '5100', name: 'Operating expenses', type: 'expense' },
  { code: '5200', name: 'Marketing', type: 'expense' },
  { code: '5300', name: 'Wages', type: 'expense' },
  { code: '5400', name: 'Logistics & delivery', type: 'expense' },
  { code: '5500', name: 'Bank charges', type: 'expense' },
]

/** Well-known account codes, so the rest of the server never hard-codes them. */
export const CODES = {
  CASH: '1000',
  RECEIVABLE: '1100',
  INVENTORY: '1200',
  PAYABLE: '2000',
  CAPITAL: '3000',
  RETAINED: '3100',
  SALES: '4000',
  OTHER_INCOME: '4100',
  COGS: '5000',
  OPERATING: '5100',
  MARKETING: '5200',
  WAGES: '5300',
  LOGISTICS: '5400',
  BANK_CHARGES: '5500',
} as const

export interface AccountRow {
  id: string
  company_id: string
  code: string
  name: string
  type: string
  is_cash: number
  created_at: string
}

/** Seeds the chart of accounts for a company. Safe to call more than once. */
export function seedChartOfAccounts(companyId: string): void {
  const now = new Date().toISOString()
  for (const account of CHART_OF_ACCOUNTS) {
    const existing = one<{ id: string }>(
      'SELECT id FROM ledger_accounts WHERE company_id = ? AND code = ?',
      companyId,
      account.code,
    )
    if (existing) continue
    run(
      `INSERT INTO ledger_accounts (id, company_id, code, name, type, is_cash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      companyId,
      account.code,
      account.name,
      account.type,
      account.isCash ? 1 : 0,
      now,
    )
  }
}

export function accountsFor(companyId: string): AccountRow[] {
  return many<AccountRow>(
    'SELECT * FROM ledger_accounts WHERE company_id = ? ORDER BY code',
    companyId,
  )
}

export function accountByCode(companyId: string, code: string): AccountRow | undefined {
  return one<AccountRow>(
    'SELECT * FROM ledger_accounts WHERE company_id = ? AND code = ?',
    companyId,
    code,
  )
}

function requireAccount(companyId: string, code: string): AccountRow {
  const account = accountByCode(companyId, code)
  if (!account) throw new FinanceError(`The chart of accounts has no account ${code}.`)
  return account
}

/* ------------------------------------------------------------ the journal -- */

export type Direction = 'debit' | 'credit'

export interface JournalLineInput {
  code: string
  direction: Direction
  amountKobo: number
  memo?: string
}

export interface PostJournalInput {
  companyId: string
  memo: string
  lines: JournalLineInput[]
  /** Unique across all companies: a repeat of the same key returns the original entry. */
  idempotencyKey: string
  occurredAt?: string
  sourceType?: string
  sourceId?: string | null
  createdBy?: string | null
}

export interface PostJournalResult {
  entryId: string
  /** True when an entry with this key already existed, so nothing new was posted. */
  deduplicated: boolean
}

export interface JournalEntryRow {
  id: string
  company_id: string
  occurred_at: string
  memo: string
  source_type: string
  source_id: string | null
  idempotency_key: string
  created_by: string | null
  created_at: string
}

export interface JournalLineRow {
  id: string
  entry_id: string
  company_id: string
  account_id: string
  direction: string
  amount_kobo: number
  memo: string
  created_at: string
}

/**
 * Posts a balanced journal entry.
 *
 * The whole thing — the uniqueness check, the entry and every line — happens in
 * one transaction, so two racing requests carrying the same key cannot both
 * succeed. Amounts must be positive whole kobo: a zero-amount line is dropped
 * (it carries no meaning) and a negative one is rejected, because direction is
 * expressed by `debit`/`credit`, not by sign.
 */
export function postJournalEntry(input: PostJournalInput): PostJournalResult {
  const lines = input.lines.filter((line) => line.amountKobo !== 0)

  if (lines.length < 2) {
    throw new FinanceError('a journal entry needs at least two lines.')
  }
  for (const line of lines) {
    if (!Number.isInteger(line.amountKobo) || line.amountKobo <= 0) {
      throw new FinanceError('every amount must be a positive whole number of kobo.')
    }
    if (line.direction !== 'debit' && line.direction !== 'credit') {
      throw new FinanceError('each line must be a debit or a credit.')
    }
  }

  const debits = lines
    .filter((line) => line.direction === 'debit')
    .reduce((sum, line) => sum + line.amountKobo, 0)
  const credits = lines
    .filter((line) => line.direction === 'credit')
    .reduce((sum, line) => sum + line.amountKobo, 0)

  if (debits !== credits) {
    throw new FinanceError(
      `the entry does not balance: debits ${formatKobo(debits)} vs credits ${formatKobo(credits)}.`,
    )
  }

  return transaction(() => {
    const existing = one<{ id: string }>(
      'SELECT id FROM journal_entries WHERE idempotency_key = ?',
      input.idempotencyKey,
    )
    if (existing) return { entryId: existing.id, deduplicated: true }

    const now = new Date().toISOString()
    const entryId = newId()
    run(
      `INSERT INTO journal_entries
         (id, company_id, occurred_at, memo, source_type, source_id, idempotency_key, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      entryId,
      input.companyId,
      input.occurredAt ?? now,
      input.memo,
      input.sourceType ?? 'manual',
      input.sourceId ?? null,
      input.idempotencyKey,
      input.createdBy ?? null,
      now,
    )

    for (const line of lines) {
      const account = requireAccount(input.companyId, line.code)
      run(
        `INSERT INTO journal_lines
           (id, entry_id, company_id, account_id, direction, amount_kobo, memo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        entryId,
        input.companyId,
        account.id,
        line.direction,
        line.amountKobo,
        line.memo ?? '',
        now,
      )
    }

    return { entryId, deduplicated: false }
  })
}

/* ------------------------------------------------------- derived balances -- */

export interface AccountBalance {
  code: string
  name: string
  type: AccountType
  isCash: boolean
  debitKobo: number
  creditKobo: number
  /** Signed in the account's natural direction: positive means the normal balance grew. */
  balanceKobo: number
}

interface SumRow {
  code: string
  name: string
  type: string
  is_cash: number
  debit_kobo: number
  credit_kobo: number
}

/**
 * Summed debit and credit movements per account, optionally limited to a date
 * window. Accounts with no activity in the window still appear, at zero, so a
 * report is complete rather than merely non-empty.
 */
function sumAccounts(companyId: string, from?: string, to?: string): SumRow[] {
  const params: (string | number)[] = [companyId]
  let dateFilter = ''
  if (from) {
    dateFilter += ' AND je.occurred_at >= ?'
    params.push(from)
  }
  if (to) {
    dateFilter += ' AND je.occurred_at <= ?'
    params.push(to)
  }
  params.push(companyId)

  const rows = many<SumRow>(
    `SELECT la.code AS code, la.name AS name, la.type AS type, la.is_cash AS is_cash,
            COALESCE(s.debit_kobo, 0) AS debit_kobo,
            COALESCE(s.credit_kobo, 0) AS credit_kobo
     FROM ledger_accounts la
     LEFT JOIN (
       SELECT jl.account_id AS account_id,
              SUM(CASE WHEN jl.direction = 'debit' THEN jl.amount_kobo ELSE 0 END) AS debit_kobo,
              SUM(CASE WHEN jl.direction = 'credit' THEN jl.amount_kobo ELSE 0 END) AS credit_kobo
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.company_id = ?${dateFilter}
       GROUP BY jl.account_id
     ) s ON s.account_id = la.id
     WHERE la.company_id = ?
     ORDER BY la.code`,
    ...params,
  )

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    type: row.type,
    is_cash: Number(row.is_cash),
    debit_kobo: Number(row.debit_kobo),
    credit_kobo: Number(row.credit_kobo),
  }))
}

function toBalance(row: SumRow): AccountBalance {
  const type: AccountType = isAccountType(row.type) ? row.type : 'asset'
  const net = isDebitNormal(type)
    ? row.debit_kobo - row.credit_kobo
    : row.credit_kobo - row.debit_kobo
  return {
    code: row.code,
    name: row.name,
    type,
    isCash: row.is_cash === 1,
    debitKobo: row.debit_kobo,
    creditKobo: row.credit_kobo,
    balanceKobo: net,
  }
}

/** Every account with its derived balance as of now. */
export function accountBalances(companyId: string): AccountBalance[] {
  return sumAccounts(companyId).map(toBalance)
}

/** The derived balance of one account, in its natural direction. */
export function balanceForCode(companyId: string, code: string): number {
  const row = sumAccounts(companyId).find((r) => r.code === code)
  return row ? toBalance(row).balanceKobo : 0
}

/**
 * The company's cash, summed from the ledger. This is the authoritative cash
 * figure — there is no stored counter that could drift from the entries.
 */
export function cashBalanceKobo(companyId: string): number {
  const row = one<{ balance: number }>(
    `SELECT COALESCE(SUM(CASE WHEN jl.direction = 'debit' THEN jl.amount_kobo ELSE -jl.amount_kobo END), 0) AS balance
     FROM journal_lines jl
     JOIN ledger_accounts la ON la.id = jl.account_id
     WHERE jl.company_id = ? AND la.is_cash = 1`,
    companyId,
  )
  return Number(row?.balance ?? 0)
}

/* ------------------------------------------------------------ the ledger -- */

export interface LedgerLine {
  id: string
  code: string
  name: string
  direction: string
  amountKobo: number
  memo: string
}

export interface LedgerEntry {
  id: string
  occurredAt: string
  memo: string
  sourceType: string
  sourceId: string | null
  lines: LedgerLine[]
}

export interface LedgerQuery {
  limit?: number
  accountCode?: string
  from?: string
  to?: string
}

/** The journal, newest first, with each entry's lines. */
export function ledgerEntries(companyId: string, query: LedgerQuery = {}): LedgerEntry[] {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200)
  const params: (string | number)[] = [companyId]
  let filter = ''
  if (query.from) {
    filter += ' AND occurred_at >= ?'
    params.push(query.from)
  }
  if (query.to) {
    filter += ' AND occurred_at <= ?'
    params.push(query.to)
  }
  if (query.accountCode) {
    filter +=
      ' AND id IN (SELECT jl.entry_id FROM journal_lines jl JOIN ledger_accounts la ON la.id = jl.account_id WHERE la.code = ?)'
    params.push(query.accountCode)
  }
  params.push(limit)

  const entries = many<JournalEntryRow>(
    `SELECT * FROM journal_entries WHERE company_id = ?${filter} ORDER BY occurred_at DESC, created_at DESC LIMIT ?`,
    ...params,
  )
  if (entries.length === 0) return []

  const ids = entries.map((entry) => entry.id)
  const placeholders = ids.map(() => '?').join(', ')
  interface LedgerLineRaw {
    id: string
    entry_id: string
    code: string
    name: string
    direction: string
    amount_kobo: number
    memo: string
  }
  const lines = many<LedgerLineRaw>(
    `SELECT jl.id AS id, jl.entry_id AS entry_id, la.code AS code, la.name AS name,
            jl.direction AS direction, jl.amount_kobo AS amount_kobo, jl.memo AS memo
     FROM journal_lines jl
     JOIN ledger_accounts la ON la.id = jl.account_id
     WHERE jl.entry_id IN (${placeholders})
     ORDER BY jl.rowid ASC`,
    ...ids,
  )

  return entries.map((entry) => ({
    id: entry.id,
    occurredAt: entry.occurred_at,
    memo: entry.memo,
    sourceType: entry.source_type,
    sourceId: entry.source_id,
    lines: lines
      .filter((line) => line.entry_id === entry.id)
      .map((line) => ({
        id: line.id,
        code: line.code,
        name: line.name,
        direction: line.direction,
        amountKobo: Number(line.amount_kobo),
        memo: line.memo,
      })),
  }))
}

/* ----------------------------------------------------------- the reports -- */

export interface ReportRange {
  from?: string
  to?: string
}

export interface TrialBalanceReport {
  rows: { code: string; name: string; type: AccountType; debitKobo: number; creditKobo: number }[]
  totalDebitKobo: number
  totalCreditKobo: number
  balanced: boolean
}

export function trialBalance(companyId: string, range: ReportRange = {}): TrialBalanceReport {
  const rows = sumAccounts(companyId, range.from, range.to)
    .filter((row) => row.debit_kobo !== 0 || row.credit_kobo !== 0)
    .map((row) => ({
      code: row.code,
      name: row.name,
      type: (isAccountType(row.type) ? row.type : 'asset') as AccountType,
      debitKobo: row.debit_kobo,
      creditKobo: row.credit_kobo,
    }))

  const totalDebitKobo = rows.reduce((sum, row) => sum + row.debitKobo, 0)
  const totalCreditKobo = rows.reduce((sum, row) => sum + row.creditKobo, 0)

  return {
    rows,
    totalDebitKobo,
    totalCreditKobo,
    balanced: totalDebitKobo === totalCreditKobo,
  }
}

export interface ProfitAndLossReport {
  from: string | null
  to: string | null
  revenue: { code: string; name: string; amountKobo: number }[]
  totalRevenueKobo: number
  costOfSalesKobo: number
  grossProfitKobo: number
  expenses: { code: string; name: string; amountKobo: number }[]
  totalExpensesKobo: number
  netProfitKobo: number
}

export function profitAndLoss(companyId: string, range: ReportRange = {}): ProfitAndLossReport {
  const balances = sumAccounts(companyId, range.from, range.to).map(toBalance)

  const revenue = balances
    .filter((account) => account.type === 'revenue' && account.balanceKobo !== 0)
    .map((account) => ({ code: account.code, name: account.name, amountKobo: account.balanceKobo }))

  const expenseAccounts = balances.filter(
    (account) => account.type === 'expense' && account.balanceKobo !== 0,
  )
  const costOfSalesKobo = expenseAccounts
    .filter((account) => account.code === CODES.COGS)
    .reduce((sum, account) => sum + account.balanceKobo, 0)
  const expenses = expenseAccounts
    .filter((account) => account.code !== CODES.COGS)
    .map((account) => ({ code: account.code, name: account.name, amountKobo: account.balanceKobo }))

  const totalRevenueKobo = revenue.reduce((sum, line) => sum + line.amountKobo, 0)
  const totalExpensesKobo = expenses.reduce((sum, line) => sum + line.amountKobo, 0)
  const grossProfitKobo = totalRevenueKobo - costOfSalesKobo
  const netProfitKobo = grossProfitKobo - totalExpensesKobo

  return {
    from: range.from ?? null,
    to: range.to ?? null,
    revenue,
    totalRevenueKobo,
    costOfSalesKobo,
    grossProfitKobo,
    expenses,
    totalExpensesKobo,
    netProfitKobo,
  }
}

export interface BalanceSheetReport {
  asOf: string | null
  assets: { code: string; name: string; amountKobo: number }[]
  totalAssetsKobo: number
  liabilities: { code: string; name: string; amountKobo: number }[]
  totalLiabilitiesKobo: number
  equity: { code: string; name: string; amountKobo: number }[]
  retainedEarningsKobo: number
  totalEquityKobo: number
  /** Assets should equal liabilities plus equity. */
  balanced: boolean
}

export function balanceSheet(companyId: string, asOf?: string): BalanceSheetReport {
  const balances = sumAccounts(companyId, undefined, asOf).map(toBalance)

  const pick = (type: AccountType) =>
    balances
      .filter((account) => account.type === type && account.balanceKobo !== 0)
      .map((account) => ({ code: account.code, name: account.name, amountKobo: account.balanceKobo }))

  const assets = pick('asset')
  const liabilities = pick('liability')
  const equity = pick('equity')

  // Profit not yet distributed sits in equity as retained earnings. It is the
  // revenue earned less the expenses incurred over the whole life of the books.
  const revenueKobo = balances
    .filter((account) => account.type === 'revenue')
    .reduce((sum, account) => sum + account.balanceKobo, 0)
  const expenseKobo = balances
    .filter((account) => account.type === 'expense')
    .reduce((sum, account) => sum + account.balanceKobo, 0)
  const retainedEarningsKobo = revenueKobo - expenseKobo

  const totalAssetsKobo = assets.reduce((sum, line) => sum + line.amountKobo, 0)
  const totalLiabilitiesKobo = liabilities.reduce((sum, line) => sum + line.amountKobo, 0)
  const totalEquityKobo =
    equity.reduce((sum, line) => sum + line.amountKobo, 0) + retainedEarningsKobo

  return {
    asOf: asOf ?? null,
    assets,
    totalAssetsKobo,
    liabilities,
    totalLiabilitiesKobo,
    equity,
    retainedEarningsKobo,
    totalEquityKobo,
    balanced: totalAssetsKobo === totalLiabilitiesKobo + totalEquityKobo,
  }
}

export interface CashFlowReport {
  from: string | null
  to: string | null
  openingKobo: number
  inflows: { source: string; amountKobo: number }[]
  outflows: { source: string; amountKobo: number }[]
  totalInflowsKobo: number
  totalOutflowsKobo: number
  netChangeKobo: number
  closingKobo: number
}

interface CashSourceRow {
  source_type: string
  cash_kobo: number
}

export function cashFlow(companyId: string, range: ReportRange = {}): CashFlowReport {
  const cashParams: (string | number)[] = [companyId]
  let openingFilter = ' AND je.occurred_at < ?'
  if (range.from) {
    cashParams.push(range.from)
  } else {
    // With no start date the statement covers all of time, so it opens at zero
    // rather than at the closing balance — otherwise the period would be counted twice.
    openingFilter = ' AND 1 = 0'
  }

  const openingRow = one<{ balance: number }>(
    `SELECT COALESCE(SUM(CASE WHEN jl.direction = 'debit' THEN jl.amount_kobo ELSE -jl.amount_kobo END), 0) AS balance
     FROM journal_lines jl
     JOIN ledger_accounts la ON la.id = jl.account_id
     JOIN journal_entries je ON je.id = jl.entry_id
     WHERE jl.company_id = ? AND la.is_cash = 1${openingFilter}`,
    ...cashParams,
  )
  const openingKobo = Number(openingRow?.balance ?? 0)

  const catParams: (string | number)[] = [companyId]
  let dateFilter = ''
  if (range.from) {
    dateFilter += ' AND je.occurred_at >= ?'
    catParams.push(range.from)
  }
  if (range.to) {
    dateFilter += ' AND je.occurred_at <= ?'
    catParams.push(range.to)
  }

  const grouped = many<CashSourceRow>(
    `SELECT je.source_type AS source_type,
            SUM(CASE WHEN jl.direction = 'debit' THEN jl.amount_kobo ELSE -jl.amount_kobo END) AS cash_kobo
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.entry_id
     JOIN ledger_accounts la ON la.id = jl.account_id
     WHERE jl.company_id = ? AND la.is_cash = 1${dateFilter}
     GROUP BY je.source_type
     ORDER BY je.source_type`,
    ...catParams,
  )

  const inflows: { source: string; amountKobo: number }[] = []
  const outflows: { source: string; amountKobo: number }[] = []
  for (const row of grouped) {
    const amount = Number(row.cash_kobo)
    if (amount > 0) inflows.push({ source: row.source_type, amountKobo: amount })
    else if (amount < 0) outflows.push({ source: row.source_type, amountKobo: -amount })
  }

  const totalInflowsKobo = inflows.reduce((sum, line) => sum + line.amountKobo, 0)
  const totalOutflowsKobo = outflows.reduce((sum, line) => sum + line.amountKobo, 0)
  const netChangeKobo = totalInflowsKobo - totalOutflowsKobo

  return {
    from: range.from ?? null,
    to: range.to ?? null,
    openingKobo,
    inflows,
    outflows,
    totalInflowsKobo,
    totalOutflowsKobo,
    netChangeKobo,
    closingKobo: openingKobo + netChangeKobo,
  }
}

/** All four statements, as the Finance screen presents them. */
export function financialReports(companyId: string, range: ReportRange = {}) {
  return {
    cashKobo: cashBalanceKobo(companyId),
    trialBalance: trialBalance(companyId, range),
    profitAndLoss: profitAndLoss(companyId, range),
    balanceSheet: balanceSheet(companyId, range.to),
    cashFlow: cashFlow(companyId, range),
  }
}
