import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createBusinessProfile, createTestUser, one } from './harness'

/**
 * The money rules, exercised through the real API.
 *
 * These are the guarantees Phase 1 has to hold: a company starts with nothing,
 * money only ever arrives through a recorded transaction, and a retried action
 * is posted once rather than twice.
 */

const { startServer } = await import('../app')
const { signToken } = await import('../security')

let handle: Awaited<ReturnType<typeof startServer>>
let token: string
let userId: string

before(async () => {
  userId = createTestUser({ role: 'PLAYER' })
  createBusinessProfile(userId)
  token = signToken(userId, 'PLAYER')
  handle = await startServer(0)
})

after(async () => {
  await handle.close()
})

interface Reply<T = Record<string, unknown>> {
  status: number
  body: T
}

async function call<T = Record<string, unknown>>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Reply<T>> {
  const response = await fetch(`${handle.url}/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = (await response.json().catch(() => null)) as T
  return { status: response.status, body }
}

test('a brand new company holds ₦0', async () => {
  const reply = await call<{ cash: number; cashKobo: number; company: { id: string } }>(
    '/player/company/provision',
    { method: 'POST' },
  )
  assert.equal(reply.status, 200)
  assert.equal(reply.body.cashKobo, 0, 'a new company must not be given money')
  assert.equal(reply.body.cash, 0)
})

test('cash only appears through a recorded funding transaction', async () => {
  const before = await call<{ cash: number }>('/player/company')
  assert.equal(before.body.cash, 0)

  const contribution = await call<{ cash: number; agreement: { kind: string } }>(
    '/player/company/funding/contributions',
    { method: 'POST', body: { amount: 250000, counterparty: 'Founder', idempotencyKey: 'contrib-seed-1' } },
  )
  assert.equal(contribution.status, 201)
  assert.equal(contribution.body.agreement.kind, 'FOUNDER_CONTRIBUTION')
  assert.equal(contribution.body.cash, 250000, 'the contribution must land in the ledger')

  // The same contribution submitted twice must not double the balance.
  const retry = await call<{ cash: number }>('/player/company/funding/contributions', {
    method: 'POST',
    body: { amount: 250000, counterparty: 'Founder', idempotencyKey: 'contrib-seed-1' },
  })
  assert.equal(retry.body.cash, 250000)
})

test('a supplier purchase creates a payable and leaves cash untouched', async () => {
  const product = await call<{ product: { id: string } }>('/player/company/products', {
    method: 'POST',
    body: { name: 'Bottled Water', unitCost: 100, unitPrice: 150 },
  })
  assert.equal(product.status, 201)

  const cashBefore = (await call<{ cash: number }>('/player/company')).body.cash

  const purchase = await call<{ bill: { id: string; status: string; amountKobo: number }; billedKobo: number }>(
    '/player/company/inventory/purchase',
    {
      method: 'POST',
      body: {
        productId: product.body.product.id,
        quantity: 10,
        unitCost: 100,
        supplierName: 'Apapa Supplies',
        idempotencyKey: 'purchase-1',
      },
    },
  )

  assert.equal(purchase.status, 201)
  assert.equal(purchase.body.billedKobo, 100000, '10 × ₦100 is ₦1,000 (100,000 kobo)')
  assert.equal(purchase.body.bill.status, 'OPEN')

  const cashAfter = (await call<{ cash: number }>('/player/company')).body.cash
  assert.equal(cashAfter, cashBefore, 'buying on credit must not move cash')
})

test('a retried bill payment is posted exactly once', async () => {
  const bills = await call<{ bills: { id: string; amountKobo: number }[] }>('/player/company/bills')
  const bill = bills.body.bills[0]
  assert.ok(bill, 'the purchase should have created a bill')

  const cashBefore = (await call<{ cash: number }>('/player/company')).body.cash

  const first = await call('/player/company/bills/' + bill.id + '/payments', {
    method: 'POST',
    body: { amount: 1000, method: 'TRANSFER', idempotencyKey: 'bill-pay-1' },
  })
  assert.equal(first.status, 201)

  const cashAfterFirst = (await call<{ cash: number }>('/player/company')).body.cash
  assert.equal(cashAfterFirst, cashBefore - 1000, 'cash falls when the bill is paid')

  // A retry of exactly the same payment must replay, not pay again.
  const retry = await call('/player/company/bills/' + bill.id + '/payments', {
    method: 'POST',
    body: { amount: 1000, method: 'TRANSFER', idempotencyKey: 'bill-pay-1' },
  })
  assert.equal(retry.status, 200)

  const cashAfterRetry = (await call<{ cash: number }>('/player/company')).body.cash
  assert.equal(cashAfterRetry, cashAfterFirst, 'a retried payment must not debit twice')

  const payments = one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM bill_payments WHERE bill_id = ?',
    bill.id,
  )
  assert.equal(payments?.n, 1, 'exactly one payment row exists')

  const entries = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM journal_entries WHERE source_type = 'bill_payment'",
  )
  assert.equal(entries?.n, 1, 'exactly one ledger entry was posted')
})
