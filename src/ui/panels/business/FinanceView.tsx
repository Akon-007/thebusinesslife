import { useState } from 'react'
import { company as companyApi, naira } from '../../../api/company'
import { useFinanceStore } from '../../../state/financeStore'
import { useWorldStore } from '../../../state/worldStore'

/**
 * The company's books, read from the server.
 *
 * Nothing here is computed in the browser: the balances, the four statements
 * and the journal all come from the ledger the server keeps, so what the player
 * sees is the same picture an accountant would.
 */
export function FinanceView() {
  const status = useFinanceStore((s) => s.status)
  const error = useFinanceStore((s) => s.error)
  const summary = useFinanceStore((s) => s.summary)
  const reports = useFinanceStore((s) => s.reports)
  const accounts = useFinanceStore((s) => s.accounts)
  const ledger = useFinanceStore((s) => s.ledger)
  const mergeSummary = useFinanceStore((s) => s.mergeSummary)
  const refreshFinance = useFinanceStore((s) => s.refreshFinance)
  const pushToast = useWorldStore((s) => s.pushToast)

  const [busy, setBusy] = useState(false)
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')

  if (status === 'loading') return <div className="empty-state">Opening the books…</div>
  if (status === 'error' || !summary || !reports) {
    return <div className="empty-state">{error ?? 'The books are not available yet.'}</div>
  }

  const { profitAndLoss: pl, balanceSheet: bs, cashFlow: cf, trialBalance: tb } = reports

  async function record(kind: 'funding' | 'expense') {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      pushToast('Enter an amount first', 'warning')
      return
    }
    setBusy(true)
    try {
      const result =
        kind === 'funding'
          ? await companyApi.addContribution(value, memo || undefined)
          : await companyApi.expense(value, memo || undefined)
      mergeSummary(result)
      await refreshFinance()
      pushToast(
        kind === 'funding'
          ? `₦${value.toLocaleString()} put into the business`
          : `₦${value.toLocaleString()} expense recorded`,
        'success',
      )
      setAmount('')
      setMemo('')
    } catch (caught) {
      pushToast(caught instanceof Error ? caught.message : 'Could not record that', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="chip-row">
        <span className="chip">Cash ₦{naira(summary.cashKobo)}</span>
        <span className="chip">Revenue ₦{naira(pl.totalRevenueKobo)}</span>
        <span className="chip">Net profit ₦{naira(pl.netProfitKobo)}</span>
        <span className="chip">{tb.balanced && bs.balanced ? 'Books balanced' : 'Books out of balance'}</span>
      </div>

      <div className="fin-form">
        <div className="field">
          <label htmlFor="fin-amount">Amount (₦)</label>
          <input
            id="fin-amount"
            type="number"
            min="0"
            value={amount}
            placeholder="5000"
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="fin-memo">Note</label>
          <input
            id="fin-memo"
            value={memo}
            placeholder="What is it for?"
            onChange={(event) => setMemo(event.target.value)}
          />
        </div>
        <div className="fin-form__actions">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => record('funding')}>
            Put money in
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => record('expense')}>
            Record expense
          </button>
        </div>
      </div>

      <div className="section-title">Profit &amp; loss</div>
      <MoneyRows rows={pl.revenue} empty="No sales yet." />
      {pl.revenue.length > 0 && <MoneyRow label="Total revenue" amountKobo={pl.totalRevenueKobo} />}
      {pl.costOfSalesKobo !== 0 && (
        <>
          <MoneyRow label="Cost of goods sold" amountKobo={-pl.costOfSalesKobo} />
          <MoneyRow label="Gross profit" amountKobo={pl.grossProfitKobo} total />
        </>
      )}
      <MoneyRows rows={pl.expenses} empty="" />
      {pl.totalExpensesKobo !== 0 && <MoneyRow label="Total expenses" amountKobo={-pl.totalExpensesKobo} />}
      <MoneyRow label="Net profit" amountKobo={pl.netProfitKobo} total />

      <div className="section-title">Balance sheet</div>
      <MoneyRows rows={bs.assets} empty="No assets yet." />
      <MoneyRow label="Total assets" amountKobo={bs.totalAssetsKobo} total />
      {bs.liabilities.length > 0 && <MoneyRows rows={bs.liabilities} empty="" />}
      <MoneyRows rows={bs.equity} empty="" />
      {bs.retainedEarningsKobo !== 0 && (
        <MoneyRow label="Retained earnings" amountKobo={bs.retainedEarningsKobo} />
      )}
      <MoneyRow label="Total equity" amountKobo={bs.totalEquityKobo} total />

      <div className="section-title">Cash flow</div>
      <MoneyRow label="Opening balance" amountKobo={cf.openingKobo} />
      {cf.inflows.map((row) => (
        <MoneyRow key={`in-${row.source}`} label={`In · ${row.source}`} amountKobo={row.amountKobo} />
      ))}
      {cf.outflows.map((row) => (
        <MoneyRow key={`out-${row.source}`} label={`Out · ${row.source}`} amountKobo={-row.amountKobo} />
      ))}
      <MoneyRow label="Closing balance" amountKobo={cf.closingKobo} total />

      <div className="section-title">Chart of accounts</div>
      {accounts.map((account) => (
        <div className="fin-row" key={account.code}>
          <span className="fin-row__label">
            <span className="fin-code">{account.code}</span> {account.name}
          </span>
          <span className={`fin-amount ${account.balanceKobo < 0 ? 'fin-amount--neg' : ''}`}>
            {naira(account.balanceKobo)}
          </span>
        </div>
      ))}

      <div className="section-title">Journal</div>
      {ledger.length === 0 && <div className="empty-state">No entries yet.</div>}
      {ledger.map((entry) => (
        <div className="fin-entry" key={entry.id}>
          <div className="fin-entry__head">
            <span className="fin-entry__memo">{entry.memo}</span>
            <span className="fin-entry__source">{entry.sourceType}</span>
          </div>
          {entry.lines.map((line) => (
            <div className="fin-row" key={line.id}>
              <span className="fin-row__label">
                <span className="fin-code">{line.code}</span> {line.name}
              </span>
              <span className={`fin-amount ${line.direction === 'credit' ? 'fin-amount--credit' : ''}`}>
                {line.direction === 'credit' ? 'cr ' : 'dr '}
                {naira(line.amountKobo)}
              </span>
            </div>
          ))}
        </div>
      ))}

      <div className="info-item">
        <div className="info-item__label">Kept by the books</div>
        <div className="info-item__detail">
          Every figure above is derived from double-entry journal entries. The trial balance is{' '}
          {tb.balanced ? 'balanced' : 'out of balance'} at ₦{naira(tb.totalDebitKobo)}.
        </div>
      </div>
    </>
  )
}

function MoneyRow({
  label,
  amountKobo,
  total = false,
}: {
  label: string
  amountKobo: number
  total?: boolean
}) {
  return (
    <div className={`fin-row ${total ? 'fin-row--total' : ''}`}>
      <span className="fin-row__label">{label}</span>
      <span className={`fin-amount ${amountKobo < 0 ? 'fin-amount--neg' : ''}`}>{naira(amountKobo)}</span>
    </div>
  )
}

function MoneyRows({ rows, empty }: { rows: { code: string; name: string; amountKobo: number }[]; empty: string }) {
  if (rows.length === 0) return empty ? <div className="empty-state">{empty}</div> : null
  return (
    <>
      {rows.map((row) => (
        <div className="fin-row" key={row.code}>
          <span className="fin-row__label">
            <span className="fin-code">{row.code}</span> {row.name}
          </span>
          <span className={`fin-amount ${row.amountKobo < 0 ? 'fin-amount--neg' : ''}`}>
            {naira(row.amountKobo)}
          </span>
        </div>
      ))}
    </>
  )
}
