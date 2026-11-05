import { create } from 'zustand'
import { ApiError } from '../api/client'
import {
  company as companyApi,
  type AccountBalance,
  type CompanySummary,
  type Customer,
  type Invoice,
  type LedgerEntry,
  type Order,
  type Payment,
  type Product,
  type Reports,
} from '../api/company'
import { useGameStore } from './gameStore'

/**
 * The company's money, as the server sees it.
 *
 * The ledger is authoritative: this store holds a *copy* of the derived cash
 * balance and the statements built from it. The copy is only ever refreshed
 * from the server — every company mutation returns the fresh balance, and the
 * client never writes a balance back. So the figure on the HUD is always one
 * the books explain.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface FinanceState {
  status: Status
  error: string | null
  summary: CompanySummary | null
  accounts: AccountBalance[]
  ledger: LedgerEntry[]
  reports: Reports | null
  products: Product[]
  customers: Customer[]
  orders: Order[]
  invoices: Invoice[]
  payments: Payment[]

  /** Provisions the company if needed, then loads everything. */
  load: () => Promise<void>
  /** Re-reads cash, accounts, ledger and reports. */
  refreshFinance: () => Promise<void>
  /** Re-reads products, customers, orders, invoices and payments. */
  refreshStore: () => Promise<void>
  /** Adopts the summary a mutation returned, and syncs the wallet from it. */
  mergeSummary: (summary: CompanySummary) => void
  /** Re-reads just the cash balance — used when a mirror POST fails. */
  refreshSummary: () => Promise<void>
  clear: () => void
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

const EMPTY = {
  status: 'idle' as Status,
  error: null,
  summary: null,
  accounts: [] as AccountBalance[],
  ledger: [] as LedgerEntry[],
  reports: null,
  products: [] as Product[],
  customers: [] as Customer[],
  orders: [] as Order[],
  invoices: [] as Invoice[],
  payments: [] as Payment[],
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  ...EMPTY,

  async load() {
    set({ status: 'loading', error: null })
    try {
      const summary = await companyApi.provision()
      setServerCash(summary.cash)
      set({ summary })
      await Promise.all([get().refreshFinance(), get().refreshStore()])
      set({ status: 'ready', error: null })
    } catch (error) {
      // Offline or not signed in: the player keeps playing on the wallet they
      // already have rather than being blocked by the books.
      set({ status: 'error', error: toMessage(error) })
    }
  },

  async refreshFinance() {
    try {
      const [summary, accounts, ledger, reports] = await Promise.all([
        companyApi.summary(),
        companyApi.accounts(),
        companyApi.ledger(60),
        companyApi.reports(),
      ])
      setServerCash(summary.cash)
      set({
        summary,
        accounts: accounts.accounts,
        ledger: ledger.entries,
        reports: reports.reports,
      })
    } catch (error) {
      set({ error: toMessage(error) })
    }
  },

  async refreshStore() {
    try {
      const [products, customers, orders, invoices, payments] = await Promise.all([
        companyApi.products(),
        companyApi.customers(),
        companyApi.orders(),
        companyApi.invoices(),
        companyApi.payments(),
      ])
      set({
        products: products.products,
        customers: customers.customers,
        orders: orders.orders,
        invoices: invoices.invoices,
        payments: payments.payments,
      })
    } catch (error) {
      set({ error: toMessage(error) })
    }
  },

  mergeSummary(summary) {
    setServerCash(summary.cash)
    set({ summary })
  },

  async refreshSummary() {
    try {
      const summary = await companyApi.summary()
      setServerCash(summary.cash)
      set({ summary })
    } catch {
      /* nothing more we can do while the server is unreachable */
    }
  },

  clear() {
    set({ ...EMPTY })
  },
}))

/* ------------------------------------------------ server-authoritative cash */

/**
 * Writes a balance the server derived into the wallet.
 *
 * This is the only way the client's cash changes. The client never mirrors a
 * figure back to the server: money moves through a real server action (a
 * payment, a bill, a contribution), and the resulting balance is read back from
 * the ledger.
 */
function setServerCash(cash: number): void {
  useGameStore.getState().setCash(cash)
}
