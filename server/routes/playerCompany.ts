import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { CompanyError, ensureCompany, toCompany, type CompanyRow } from '../company'
import { many, one, run, transaction } from '../db'
import {
  FinanceError,
  CODES,
  accountBalances,
  cashBalanceKobo,
  financialReports,
  formatKobo,
  fromKobo,
  ledgerEntries,
  postJournalEntry,
  toKobo,
} from '../finance'
import { actionKey } from '../idempotency'
import { wrap } from '../middleware'
import { emitEvent } from '../outbox'
import { RULE_VERSIONS } from '../rules'
import { newId } from '../security'
import { audit } from '../users'

/**
 * The player's company: its books, its stock, its customers and — the loop this
 * whole layer exists for — the journey of an order from a customer enquiry to
 * settled cash.
 *
 * Every route operates on the company the signed-in player owns. The company id
 * is never taken from the request, so one player can never read or write
 * another player's books.
 */

const router = Router()

/* ------------------------------------------------------------- plumbing -- */

/** Turns a domain error into a 400 and lets anything else become a 500. */
function route(handler: (req: Request, res: Response) => Promise<void>) {
  return wrap(async (req, res) => {
    try {
      await handler(req, res)
    } catch (error) {
      if (error instanceof FinanceError || error instanceof CompanyError) {
        res.status(400).json({ error: error.message })
        return
      }
      throw error
    }
  })
}

/** The company owned by the signed-in player, provisioning it on first use. */
function companyFor(req: Request): CompanyRow {
  return ensureCompany(req.user!.id)
}

const idempotencyField = z.string().trim().min(6).max(120).optional()
const moneyField = z.number().finite().nonnegative().max(1_000_000_000_000)

/**
 * The key a request is de-duplicated on.
 *
 * The client's key wins when it sent one. Otherwise the key is derived from the
 * action's own content, so an identical retry still maps to the first outcome
 * rather than posting again.
 */
function key(prefix: string, provided: string | undefined, body: unknown): string {
  return provided ?? actionKey(prefix, 'action', body)
}

/** Reads a numeric simulation rule, falling back to a safe default. */
function ruleNumber(ruleKey: string, fallback: number): number {
  const row = one<{ value: string }>('SELECT value FROM simulation_rules WHERE key = ?', ruleKey)
  const parsed = row ? Number(row.value) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Refuses a spend the company cannot afford.
 *
 * Cash is the ledger's derived balance, so this is the one place that decides
 * whether a payment is possible. Every route that moves money out calls it, and
 * a refusal names the shortfall in plain language.
 */
function requireCash(companyId: string, amountKobo: number, what: string): void {
  if (amountKobo <= 0) return
  const available = cashBalanceKobo(companyId)
  if (available < amountKobo) {
    throw new FinanceError(
      `there is not enough cash: ${what} costs ${formatKobo(amountKobo)} but the company has ${formatKobo(available)}.`,
    )
  }
}

/**
 * Records that something consequential happened, for downstream processing.
 *
 * Written in the same transaction as the change it describes, so the two cannot
 * disagree.
 */
function emit(companyId: string, type: string, payload: Record<string, unknown>, idempotencyKey: string): void {
  emitEvent({ companyId, type, payload, idempotencyKey })
}

/* -------------------------------------------------------------- company -- */

function companyPayload(company: CompanyRow) {
  const cashKobo = cashBalanceKobo(company.id)
  const counts = one<{
    products: number
    customers: number
    orders: number
    invoices: number
  }>(
    `SELECT
       (SELECT COUNT(*) FROM products WHERE company_id = ?) AS products,
       (SELECT COUNT(*) FROM customers WHERE company_id = ?) AS customers,
       (SELECT COUNT(*) FROM orders WHERE company_id = ?) AS orders,
       (SELECT COUNT(*) FROM invoices WHERE company_id = ?) AS invoices`,
    company.id,
    company.id,
    company.id,
    company.id,
  )

  return {
    company: toCompany(company),
    cashKobo,
    cash: fromKobo(cashKobo),
    counts: {
      products: Number(counts?.products ?? 0),
      customers: Number(counts?.customers ?? 0),
      orders: Number(counts?.orders ?? 0),
      invoices: Number(counts?.invoices ?? 0),
    },
  }
}

router.get(
  '/',
  route(async (req, res) => {
    res.json(companyPayload(companyFor(req)))
  }),
)

router.post(
  '/provision',
  route(async (req, res) => {
    const company = companyFor(req)
    res.json({ ...companyPayload(company), ok: true })
  }),
)

/**
 * Registers the company at the simulated Corporate Affairs registry.
 *
 * This is deliberately a company mutation rather than a progression shortcut:
 * the legal status and the registration fee must land together in the books.
 */
router.post(
  '/register',
  route(async (req, res) => {
    const parsed = z.object({ idempotencyKey: idempotencyField }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'That registration request is not valid.' })
      return
    }

    const company = companyFor(req)
    if (company.registration_status === 'REGISTERED') {
      res.json({ registered: true, entryId: '', ...companyPayload(company) })
      return
    }

    const feeKobo = toKobo(ruleNumber('company_registration_fee', 25000))
    requireCash(company.id, feeKobo, 'company registration')
    const registrationKey = key(`registration:${company.id}`, parsed.data.idempotencyKey, { feeKobo })
    const existing = one<{ id: string }>(
      'SELECT id FROM journal_entries WHERE idempotency_key = ?',
      registrationKey,
    )
    if (existing) {
      const current = companyFor(req)
      res.json({ registered: current.registration_status === 'REGISTERED', entryId: existing.id, ...companyPayload(current) })
      return
    }

    let entryId: string
    let updated: CompanyRow
    transaction(() => {
      const now = new Date().toISOString()
      run(
        `UPDATE companies
         SET registration_status = 'REGISTERED', compliance_status = 'PENDING', updated_at = ?
         WHERE id = ?`,
        now,
        company.id,
      )
      const posted = postJournalEntry({
        companyId: company.id,
        memo: 'Corporate Affairs company registration fee',
        sourceType: 'registration',
        sourceId: company.id,
        idempotencyKey: registrationKey,
        createdBy: req.user!.id,
        lines: [
          { code: CODES.OPERATING, direction: 'debit', amountKobo: feeKobo },
          { code: CODES.CASH, direction: 'credit', amountKobo: feeKobo },
        ],
      })
      entryId = posted.entryId
      emit(company.id, 'company.registered', { feeKobo, entryId }, `evt:registration:${company.id}`)
      updated = one<CompanyRow>('SELECT * FROM companies WHERE id = ?', company.id)!
    })

    audit(req.user!.id, 'company.registered', `${updated!.name} registered at the Corporate Affairs registry`)
    res.status(201).json({ registered: true, entryId: entryId!, ...companyPayload(updated!) })
  }),
)

/** Closes the outstanding CAC requirements after the player has collected them. */
router.post(
  '/complete-registration',
  route(async (req, res) => {
    const parsed = z.object({ idempotencyKey: idempotencyField }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'That completion request is not valid.' })
      return
    }

    const company = companyFor(req)
    if (company.registration_status !== 'REGISTERED') {
      res.status(400).json({ error: 'Register the company before completing its requirements.' })
      return
    }
    if (company.compliance_status === 'COMPLIANT') {
      res.json({ completed: true, ...companyPayload(company) })
      return
    }

    const requirements = one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM mission_evidence
       WHERE user_id = ? AND company_id = ? AND kind = 'collect_info' AND target = 'requirement_info'`,
      req.user!.id,
      company.id,
    )
    if (Number(requirements?.n ?? 0) < 3) {
      res.status(400).json({ error: 'Collect all 3 regulatory requirements before completing registration.' })
      return
    }

    const now = new Date().toISOString()
    let updated: CompanyRow
    transaction(() => {
      run(
        `UPDATE companies SET compliance_status = 'COMPLIANT', updated_at = ? WHERE id = ?`,
        now,
        company.id,
      )
      emit(
        company.id,
        'company.compliance_completed',
        { requirements: 3 },
        `evt:compliance:${company.id}`,
      )
      updated = one<CompanyRow>('SELECT * FROM companies WHERE id = ?', company.id)!
    })

    audit(req.user!.id, 'company.compliance_completed', `${updated!.name} completed its CAC requirements`)
    res.status(201).json({ completed: true, ...companyPayload(updated!) })
  }),
)

/* ---------------------------------------------------------------- books -- */

router.post(
  '/lease-premises',
  route(async (req, res) => {
    const parsed = z.object({ idempotencyKey: idempotencyField }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'That premises request is not valid.' })
      return
    }
    const company = companyFor(req)
    if (company.premises_status === 'LEASED') {
      res.json({ leased: true, entryId: '', ...companyPayload(company) })
      return
    }
    if (company.compliance_status !== 'COMPLIANT') {
      res.status(400).json({ error: 'Complete company registration before leasing premises.' })
      return
    }
    const costKobo = toKobo(ruleNumber('premises_lease_cost', 40000))
    requireCash(company.id, costKobo, 'premises lease')
    const leaseKey = key(`premises:${company.id}`, parsed.data.idempotencyKey, { costKobo })
    let entryId: string
    let updated: CompanyRow
    transaction(() => {
      const now = new Date().toISOString()
      run('UPDATE companies SET premises_status = \'LEASED\', updated_at = ? WHERE id = ?', now, company.id)
      entryId = postJournalEntry({
        companyId: company.id,
        memo: 'Initial trading premises lease',
        sourceType: 'premises',
        sourceId: company.id,
        idempotencyKey: leaseKey,
        createdBy: req.user!.id,
        lines: [
          { code: CODES.OPERATING, direction: 'debit', amountKobo: costKobo },
          { code: CODES.CASH, direction: 'credit', amountKobo: costKobo },
        ],
      }).entryId
      emit(company.id, 'company.premises_leased', { costKobo, entryId }, `evt:premises:${company.id}`)
      updated = one<CompanyRow>('SELECT * FROM companies WHERE id = ?', company.id)!
    })
    audit(req.user!.id, 'company.premises_leased', `${updated!.name} secured trading premises`)
    res.status(201).json({ leased: true, entryId: entryId!, ...companyPayload(updated!) })
  }),
)

router.post(
  '/open-business',
  route(async (req, res) => {
    const parsed = z.object({ idempotencyKey: idempotencyField }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'That opening request is not valid.' })
      return
    }
    const company = companyFor(req)
    if (company.operational_status === 'OPEN') {
      res.json({ opened: true, ...companyPayload(company) })
      return
    }
    if (company.premises_status !== 'LEASED') {
      res.status(400).json({ error: 'Secure trading premises before opening the business.' })
      return
    }
    const now = new Date().toISOString()
    let updated: CompanyRow
    transaction(() => {
      run('UPDATE companies SET operational_status = \'OPEN\', updated_at = ? WHERE id = ?', now, company.id)
      emit(company.id, 'company.opened', {}, `evt:open:${company.id}`)
      updated = one<CompanyRow>('SELECT * FROM companies WHERE id = ?', company.id)!
    })
    audit(req.user!.id, 'company.opened', `${updated!.name} opened for business`)
    res.status(201).json({ opened: true, ...companyPayload(updated!) })
  }),
)

router.post(
  '/open-bank-account',
  route(async (req, res) => {
    const parsed = z.object({ idempotencyKey: idempotencyField }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'That bank account request is not valid.' })
      return
    }
    const company = companyFor(req)
    if (company.bank_account_status === 'OPEN') {
      res.json({ opened: true, ...companyPayload(company) })
      return
    }
    if (company.operational_status !== 'OPEN') {
      res.status(400).json({ error: 'Open the business before opening its bank account.' })
      return
    }
    const now = new Date().toISOString()
    let updated: CompanyRow
    transaction(() => {
      run('UPDATE companies SET bank_account_status = \'OPEN\', updated_at = ? WHERE id = ?', now, company.id)
      emit(company.id, 'company.bank_account_opened', {}, `evt:bank-account:${company.id}`)
      updated = one<CompanyRow>('SELECT * FROM companies WHERE id = ?', company.id)!
    })
    audit(req.user!.id, 'company.bank_account_opened', `${updated!.name} opened a business bank account`)
    res.status(201).json({ opened: true, ...companyPayload(updated!) })
  }),
)

router.get(
  '/accounts',
  route(async (req, res) => {
    const company = companyFor(req)
    res.json({ accounts: accountBalances(company.id) })
  }),
)

router.get(
  '/ledger',
  route(async (req, res) => {
    const company = companyFor(req)
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).optional(),
        accountCode: z.string().trim().max(10).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .safeParse(req.query)
    if (!query.success) {
      res.status(400).json({ error: 'That ledger query is not valid.' })
      return
    }
    res.json({ entries: ledgerEntries(company.id, query.data) })
  }),
)

router.get(
  '/reports',
  route(async (req, res) => {
    const company = companyFor(req)
    const query = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .safeParse(req.query)
    if (!query.success) {
      res.status(400).json({ error: 'That report range is not valid.' })
      return
    }
    res.json({ reports: financialReports(company.id, query.data) })
  }),
)

/* -------------------------------------------------------------- funding -- */

/**
 * Money entering the business is never typed straight into the ledger.
 *
 * It only ever arrives through a recorded funding agreement, and the agreement
 * is what the journal entry is posted against. Phase 1 supports the founder
 * contribution — the money an owner puts in themselves; Phase 4 adds loans,
 * gifts and equity rounds on the same footing.
 *
 * "Income" has no route at all: revenue is recognised when a customer's invoice
 * is settled (see the payments route below), never minted on request.
 */

interface FundingAgreementRow {
  id: string
  company_id: string
  kind: string
  counterparty: string
  principal_kobo: number
  equity_basis: number
  terms: string
  status: string
  rule_version: string
  agreed_at: string
  created_at: string
}

function toFundingAgreement(row: FundingAgreementRow) {
  return {
    id: row.id,
    kind: row.kind,
    counterparty: row.counterparty,
    principalKobo: Number(row.principal_kobo),
    equityBasis: Number(row.equity_basis),
    terms: row.terms,
    status: row.status,
    agreedAt: row.agreed_at,
  }
}

router.get(
  '/funding',
  route(async (req, res) => {
    const company = companyFor(req)
    const rows = many<FundingAgreementRow>(
      'SELECT * FROM funding_agreements WHERE company_id = ? ORDER BY created_at DESC',
      company.id,
    )
    res.json({ agreements: rows.map(toFundingAgreement) })
  }),
)

const contributionSchema = z.object({
  amount: moneyField,
  counterparty: z.string().trim().max(80).optional(),
  memo: z.string().trim().max(160).optional(),
  idempotencyKey: idempotencyField,
})

router.post(
  '/funding/contributions',
  route(async (req, res) => {
    const parsed = contributionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter an amount to put into the business.' })
      return
    }
    const company = companyFor(req)
    const amountKobo = toKobo(parsed.data.amount)
    if (amountKobo <= 0) {
      res.status(400).json({ error: 'The amount must be more than zero.' })
      return
    }

    const now = new Date().toISOString()
    const agreementId = newId()
    const idempotencyKey = key(`contribution:${company.id}`, parsed.data.idempotencyKey, {
      amountKobo,
      counterparty: parsed.data.counterparty ?? 'Founder',
    })

    // A retry of a request that already landed returns what it produced.
    const existing = one<FundingAgreementRow>(
      'SELECT * FROM funding_agreements WHERE company_id = ? AND kind = ? AND principal_kobo = ? ORDER BY created_at DESC LIMIT 1',
      company.id,
      'FOUNDER_CONTRIBUTION',
      amountKobo,
    )
    const alreadyPosted = one<{ id: string }>(
      'SELECT id FROM journal_entries WHERE idempotency_key = ?',
      `funding:${idempotencyKey}`,
    )
    if (alreadyPosted && existing) {
      res.json({ agreement: toFundingAgreement(existing), ...companyPayload(company) })
      return
    }

    let agreement: FundingAgreementRow
    let entryId: string
    transaction(() => {
      run(
        `INSERT INTO funding_agreements
           (id, company_id, kind, counterparty, principal_kobo, equity_basis, terms, status, rule_version, agreed_at, created_at)
         VALUES (?, ?, 'FOUNDER_CONTRIBUTION', ?, ?, 0, ?, 'ACTIVE', ?, ?, ?)`,
        agreementId,
        company.id,
        parsed.data.counterparty ?? 'Founder',
        amountKobo,
        parsed.data.memo ?? 'Money the owner put into the business.',
        RULE_VERSIONS.finance,
        now,
        now,
      )

      const posted = postJournalEntry({
        companyId: company.id,
        memo: parsed.data.memo ?? 'Founder contribution',
        sourceType: 'funding',
        sourceId: agreementId,
        idempotencyKey: `funding:${idempotencyKey}`,
        createdBy: req.user!.id,
        lines: [
          { code: CODES.CASH, direction: 'debit', amountKobo },
          { code: CODES.CAPITAL, direction: 'credit', amountKobo },
        ],
      })
      entryId = posted.entryId

      emit(
        company.id,
        'funding.contribution',
        { agreementId, amountKobo, kind: 'FOUNDER_CONTRIBUTION' },
        `evt:funding:${agreementId}`,
      )

      agreement = one<FundingAgreementRow>('SELECT * FROM funding_agreements WHERE id = ?', agreementId)!
    })

    audit(req.user!.id, 'company.funding', `${formatKobo(amountKobo)} founder contribution recorded`)
    res.status(201).json({ agreement: toFundingAgreement(agreement!), entryId: entryId!, ...companyPayload(company) })
  }),
)

/* ------------------------------------------------------------ expenses -- */

/**
 * A cash expense the owner records by hand.
 *
 * The account it lands in is chosen here, never by the client, so a request
 * cannot post to an arbitrary part of the books. Cash must already be there.
 */
const expenseSchema = z.object({
  amount: moneyField,
  memo: z.string().trim().max(160).optional(),
  idempotencyKey: idempotencyField,
})

router.post(
  '/expenses',
  route(async (req, res) => {
    const parsed = expenseSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter an amount to record as an expense.' })
      return
    }
    const company = companyFor(req)
    const amountKobo = toKobo(parsed.data.amount)
    if (amountKobo <= 0) {
      res.status(400).json({ error: 'The amount must be more than zero.' })
      return
    }

    requireCash(company.id, amountKobo, 'this expense')
    const expenseKey = key(`expense:${company.id}`, parsed.data.idempotencyKey, {
      amountKobo,
      memo: parsed.data.memo ?? '',
    })

    let entryId: string
    transaction(() => {
      const posted = postJournalEntry({
        companyId: company.id,
        memo: parsed.data.memo ?? 'Operating expense',
        sourceType: 'expense',
        idempotencyKey: expenseKey,
        createdBy: req.user!.id,
        lines: [
          { code: CODES.OPERATING, direction: 'debit', amountKobo },
          { code: CODES.CASH, direction: 'credit', amountKobo },
        ],
      })
      entryId = posted.entryId
      emit(company.id, 'expense.recorded', { amountKobo, entryId }, `evt:expense:${expenseKey}`)
    })

    audit(req.user!.id, 'company.expense', `${formatKobo(amountKobo)} expense recorded`)
    res.status(201).json({ entryId: entryId!, ...companyPayload(company) })
  }),
)

/* ------------------------------------------------------------- products -- */

interface ProductRow {
  id: string
  company_id: string
  name: string
  sku: string
  description: string
  unit_cost_kobo: number
  unit_price_kobo: number
  active: number
  created_at: string
  updated_at: string
}

function toProduct(row: ProductRow, onHand = 0) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    description: row.description,
    unitCostKobo: Number(row.unit_cost_kobo),
    unitPriceKobo: Number(row.unit_price_kobo),
    unitCost: fromKobo(Number(row.unit_cost_kobo)),
    unitPrice: fromKobo(Number(row.unit_price_kobo)),
    active: row.active === 1,
    onHand,
    stockValueKobo: onHand * Number(row.unit_cost_kobo),
  }
}

function onHandFor(companyId: string): Map<string, number> {
  const rows = many<{ product_id: string; on_hand: number }>(
    `SELECT product_id, COALESCE(SUM(quantity), 0) AS on_hand
     FROM stock_movements WHERE company_id = ? GROUP BY product_id`,
    companyId,
  )
  return new Map(rows.map((row) => [row.product_id, Number(row.on_hand)]))
}

router.get(
  '/products',
  route(async (req, res) => {
    const company = companyFor(req)
    const onHand = onHandFor(company.id)
    const rows = many<ProductRow>(
      'SELECT * FROM products WHERE company_id = ? ORDER BY created_at DESC',
      company.id,
    )
    res.json({ products: rows.map((row) => toProduct(row, onHand.get(row.id) ?? 0)) })
  }),
)

const productSchema = z.object({
  name: z.string().trim().min(2, 'Give the product a name.').max(80),
  sku: z.string().trim().max(40).optional(),
  description: z.string().trim().max(300).optional(),
  unitCost: moneyField.optional(),
  unitPrice: moneyField.optional(),
})

router.post(
  '/products',
  route(async (req, res) => {
    const parsed = productSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the product.' })
      return
    }
    const company = companyFor(req)
    const data = parsed.data

    const baseSku =
      data.sku?.trim() ||
      data.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 20) ||
      'SKU'

    let sku = baseSku
    let suffix = 1
    while (one<{ id: string }>('SELECT id FROM products WHERE company_id = ? AND sku = ?', company.id, sku)) {
      suffix += 1
      sku = `${baseSku}-${suffix}`
    }

    const now = new Date().toISOString()
    const id = newId()
    transaction(() => {
      run(
        `INSERT INTO products
           (id, company_id, name, sku, description, unit_cost_kobo, unit_price_kobo, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        id,
        company.id,
        data.name,
        sku,
        data.description ?? '',
        toKobo(data.unitCost ?? 0),
        toKobo(data.unitPrice ?? 0),
        now,
        now,
      )
      emit(
        company.id,
        'product.created',
        { productId: id, name: data.name, sku },
        `evt:product:${id}`,
      )
    })

    audit(req.user!.id, 'company.product', `Product ${data.name} added to the catalogue`)
    const row = one<ProductRow>('SELECT * FROM products WHERE id = ?', id)!
    res.status(201).json({ product: toProduct(row, 0) })
  }),
)

/* ------------------------------------------------------------ inventory -- */

router.get(
  '/inventory',
  route(async (req, res) => {
    const company = companyFor(req)
    const onHand = onHandFor(company.id)
    const rows = many<ProductRow>(
      'SELECT * FROM products WHERE company_id = ? ORDER BY name',
      company.id,
    )
    const items = rows.map((row) => toProduct(row, onHand.get(row.id) ?? 0))
    res.json({
      items,
      totalUnits: items.reduce((sum, item) => sum + item.onHand, 0),
      totalValueKobo: items.reduce((sum, item) => sum + item.stockValueKobo, 0),
    })
  }),
)

const purchaseSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().int().positive().max(1_000_000),
  unitCost: moneyField.optional(),
  supplierName: z.string().trim().max(80).optional(),
  memo: z.string().trim().max(160).optional(),
  idempotencyKey: idempotencyField,
})

/**
 * Buying stock on credit from a supplier.
 *
 * The goods arrive and the liability is recorded — the company owes its
 * supplier — but no cash leaves yet. Cash falls only when the bill is paid (see
 * the payables section). This is the difference between a purchase and a
 * payment, and getting it wrong is how a business talks itself into thinking it
 * has money it does not have.
 */
router.post(
  '/inventory/purchase',
  route(async (req, res) => {
    const parsed = purchaseSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Say which product and how many units you are buying.' })
      return
    }
    const company = companyFor(req)
    const data = parsed.data

    const product = one<ProductRow>(
      'SELECT * FROM products WHERE id = ? AND company_id = ?',
      data.productId,
      company.id,
    )
    if (!product) {
      res.status(404).json({ error: 'That product is not on this company.' })
      return
    }

    const unitCostKobo = toKobo(data.unitCost ?? fromKobo(Number(product.unit_cost_kobo)))
    const totalKobo = unitCostKobo * data.quantity
    if (totalKobo <= 0) {
      res.status(400).json({ error: 'Set a unit cost before buying stock on credit.' })
      return
    }

    const now = new Date().toISOString()
    const movementId = newId()
    const billId = newId()
    const terms = ruleNumber('supplier_payment_terms', 30)
    const due = new Date(Date.now() + terms * 24 * 60 * 60 * 1000)
    const purchaseKey = key(`purchase:${company.id}`, data.idempotencyKey, {
      productId: product.id,
      quantity: data.quantity,
      unitCostKobo,
    })

    let supplierId: string | null = null
    if (data.supplierName) {
      const existing = one<{ id: string }>(
        'SELECT id FROM suppliers WHERE company_id = ? AND name = ?',
        company.id,
        data.supplierName,
      )
      if (existing) supplierId = existing.id
      else {
        supplierId = newId()
        run(
          'INSERT INTO suppliers (id, company_id, name, category, lead_time_days, created_at) VALUES (?, ?, ?, ?, 3, ?)',
          supplierId,
          company.id,
          data.supplierName,
          'general',
          now,
        )
      }
    }

    let entryId: string
    transaction(() => {
      run(
        `INSERT INTO stock_movements
           (id, company_id, product_id, kind, quantity, unit_cost_kobo, source_type, source_id,
            supplier_id, note, occurred_at, idempotency_key, created_at)
         VALUES (?, ?, ?, 'purchase', ?, ?, 'purchase', ?, ?, ?, ?, ?, ?)`,
        movementId,
        company.id,
        product.id,
        data.quantity,
        unitCostKobo,
        movementId,
        supplierId,
        data.memo ?? 'Stock purchase',
        now,
        `stock:${purchaseKey}`,
        now,
      )

      // The most recent purchase price becomes the product's cost, so the
      // inventory value and the cost of sales follow the market.
      run(
        'UPDATE products SET unit_cost_kobo = ?, updated_at = ? WHERE id = ?',
        unitCostKobo,
        now,
        product.id,
      )

      // The supplier's bill: a payable, due in the agreed terms.
      run(
        `INSERT INTO bills
           (id, company_id, supplier_id, reference, status, amount_kobo, paid_kobo, issued_at, due_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'OPEN', ?, 0, ?, ?, ?, ?)`,
        billId,
        company.id,
        supplierId,
        nextReference(company.id, 'bills', 'BILL'),
        totalKobo,
        now,
        due.toISOString(),
        now,
        now,
      )

      const posted = postJournalEntry({
        companyId: company.id,
        memo: data.memo ?? `Purchase on credit of ${data.quantity} × ${product.name}`,
        sourceType: 'inventory',
        sourceId: movementId,
        idempotencyKey: `inventory:${movementId}`,
        createdBy: req.user!.id,
        lines: [
          { code: CODES.INVENTORY, direction: 'debit', amountKobo: totalKobo, memo: product.name },
          { code: CODES.PAYABLE, direction: 'credit', amountKobo: totalKobo },
        ],
      })
      entryId = posted.entryId

      emit(
        company.id,
        'supplier.bill',
        { billId, productId: product.id, quantity: data.quantity, amountKobo: totalKobo },
        `evt:bill:${billId}`,
      )
    })

    const refreshed = one<ProductRow>('SELECT * FROM products WHERE id = ?', product.id)!
    const bill = one<BillRow>('SELECT * FROM bills WHERE id = ?', billId)!
    audit(req.user!.id, 'company.purchase', `${formatKobo(totalKobo)} stock bought on credit`)
    res.status(201).json({
      product: toProduct(refreshed, onHandFor(company.id).get(product.id) ?? 0),
      bill: toBill(bill),
      billedKobo: totalKobo,
      entryId: entryId!,
      ...companyPayload(company),
    })
  }),
)

/* ------------------------------------------------------------ customers -- */

interface CustomerRow {
  id: string
  company_id: string
  name: string
  segment: string
  phone: string
  email: string
  created_at: string
}

function toCustomer(row: CustomerRow) {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
  }
}

router.get(
  '/customers',
  route(async (req, res) => {
    const company = companyFor(req)
    const rows = many<CustomerRow>(
      'SELECT * FROM customers WHERE company_id = ? ORDER BY created_at DESC',
      company.id,
    )
    res.json({ customers: rows.map(toCustomer) })
  }),
)

const customerSchema = z.object({
  name: z.string().trim().min(2, 'Give the customer a name.').max(80),
  segment: z.enum(['individual', 'business', 'wholesale']).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().max(120).optional(),
})

router.post(
  '/customers',
  route(async (req, res) => {
    const parsed = customerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the customer.' })
      return
    }
    const company = companyFor(req)
    const id = newId()
    transaction(() => {
      run(
        `INSERT INTO customers (id, company_id, name, segment, phone, email, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        company.id,
        parsed.data.name,
        parsed.data.segment ?? 'individual',
        parsed.data.phone ?? '',
        parsed.data.email ?? '',
        new Date().toISOString(),
      )
      emit(
        company.id,
        'customer.created',
        { customerId: id, name: parsed.data.name, segment: parsed.data.segment ?? 'individual' },
        `evt:customer:${id}`,
      )
    })

    audit(req.user!.id, 'company.customer', `Customer ${parsed.data.name} added`)
    const row = one<CustomerRow>('SELECT * FROM customers WHERE id = ?', id)!
    res.status(201).json({ customer: toCustomer(row) })
  }),
)

/* --------------------------------------------------------------- orders -- */

interface OrderRow {
  id: string
  company_id: string
  customer_id: string
  reference: string
  status: string
  channel: string
  currency: string
  subtotal_kobo: number
  delivery_kobo: number
  total_kobo: number
  placed_at: string | null
  created_at: string
  updated_at: string
}

interface OrderLineRow {
  id: string
  order_id: string
  product_id: string
  description: string
  quantity: number
  unit_price_kobo: number
  unit_cost_kobo: number
  line_total_kobo: number
}

function ordersWithLines(companyId: string, orderId?: string): unknown[] {
  const params: string[] = [companyId]
  let filter = ''
  if (orderId) {
    filter = ' AND o.id = ?'
    params.push(orderId)
  }

  const orders = many<OrderRow & { customer_name: string }>(
    `SELECT o.*, c.name AS customer_name
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.company_id = ?${filter}
     ORDER BY o.created_at DESC`,
    ...params,
  )
  if (orders.length === 0) return []

  const ids = orders.map((order) => order.id)
  const lines = many<OrderLineRow>(
    `SELECT * FROM order_lines WHERE order_id IN (${ids.map(() => '?').join(', ')}) ORDER BY rowid ASC`,
    ...ids,
  )

  const invoiceRows = many<{ id: string; order_id: string | null; number: string; status: string; paid_kobo: number; amount_kobo: number }>(
    `SELECT id, order_id, number, status, paid_kobo, amount_kobo FROM invoices WHERE company_id = ? AND order_id IS NOT NULL`,
    companyId,
  )
  const invoiceByOrder = new Map(invoiceRows.map((row) => [row.order_id, row]))

  return orders.map((order) => {
    const invoice = invoiceByOrder.get(order.id)
    return {
      id: order.id,
      reference: order.reference,
      status: order.status,
      channel: order.channel,
      customerId: order.customer_id,
      customerName: order.customer_name,
      subtotalKobo: Number(order.subtotal_kobo),
      deliveryKobo: Number(order.delivery_kobo),
      totalKobo: Number(order.total_kobo),
      placedAt: order.placed_at,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      invoice: invoice
        ? {
            id: invoice.id,
            number: invoice.number,
            status: invoice.status,
            amountKobo: Number(invoice.amount_kobo),
            paidKobo: Number(invoice.paid_kobo),
          }
        : null,
      lines: lines
        .filter((line) => line.order_id === order.id)
        .map((line) => ({
          id: line.id,
          productId: line.product_id,
          description: line.description,
          quantity: Number(line.quantity),
          unitPriceKobo: Number(line.unit_price_kobo),
          unitCostKobo: Number(line.unit_cost_kobo),
          lineTotalKobo: Number(line.line_total_kobo),
        })),
    }
  })
}

function nextReference(companyId: string, table: string, prefix: string): string {
  const row = one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE company_id = ?`, companyId)
  const n = Number(row?.n ?? 0) + 1
  return `${prefix}-${String(n).padStart(4, '0')}`
}

router.get(
  '/orders',
  route(async (req, res) => {
    const company = companyFor(req)
    res.json({ orders: ordersWithLines(company.id) })
  }),
)

const orderSchema = z.object({
  customerId: z.string().trim().min(1),
  channel: z.string().trim().max(30).optional(),
  delivery: moneyField.optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        quantity: z.number().int().positive().max(1_000_000),
        unitPrice: moneyField.optional(),
      }),
    )
    .min(1, 'An order needs at least one line.'),
})

router.post(
  '/orders',
  route(async (req, res) => {
    const parsed = orderSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Check the order.' })
      return
    }
    const company = companyFor(req)
    const data = parsed.data

    const customer = one<CustomerRow>(
      'SELECT * FROM customers WHERE id = ? AND company_id = ?',
      data.customerId,
      company.id,
    )
    if (!customer) {
      res.status(404).json({ error: 'That customer is not on this company.' })
      return
    }

    // Every line is priced from the catalogue unless the order overrides it.
    const priced = data.lines.map((line) => {
      const product = one<ProductRow>(
        'SELECT * FROM products WHERE id = ? AND company_id = ?',
        line.productId,
        company.id,
      )
      if (!product) throw new FinanceError('an order line refers to a product that does not exist.')
      const unitPriceKobo = toKobo(line.unitPrice ?? fromKobo(Number(product.unit_price_kobo)))
      return {
        product,
        quantity: line.quantity,
        unitPriceKobo,
        unitCostKobo: Number(product.unit_cost_kobo),
        lineTotalKobo: unitPriceKobo * line.quantity,
      }
    })

    const subtotalKobo = priced.reduce((sum, line) => sum + line.lineTotalKobo, 0)
    const deliveryKobo = toKobo(data.delivery ?? 0)
    const totalKobo = subtotalKobo + deliveryKobo
    const now = new Date().toISOString()
    const orderId = newId()
    const reference = nextReference(company.id, 'orders', 'ORD')

    transaction(() => {
      run(
        `INSERT INTO orders
           (id, company_id, customer_id, reference, status, channel, currency,
            subtotal_kobo, delivery_kobo, total_kobo, placed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'PLACED', ?, 'NGN', ?, ?, ?, ?, ?, ?)`,
        orderId,
        company.id,
        customer.id,
        reference,
        data.channel ?? 'direct',
        subtotalKobo,
        deliveryKobo,
        totalKobo,
        now,
        now,
        now,
      )
      for (const line of priced) {
        run(
          `INSERT INTO order_lines
             (id, order_id, product_id, description, quantity, unit_price_kobo, unit_cost_kobo, line_total_kobo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          newId(),
          orderId,
          line.product.id,
          line.product.name,
          line.quantity,
          line.unitPriceKobo,
          line.unitCostKobo,
          line.lineTotalKobo,
        )
      }

      emit(
        company.id,
        'order.placed',
        { orderId, reference, customerId: customer.id, totalKobo },
        `evt:order-placed:${orderId}`,
      )
    })

    audit(req.user!.id, 'company.order', `Order ${reference} placed for ${customer.name}`)
    res.status(201).json({ order: ordersWithLines(company.id, orderId)[0], ...companyPayload(company) })
  }),
)

const deliverSchema = z.object({
  cost: moneyField.optional(),
  note: z.string().trim().max(160).optional(),
  idempotencyKey: idempotencyField,
})

router.post(
  '/orders/:id/deliver',
  route(async (req, res) => {
    const parsed = deliverSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the delivery details.' })
      return
    }
    const company = companyFor(req)
    const order = one<OrderRow>(
      'SELECT * FROM orders WHERE id = ? AND company_id = ?',
      String(req.params.id),
      company.id,
    )
    if (!order) {
      res.status(404).json({ error: 'That order does not exist.' })
      return
    }

    // Already delivered: return the order as it stands rather than shipping twice.
    const existing = one<{ id: string }>('SELECT id FROM deliveries WHERE order_id = ?', order.id)
    if (existing) {
      res.json({ order: ordersWithLines(company.id, order.id)[0], ...companyPayload(company) })
      return
    }
    if (order.status !== 'PLACED') {
      res.status(400).json({ error: `An order that is ${order.status.toLowerCase()} cannot be delivered.` })
      return
    }

    const lines = many<OrderLineRow>('SELECT * FROM order_lines WHERE order_id = ?', order.id)

    // Stock cannot go negative: shipping goods the company does not hold would
    // put a number on the books that no movement can explain.
    const onHand = onHandFor(company.id)
    for (const line of lines) {
      const available = onHand.get(line.product_id) ?? 0
      if (available < Number(line.quantity)) {
        const product = one<{ name: string }>('SELECT name FROM products WHERE id = ?', line.product_id)
        throw new FinanceError(
          `there is not enough ${product?.name ?? 'stock'} to deliver ${order.reference}: ` +
            `${Number(line.quantity)} needed but ${available} on hand. Buy more stock first.`,
        )
      }
    }

    const costOfGoodsKobo = lines.reduce(
      (sum, line) => sum + Number(line.unit_cost_kobo) * Number(line.quantity),
      0,
    )
    const deliveryCostKobo = toKobo(parsed.data.cost ?? 0)
    requireCash(company.id, deliveryCostKobo, 'this delivery')
    const now = new Date().toISOString()
    const deliveryId = newId()

    transaction(() => {
      run(
        `INSERT INTO deliveries (id, order_id, company_id, status, cost_kobo, dispatched_at, delivered_at, note, created_at)
         VALUES (?, ?, ?, 'DELIVERED', ?, ?, ?, ?, ?)`,
        deliveryId,
        order.id,
        company.id,
        deliveryCostKobo,
        now,
        now,
        parsed.data.note ?? '',
        now,
      )

      // The stock leaves the shelves. Cost of sales is recognised with it, so
      // inventory and the profit on the sale move together.
      for (const line of lines) {
        run(
          `INSERT INTO stock_movements
             (id, company_id, product_id, kind, quantity, unit_cost_kobo, source_type, source_id,
              note, occurred_at, idempotency_key, created_at)
           VALUES (?, ?, ?, 'sale', ?, ?, 'order', ?, ?, ?, ?, ?)`,
          newId(),
          company.id,
          line.product_id,
          -Number(line.quantity),
          Number(line.unit_cost_kobo),
          order.id,
          `Delivered on ${order.reference}`,
          now,
          `stock:order:${order.id}:${line.id}`,
          now,
        )
      }

      // Revenue: the customer now owes us the order total.
      postJournalEntry({
        companyId: company.id,
        memo: `Sale ${order.reference}`,
        sourceType: 'sale',
        sourceId: order.id,
        idempotencyKey: `order:${order.id}:revenue`,
        createdBy: req.user!.id,
        lines: [
          { code: CODES.RECEIVABLE, direction: 'debit', amountKobo: Number(order.total_kobo) },
          { code: CODES.SALES, direction: 'credit', amountKobo: Number(order.total_kobo) },
        ],
      })

      // Cost of sales: inventory is consumed at the price it was bought for.
      if (costOfGoodsKobo > 0) {
        postJournalEntry({
          companyId: company.id,
          memo: `Cost of sale ${order.reference}`,
          sourceType: 'sale_cost',
          sourceId: order.id,
          idempotencyKey: `order:${order.id}:cogs`,
          createdBy: req.user!.id,
          lines: [
            { code: CODES.COGS, direction: 'debit', amountKobo: costOfGoodsKobo },
            { code: CODES.INVENTORY, direction: 'credit', amountKobo: costOfGoodsKobo },
          ],
        })
      }

      // Delivery is a real cost paid at the time.
      if (deliveryCostKobo > 0) {
        postJournalEntry({
          companyId: company.id,
          memo: `Delivery cost ${order.reference}`,
          sourceType: 'delivery',
          sourceId: deliveryId,
          idempotencyKey: `delivery:${deliveryId}:cost`,
          createdBy: req.user!.id,
          lines: [
            { code: CODES.LOGISTICS, direction: 'debit', amountKobo: deliveryCostKobo },
            { code: CODES.CASH, direction: 'credit', amountKobo: deliveryCostKobo },
          ],
        })
      }

      run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', 'DELIVERED', now, order.id)

      emit(
        company.id,
        'order.delivered',
        { orderId: order.id, reference: order.reference, deliveryId, costOfGoodsKobo, deliveryCostKobo },
        `evt:order-delivered:${order.id}`,
      )
    })

    audit(req.user!.id, 'company.order.deliver', `Order ${order.reference} delivered`)
    res.json({ order: ordersWithLines(company.id, order.id)[0], ...companyPayload(company) })
  }),
)

/* ------------------------------------------------------------- invoices -- */

const invoiceSchema = z.object({
  dueDays: z.number().int().min(0).max(365).optional(),
  idempotencyKey: idempotencyField,
})

router.post(
  '/orders/:id/invoice',
  route(async (req, res) => {
    const parsed = invoiceSchema.safeParse(req.body ?? {})
    if (!parsed.success) {
      res.status(400).json({ error: 'Check the invoice details.' })
      return
    }
    const company = companyFor(req)
    const order = one<OrderRow>(
      'SELECT * FROM orders WHERE id = ? AND company_id = ?',
      String(req.params.id),
      company.id,
    )
    if (!order) {
      res.status(404).json({ error: 'That order does not exist.' })
      return
    }

    const existing = one<{ id: string }>('SELECT id FROM invoices WHERE order_id = ?', order.id)
    if (existing) {
      res.json({ order: ordersWithLines(company.id, order.id)[0], ...companyPayload(company) })
      return
    }
    if (order.status !== 'DELIVERED') {
      res.status(400).json({ error: 'Deliver the order before invoicing it.' })
      return
    }

    const dueDays = parsed.data.dueDays ?? 14
    const now = new Date()
    const due = new Date(now.getTime() + dueDays * 24 * 60 * 60 * 1000)
    const invoiceId = newId()
    const number = nextReference(company.id, 'invoices', 'INV')

    transaction(() => {
      run(
        `INSERT INTO invoices
           (id, company_id, order_id, customer_id, number, status, amount_kobo, paid_kobo, issued_at, due_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'OPEN', ?, 0, ?, ?, ?, ?)`,
        invoiceId,
        company.id,
        order.id,
        order.customer_id,
        number,
        Number(order.total_kobo),
        now.toISOString(),
        due.toISOString(),
        now.toISOString(),
        now.toISOString(),
      )
      run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', 'INVOICED', now.toISOString(), order.id)

      emit(
        company.id,
        'invoice.issued',
        { invoiceId, orderId: order.id, number, amountKobo: Number(order.total_kobo), dueAt: due.toISOString() },
        `evt:invoice:${invoiceId}`,
      )
    })

    audit(req.user!.id, 'company.invoice', `Invoice ${number} issued for ${order.reference}`)
    res.status(201).json({ order: ordersWithLines(company.id, order.id)[0], ...companyPayload(company) })
  }),
)

interface InvoiceRow {
  id: string
  company_id: string
  order_id: string | null
  customer_id: string
  number: string
  status: string
  amount_kobo: number
  paid_kobo: number
  issued_at: string
  due_at: string
  created_at: string
  updated_at: string
}

function toInvoice(row: InvoiceRow & { customer_name?: string }) {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    orderId: row.order_id,
    customerId: row.customer_id,
    customerName: row.customer_name ?? null,
    amountKobo: Number(row.amount_kobo),
    paidKobo: Number(row.paid_kobo),
    outstandingKobo: Number(row.amount_kobo) - Number(row.paid_kobo),
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    createdAt: row.created_at,
  }
}

router.get(
  '/invoices',
  route(async (req, res) => {
    const company = companyFor(req)
    const rows = many<InvoiceRow & { customer_name: string }>(
      `SELECT i.*, c.name AS customer_name
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.company_id = ? ORDER BY i.created_at DESC`,
      company.id,
    )
    res.json({ invoices: rows.map(toInvoice) })
  }),
)

/* ------------------------------------------------------------- payments -- */

const paymentSchema = z.object({
  amount: moneyField,
  method: z.enum(['TRANSFER', 'CASH', 'CARD', 'USSD']).optional(),
  idempotencyKey: idempotencyField,
})

router.post(
  '/invoices/:id/payments',
  route(async (req, res) => {
    const parsed = paymentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter the amount received.' })
      return
    }
    const company = companyFor(req)
    const invoice = one<InvoiceRow>(
      'SELECT * FROM invoices WHERE id = ? AND company_id = ?',
      String(req.params.id),
      company.id,
    )
    if (!invoice) {
      res.status(404).json({ error: 'That invoice does not exist.' })
      return
    }

    const amountKobo = toKobo(parsed.data.amount)
    const now = new Date().toISOString()
    const idempotencyKey = key(`payment:${company.id}`, parsed.data.idempotencyKey, {
      invoiceId: invoice.id,
      amountKobo,
    })

    // A retry of a request that already landed replays the state it produced,
    // rather than being rejected by the outstanding check below.
    if (one<{ id: string }>('SELECT id FROM payments WHERE idempotency_key = ?', idempotencyKey)) {
      const current = one<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', invoice.id)!
      res.json({ invoice: toInvoice(current), ...companyPayload(company) })
      return
    }

    const outstandingKobo = Number(invoice.amount_kobo) - Number(invoice.paid_kobo)
    if (amountKobo <= 0) {
      res.status(400).json({ error: 'The amount must be more than zero.' })
      return
    }
    if (amountKobo > outstandingKobo) {
      res.status(400).json({ error: `That is more than the ${formatKobo(outstandingKobo)} outstanding.` })
      return
    }

    const paymentId = newId()

    transaction(() => {
      run(
        `INSERT INTO payments
           (id, company_id, invoice_id, customer_id, amount_kobo, method, received_at, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        paymentId,
        company.id,
        invoice.id,
        invoice.customer_id,
        amountKobo,
        parsed.data.method ?? 'TRANSFER',
        now,
        idempotencyKey,
        now,
      )

      const paidKobo = Number(invoice.paid_kobo) + amountKobo
      const status = paidKobo >= Number(invoice.amount_kobo) ? 'PAID' : 'PARTIAL'
      run('UPDATE invoices SET paid_kobo = ?, status = ?, updated_at = ? WHERE id = ?', paidKobo, status, now, invoice.id)

      // Cash arrives and the customer's debt falls by the same amount.
      postJournalEntry({
        companyId: company.id,
        memo: `Payment for ${invoice.number}`,
        sourceType: 'payment',
        sourceId: paymentId,
        idempotencyKey: `payment:${paymentId}:ledger`,
        createdBy: req.user!.id,
        lines: [
          { code: CODES.CASH, direction: 'debit', amountKobo },
          { code: CODES.RECEIVABLE, direction: 'credit', amountKobo },
        ],
      })

      if (status === 'PAID' && invoice.order_id) {
        run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', 'PAID', now, invoice.order_id)
      }

      emit(
        company.id,
        'payment.received',
        { paymentId, invoiceId: invoice.id, amountKobo, invoiceStatus: status },
        `evt:payment:${paymentId}`,
      )
    })

    const updated = one<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', invoice.id)!
    audit(req.user!.id, 'company.payment', `${formatKobo(amountKobo)} received for ${invoice.number}`)
    res.status(201).json({ paymentId, invoice: toInvoice(updated), ...companyPayload(company) })
  }),
)

router.get(
  '/payments',
  route(async (req, res) => {
    const company = companyFor(req)
    const rows = many<{
      id: string
      invoice_id: string
      amount_kobo: number
      method: string
      received_at: string
      invoice_number: string
      customer_name: string
    }>(
      `SELECT p.id, p.invoice_id, p.amount_kobo, p.method, p.received_at,
              i.number AS invoice_number, c.name AS customer_name
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN customers c ON c.id = p.customer_id
       WHERE p.company_id = ? ORDER BY p.received_at DESC`,
      company.id,
    )
    res.json({
      payments: rows.map((row) => ({
        id: row.id,
        invoiceId: row.invoice_id,
        invoiceNumber: row.invoice_number,
        customerName: row.customer_name,
        amountKobo: Number(row.amount_kobo),
        method: row.method,
        receivedAt: row.received_at,
      })),
    })
  }),
)

/* ------------------------------------------------------------- payables -- */

/**
 * What the company owes its suppliers.
 *
 * A bill is opened when stock is bought on credit. Paying it is what moves
 * cash, and it is the only thing that does — which is why a business can be
 * profitable on paper and still run out of money.
 */
interface BillRow {
  id: string
  company_id: string
  supplier_id: string | null
  reference: string
  status: string
  amount_kobo: number
  paid_kobo: number
  issued_at: string
  due_at: string
  created_at: string
  updated_at: string
}

function toBill(row: BillRow & { supplier_name?: string | null }) {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name ?? null,
    amountKobo: Number(row.amount_kobo),
    paidKobo: Number(row.paid_kobo),
    outstandingKobo: Number(row.amount_kobo) - Number(row.paid_kobo),
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    createdAt: row.created_at,
  }
}

router.get(
  '/bills',
  route(async (req, res) => {
    const company = companyFor(req)
    const rows = many<BillRow & { supplier_name: string | null }>(
      `SELECT b.*, s.name AS supplier_name
       FROM bills b LEFT JOIN suppliers s ON s.id = b.supplier_id
       WHERE b.company_id = ? ORDER BY b.created_at DESC`,
      company.id,
    )
    const bills = rows.map(toBill)
    res.json({
      bills,
      totalOutstandingKobo: bills.reduce((sum, bill) => sum + bill.outstandingKobo, 0),
    })
  }),
)

const billPaymentSchema = z.object({
  amount: moneyField,
  method: z.enum(['TRANSFER', 'CASH', 'CARD', 'USSD']).optional(),
  idempotencyKey: idempotencyField,
})

router.post(
  '/bills/:id/payments',
  route(async (req, res) => {
    const parsed = billPaymentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Enter the amount you are paying the supplier.' })
      return
    }
    const company = companyFor(req)
    const bill = one<BillRow>(
      'SELECT * FROM bills WHERE id = ? AND company_id = ?',
      String(req.params.id),
      company.id,
    )
    if (!bill) {
      res.status(404).json({ error: 'That bill does not exist.' })
      return
    }

    const amountKobo = toKobo(parsed.data.amount)
    const now = new Date().toISOString()
    const idempotencyKey = key(`bill-payment:${company.id}`, parsed.data.idempotencyKey, {
      billId: bill.id,
      amountKobo,
    })

    // A retry of a request that already landed replays the state it produced.
    if (one<{ id: string }>('SELECT id FROM bill_payments WHERE idempotency_key = ?', idempotencyKey)) {
      const current = one<BillRow>('SELECT * FROM bills WHERE id = ?', bill.id)!
      res.json({ bill: toBill(current), ...companyPayload(company) })
      return
    }

    const outstandingKobo = Number(bill.amount_kobo) - Number(bill.paid_kobo)
    if (amountKobo <= 0) {
      res.status(400).json({ error: 'The amount must be more than zero.' })
      return
    }
    if (amountKobo > outstandingKobo) {
      res.status(400).json({ error: `That is more than the ${formatKobo(outstandingKobo)} outstanding on ${bill.reference}.` })
      return
    }
    requireCash(company.id, amountKobo, `paying ${bill.reference}`)

    const paymentId = newId()
    let entryId: string
    transaction(() => {
      run(
        `INSERT INTO bill_payments
           (id, company_id, bill_id, amount_kobo, method, paid_at, idempotency_key, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        paymentId,
        company.id,
        bill.id,
        amountKobo,
        parsed.data.method ?? 'TRANSFER',
        now,
        idempotencyKey,
        now,
      )

      const paidKobo = Number(bill.paid_kobo) + amountKobo
      const status = paidKobo >= Number(bill.amount_kobo) ? 'PAID' : 'PARTIAL'
      run('UPDATE bills SET paid_kobo = ?, status = ?, updated_at = ? WHERE id = ?', paidKobo, status, now, bill.id)

      // Cash leaves and the liability falls by the same amount.
      const posted = postJournalEntry({
        companyId: company.id,
        memo: `Payment to supplier for ${bill.reference}`,
        sourceType: 'bill_payment',
        sourceId: paymentId,
        idempotencyKey: `bill-payment:${paymentId}:ledger`,
        createdBy: req.user!.id,
        lines: [
          { code: CODES.PAYABLE, direction: 'debit', amountKobo },
          { code: CODES.CASH, direction: 'credit', amountKobo },
        ],
      })
      entryId = posted.entryId

      emit(
        company.id,
        'supplier.payment',
        { billId: bill.id, paymentId, amountKobo },
        `evt:bill-payment:${paymentId}`,
      )
    })

    const updated = one<BillRow>('SELECT * FROM bills WHERE id = ?', bill.id)!
    audit(req.user!.id, 'company.bill.payment', `${formatKobo(amountKobo)} paid on ${bill.reference}`)
    res.status(201).json({ bill: toBill(updated), entryId: entryId!, ...companyPayload(company) })
  }),
)

export default router
