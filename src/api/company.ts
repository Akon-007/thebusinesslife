import { api } from './client'

/**
 * Typed access to the player's company API.
 *
 * The company's books are the authority on money: every figure here is derived
 * on the server from the ledger, and every mutation returns the company with
 * its freshly derived cash so the client never has to guess the new balance.
 */

export interface CompanySummary {
  company: {
    id: string
    name: string
    sector: string
    businessModel: string
    legalStructure: string
    registrationStatus: string
    complianceStatus: string
    bankAccountStatus: string
    createdAt: string
  }
  cashKobo: number
  cash: number
  counts: { products: number; customers: number; orders: number; invoices: number }
}

export interface AccountBalance {
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  isCash: boolean
  debitKobo: number
  creditKobo: number
  balanceKobo: number
}

export interface LedgerLine {
  id: string
  code: string
  name: string
  direction: 'debit' | 'credit'
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

interface LineAmount {
  code: string
  name: string
  amountKobo: number
}

export interface Reports {
  cashKobo: number
  trialBalance: {
    rows: { code: string; name: string; type: AccountBalance['type']; debitKobo: number; creditKobo: number }[]
    totalDebitKobo: number
    totalCreditKobo: number
    balanced: boolean
  }
  profitAndLoss: {
    revenue: LineAmount[]
    totalRevenueKobo: number
    costOfSalesKobo: number
    grossProfitKobo: number
    expenses: LineAmount[]
    totalExpensesKobo: number
    netProfitKobo: number
  }
  balanceSheet: {
    assets: LineAmount[]
    totalAssetsKobo: number
    liabilities: LineAmount[]
    totalLiabilitiesKobo: number
    equity: LineAmount[]
    retainedEarningsKobo: number
    totalEquityKobo: number
    balanced: boolean
  }
  cashFlow: {
    openingKobo: number
    inflows: { source: string; amountKobo: number }[]
    outflows: { source: string; amountKobo: number }[]
    totalInflowsKobo: number
    totalOutflowsKobo: number
    netChangeKobo: number
    closingKobo: number
  }
}

export interface Product {
  id: string
  name: string
  sku: string
  description: string
  unitCostKobo: number
  unitPriceKobo: number
  unitCost: number
  unitPrice: number
  active: boolean
  onHand: number
  stockValueKobo: number
}

export interface Customer {
  id: string
  name: string
  segment: string
  phone: string
  email: string
  createdAt: string
}

export interface OrderLine {
  id: string
  productId: string
  description: string
  quantity: number
  unitPriceKobo: number
  unitCostKobo: number
  lineTotalKobo: number
}

export interface Order {
  id: string
  reference: string
  status: 'PLACED' | 'DELIVERED' | 'INVOICED' | 'PAID' | string
  channel: string
  customerId: string
  customerName: string
  subtotalKobo: number
  deliveryKobo: number
  totalKobo: number
  placedAt: string | null
  createdAt: string
  invoice: { id: string; number: string; status: string; amountKobo: number; paidKobo: number } | null
  lines: OrderLine[]
}

export interface Invoice {
  id: string
  number: string
  status: 'OPEN' | 'PARTIAL' | 'PAID' | string
  orderId: string | null
  customerId: string
  customerName: string | null
  amountKobo: number
  paidKobo: number
  outstandingKobo: number
  issuedAt: string
  dueAt: string
  createdAt: string
}

export interface Payment {
  id: string
  invoiceId: string
  invoiceNumber: string
  customerName: string
  amountKobo: number
  method: string
  receivedAt: string
}

export interface FundingAgreement {
  id: string
  kind: string
  counterparty: string
  principalKobo: number
  equityBasis: number
  terms: string
  status: string
  agreedAt: string
}

export interface Bill {
  id: string
  reference: string
  status: 'OPEN' | 'PARTIAL' | 'PAID' | string
  supplierId: string | null
  supplierName: string | null
  amountKobo: number
  paidKobo: number
  outstandingKobo: number
  issuedAt: string
  dueAt: string
  createdAt: string
}

/**
 * A stable key for one user action.
 *
 * The key is generated once, when the action is submitted, and reused if the
 * request has to be retried — that is what lets the server collapse a retry
 * onto the transaction that already landed instead of posting it twice.
 */
function actionKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return `${prefix}-${Date.now()}-${random}`
}

/** Kobo -> a plain naira string, e.g. `12,500.00`. */
export function naira(kobo: number): string {
  const negative = kobo < 0
  const absolute = Math.abs(Math.round(kobo))
  return `${negative ? '-' : ''}${Math.floor(absolute / 100).toLocaleString('en-NG')}.${String(
    absolute % 100,
  ).padStart(2, '0')}`
}

export const company = {
  provision: () => api<CompanySummary & { ok: true }>('/player/company/provision', { method: 'POST' }),
  register: () =>
    api<CompanySummary & { entryId: string; registered: true }>('/player/company/register', {
      method: 'POST',
      body: { idempotencyKey: actionKey('registration') },
    }),
  completeRegistration: () =>
    api<CompanySummary & { completed: true }>('/player/company/complete-registration', {
      method: 'POST',
      body: { idempotencyKey: actionKey('registration-completion') },
    }),
  leasePremises: () =>
    api<CompanySummary & { leased: true; entryId: string }>('/player/company/lease-premises', {
      method: 'POST',
      body: { idempotencyKey: actionKey('premises') },
    }),
  openBusiness: () =>
    api<CompanySummary & { opened: true }>('/player/company/open-business', {
      method: 'POST',
      body: { idempotencyKey: actionKey('open-business') },
    }),
  openBankAccount: () =>
    api<CompanySummary & { opened: true }>('/player/company/open-bank-account', {
      method: 'POST',
      body: { idempotencyKey: actionKey('open-bank-account') },
    }),
  summary: () => api<CompanySummary>('/player/company'),
  accounts: () => api<{ accounts: AccountBalance[] }>('/player/company/accounts'),
  ledger: (limit = 40) => api<{ entries: LedgerEntry[] }>(`/player/company/ledger?limit=${limit}`),
  reports: () => api<{ reports: Reports }>('/player/company/reports'),

  fundingAgreements: () =>
    api<{ agreements: FundingAgreement[] }>('/player/company/funding'),
  /**
   * Money the owner puts into the business.
   *
   * It is recorded as a funding agreement and posted to the ledger against it —
   * the company's cash only ever appears through a recorded transaction.
   */
  addContribution: (amount: number, memo?: string) =>
    api<CompanySummary & { agreement: FundingAgreement; entryId: string }>(
      '/player/company/funding/contributions',
      {
        method: 'POST',
        body: { amount, memo, idempotencyKey: actionKey('contribution') },
      },
    ),
  expense: (amount: number, memo?: string) =>
    api<CompanySummary & { entryId: string }>('/player/company/expenses', {
      method: 'POST',
      body: { amount, memo, idempotencyKey: actionKey('expense') },
    }),

  products: () => api<{ products: Product[] }>('/player/company/products'),
  createProduct: (input: { name: string; unitCost?: number; unitPrice?: number; description?: string }) =>
    api<{ product: Product }>('/player/company/products', { method: 'POST', body: input }),
  inventory: () =>
    api<{ items: Product[]; totalUnits: number; totalValueKobo: number }>('/player/company/inventory'),
  /** Buying stock on credit opens a supplier bill; no cash moves until it is paid. */
  purchaseStock: (input: { productId: string; quantity: number; unitCost?: number; supplierName?: string }) =>
    api<CompanySummary & { product: Product; bill: Bill; billedKobo: number; entryId: string }>(
      '/player/company/inventory/purchase',
      { method: 'POST', body: { ...input, idempotencyKey: actionKey('purchase') } },
    ),

  customers: () => api<{ customers: Customer[] }>('/player/company/customers'),
  createCustomer: (input: { name: string; segment?: string; phone?: string; email?: string }) =>
    api<{ customer: Customer }>('/player/company/customers', { method: 'POST', body: input }),

  orders: () => api<{ orders: Order[] }>('/player/company/orders'),
  createOrder: (input: {
    customerId: string
    lines: { productId: string; quantity: number; unitPrice?: number }[]
    delivery?: number
  }) => api<CompanySummary & { order: Order }>('/player/company/orders', { method: 'POST', body: input }),
  deliverOrder: (orderId: string, cost = 0) =>
    api<CompanySummary & { order: Order }>(`/player/company/orders/${orderId}/deliver`, {
      method: 'POST',
      body: { cost },
    }),
  invoiceOrder: (orderId: string, dueDays = 14) =>
    api<CompanySummary & { order: Order }>(`/player/company/orders/${orderId}/invoice`, {
      method: 'POST',
      body: { dueDays },
    }),

  invoices: () => api<{ invoices: Invoice[] }>('/player/company/invoices'),
  payments: () => api<{ payments: Payment[] }>('/player/company/payments'),
  recordPayment: (invoiceId: string, amount: number, method = 'TRANSFER') =>
    api<CompanySummary & { paymentId: string; invoice: Invoice }>(
      `/player/company/invoices/${invoiceId}/payments`,
      { method: 'POST', body: { amount, method, idempotencyKey: actionKey('payment') } },
    ),

  bills: () => api<{ bills: Bill[]; totalOutstandingKobo: number }>('/player/company/bills'),
  payBill: (billId: string, amount: number, method = 'TRANSFER') =>
    api<CompanySummary & { bill: Bill; entryId: string }>(
      `/player/company/bills/${billId}/payments`,
      { method: 'POST', body: { amount, method, idempotencyKey: actionKey('bill-payment') } },
    ),
}
