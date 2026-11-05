import { useState } from 'react'
import { company as companyApi, naira, type Customer, type Invoice, type Order, type Product } from '../../../api/company'
import { useFinanceStore } from '../../../state/financeStore'
import { useWorldStore } from '../../../state/worldStore'

/**
 * Trading, from the shelf to the bank.
 *
 * This is the counter side of the business: what is on the shelf, who is
 * buying, what has gone out, and what has been paid. Every action posts to the
 * server, and the ledger — not this screen — decides what the numbers are.
 */
export function OrdersView() {
  const status = useFinanceStore((s) => s.status)
  const error = useFinanceStore((s) => s.error)
  const summary = useFinanceStore((s) => s.summary)
  const products = useFinanceStore((s) => s.products)
  const customers = useFinanceStore((s) => s.customers)
  const orders = useFinanceStore((s) => s.orders)
  const invoices = useFinanceStore((s) => s.invoices)

  if (status === 'loading') return <div className="empty-state">Opening the store…</div>
  if (status === 'error' || !summary) {
    return <div className="empty-state">{error ?? 'The store is not available yet.'}</div>
  }

  const stockValue = products.reduce((sum, p) => sum + p.stockValueKobo, 0)
  const outstanding = invoices.reduce((sum, i) => sum + i.outstandingKobo, 0)

  return (
    <>
      <div className="chip-row">
        <span className="chip">{products.length} products</span>
        <span className="chip">{customers.length} customers</span>
        <span className="chip">{orders.length} orders</span>
        <span className="chip">Stock ₦{naira(stockValue)}</span>
        <span className="chip">Owed ₦{naira(outstanding)}</span>
      </div>

      <ProductsSection products={products} />
      <PurchaseSection products={products} />
      <CustomersSection customers={customers} />
      <OrderSection products={products} customers={customers} orders={orders} />
      <InvoiceSection invoices={invoices} />
    </>
  )
}

/* ------------------------------------------------------------- products */

function ProductsSection({ products }: { products: Product[] }) {
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [price, setPrice] = useState('')
  return (
    <>
      <div className="section-title">Catalogue</div>
      {products.length === 0 && <div className="empty-state">Nothing to sell yet. Add a product first.</div>}
      {products.map((product) => (
        <div className="fin-row" key={product.id}>
          <span className="fin-row__label">
            <span className="fin-code">{product.sku}</span> {product.name}
            <span className="fin-sub"> · {product.onHand} on hand</span>
          </span>
          <span className="fin-amount">₦{naira(product.unitPriceKobo)}</span>
        </div>
      ))}
      <SimpleForm
        fields={[
          { id: 'ord-pl-name', label: 'Product name', value: name, set: setName, placeholder: 'Ankara tote bag' },
          { id: 'ord-pl-cost', label: 'Unit cost (₦)', value: cost, set: setCost, placeholder: '1200', numeric: true },
          { id: 'ord-pl-price', label: 'Selling price (₦)', value: price, set: setPrice, placeholder: '2500', numeric: true },
        ]}
        action="Add product"
        onSubmit={async () => {
          if (!name.trim()) throw new Error('Give the product a name.')
          await companyApi.createProduct({
            name: name.trim(),
            unitCost: Number(cost) || 0,
            unitPrice: Number(price) || 0,
          })
          setName('')
          setCost('')
          setPrice('')
        }}
        success="Product added to the catalogue"
      />
    </>
  )
}

/* --------------------------------------------------------------- buying */

function PurchaseSection({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [supplier, setSupplier] = useState('')

  if (products.length === 0) return null
  const selected = productId || products[0].id

  return (
    <>
      <div className="section-title">Buy stock</div>
      <StockForm
        products={products}
        productId={selected}
        setProductId={setProductId}
        quantity={quantity}
        setQuantity={setQuantity}
        unitCost={unitCost}
        setUnitCost={setUnitCost}
        supplier={supplier}
        setSupplier={setSupplier}
      />
    </>
  )
}

function StockForm({
  products,
  productId,
  setProductId,
  quantity,
  setQuantity,
  unitCost,
  setUnitCost,
  supplier,
  setSupplier,
}: {
  products: Product[]
  productId: string
  setProductId: (value: string) => void
  quantity: string
  setQuantity: (value: string) => void
  unitCost: string
  setUnitCost: (value: string) => void
  supplier: string
  setSupplier: (value: string) => void
}) {
  const refreshFinance = useFinanceStore((s) => s.refreshFinance)
  const refreshStore = useFinanceStore((s) => s.refreshStore)
  const mergeSummary = useFinanceStore((s) => s.mergeSummary)
  const pushToast = useWorldStore((s) => s.pushToast)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      pushToast('How many units are you buying?', 'warning')
      return
    }
    setBusy(true)
    try {
      const result = await companyApi.purchaseStock({
        productId,
        quantity: Math.round(qty),
        unitCost: unitCost ? Number(unitCost) : undefined,
        supplierName: supplier.trim() || undefined,
      })
      mergeSummary(result)
      await Promise.all([refreshStore(), refreshFinance()])
      pushToast(
        `Stock received — ₦${naira(result.billedKobo)} billed by the supplier, pay it from Payables`,
        'success',
      )
      setQuantity('')
      setUnitCost('')
      setSupplier('')
    } catch (caught) {
      pushToast(caught instanceof Error ? caught.message : 'Could not buy stock', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fin-form">
      <div className="field">
        <label htmlFor="ord-buy-product">Product</label>
        <select id="ord-buy-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="ord-buy-qty">Quantity</label>
        <input
          id="ord-buy-qty"
          type="number"
          min="1"
          value={quantity}
          placeholder="20"
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="ord-buy-cost">Unit cost (₦)</label>
        <input
          id="ord-buy-cost"
          type="number"
          min="0"
          value={unitCost}
          placeholder="optional"
          onChange={(e) => setUnitCost(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="ord-buy-supplier">Supplier</label>
        <input
          id="ord-buy-supplier"
          value={supplier}
          placeholder="optional"
          onChange={(e) => setSupplier(e.target.value)}
        />
      </div>
      <div className="fin-form__actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={submit}>
          Buy with company cash
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ customers */

function CustomersSection({ customers }: { customers: Customer[] }) {
  const [name, setName] = useState('')
  const [segment, setSegment] = useState('')
  return (
    <>
      <div className="section-title">Customers</div>
      {customers.length === 0 && <div className="empty-state">No customers yet.</div>}
      {customers.map((customer) => (
        <div className="fin-row" key={customer.id}>
          <span className="fin-row__label">{customer.name}</span>
          <span className="fin-sub">{customer.segment}</span>
        </div>
      ))}
      <SimpleForm
        fields={[
          { id: 'ord-cu-name', label: 'Customer name', value: name, set: setName, placeholder: 'Chidi Okeke' },
          { id: 'ord-cu-seg', label: 'Segment', value: segment, set: setSegment, placeholder: 'Retail' },
        ]}
        action="Add customer"
        onSubmit={async () => {
          if (!name.trim()) throw new Error('Give the customer a name.')
          await companyApi.createCustomer({ name: name.trim(), segment: segment.trim() || undefined })
          setName('')
          setSegment('')
        }}
        success="Customer added"
      />
    </>
  )
}

/* --------------------------------------------------------------- orders */

function OrderSection({
  products,
  customers,
  orders,
}: {
  products: Product[]
  customers: Customer[]
  orders: Order[]
}) {
  const [customerId, setCustomerId] = useState('')
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [delivery, setDelivery] = useState('')

  const ready = customers.length > 0 && products.length > 0

  return (
    <>
      <div className="section-title">Orders</div>
      {orders.length === 0 && <div className="empty-state">No orders yet.</div>}
      {orders.map((order) => (
        <OrderRow key={order.id} order={order} />
      ))}

      {!ready && (
        <div className="empty-state">Add a product and a customer before taking an order.</div>
      )}
      {ready && (
        <div className="fin-form">
          <div className="field">
            <label htmlFor="ord-or-customer">Customer</label>
            <select id="ord-or-customer" value={customerId || customers[0].id} onChange={(e) => setCustomerId(e.target.value)}>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ord-or-product">Product</label>
            <select id="ord-or-product" value={productId || products[0].id} onChange={(e) => setProductId(e.target.value)}>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · ₦{naira(product.unitPriceKobo)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ord-or-qty">Quantity</label>
            <input
              id="ord-or-qty"
              type="number"
              min="1"
              value={quantity}
              placeholder="4"
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ord-or-delivery">Delivery fee (₦)</label>
            <input
              id="ord-or-delivery"
              type="number"
              min="0"
              value={delivery}
              placeholder="0"
              onChange={(e) => setDelivery(e.target.value)}
            />
          </div>
          <OrderSubmit
            customerId={customerId || customers[0].id}
            productId={productId || products[0].id}
            quantity={quantity}
            delivery={delivery}
            onDone={() => {
              setQuantity('')
              setDelivery('')
            }}
          />
        </div>
      )}
    </>
  )
}

function OrderSubmit({
  customerId,
  productId,
  quantity,
  delivery,
  onDone,
}: {
  customerId: string
  productId: string
  quantity: string
  delivery: string
  onDone: () => void
}) {
  const mergeSummary = useFinanceStore((s) => s.mergeSummary)
  const refreshStore = useFinanceStore((s) => s.refreshStore)
  const pushToast = useWorldStore((s) => s.pushToast)
  const [busy, setBusy] = useState(false)

  async function submit() {
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      pushToast('How many units is the order for?', 'warning')
      return
    }
    setBusy(true)
    try {
      const result = await companyApi.createOrder({
        customerId,
        lines: [{ productId, quantity: Math.round(qty) }],
        delivery: Number(delivery) || 0,
      })
      mergeSummary(result)
      await refreshStore()
      pushToast(`Order ${result.order.reference} placed`, 'success')
      onDone()
    } catch (caught) {
      pushToast(caught instanceof Error ? caught.message : 'Could not place the order', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fin-form__actions">
      <button type="button" className="btn btn--primary" disabled={busy} onClick={submit}>
        Place order
      </button>
    </div>
  )
}

function OrderRow({ order }: { order: Order }) {
  const mergeSummary = useFinanceStore((s) => s.mergeSummary)
  const refreshStore = useFinanceStore((s) => s.refreshStore)
  const refreshFinance = useFinanceStore((s) => s.refreshFinance)
  const pushToast = useWorldStore((s) => s.pushToast)
  const [busy, setBusy] = useState(false)

  const units = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  const canDeliver = order.status === 'PLACED'
  const canInvoice = order.status === 'DELIVERED'

  async function act(kind: 'deliver' | 'invoice') {
    setBusy(true)
    try {
      const result =
        kind === 'deliver'
          ? await companyApi.deliverOrder(order.id)
          : await companyApi.invoiceOrder(order.id)
      mergeSummary(result)
      await Promise.all([refreshStore(), refreshFinance()])
      pushToast(
        kind === 'deliver' ? `Order ${order.reference} delivered` : `Order ${order.reference} invoiced`,
        'success',
      )
    } catch (caught) {
      pushToast(caught instanceof Error ? caught.message : 'That step failed', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="record">
      <span className="record__key">
        {order.reference} · {order.customerName}
      </span>
      <span className="record__value">
        {units} units · ₦{naira(order.totalKobo)} · {order.status}
      </span>
      {(canDeliver || canInvoice) && (
        <span className="fin-form__actions">
          {canDeliver && (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act('deliver')}>
              Deliver
            </button>
          )}
          {canInvoice && (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => act('invoice')}>
              Raise invoice
            </button>
          )}
        </span>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- invoices */

function InvoiceSection({ invoices }: { invoices: Invoice[] }) {
  return (
    <>
      <div className="section-title">Invoices</div>
      {invoices.length === 0 && <div className="empty-state">Nothing invoiced yet.</div>}
      {invoices.map((invoice) => (
        <InvoiceRow key={invoice.id} invoice={invoice} />
      ))}
    </>
  )
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const refreshFinance = useFinanceStore((s) => s.refreshFinance)
  const refreshStore = useFinanceStore((s) => s.refreshStore)
  const mergeSummary = useFinanceStore((s) => s.mergeSummary)
  const pushToast = useWorldStore((s) => s.pushToast)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const settled = invoice.status === 'PAID'

  async function receive() {
    const value = Number(amount)
    if (!Number.isFinite(value) || value <= 0) {
      pushToast('Enter the amount received', 'warning')
      return
    }
    setBusy(true)
    try {
      const result = await companyApi.recordPayment(invoice.id, value)
      mergeSummary(result)
      await Promise.all([refreshStore(), refreshFinance()])
      pushToast(`Payment recorded on ${invoice.number}`, 'success')
      setAmount('')
    } catch (caught) {
      pushToast(caught instanceof Error ? caught.message : 'Could not record the payment', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fin-entry">
      <div className="fin-entry__head">
        <span className="fin-entry__memo">
          {invoice.number} · {invoice.customerName ?? 'Customer'}
        </span>
        <span className="fin-entry__source">{invoice.status}</span>
      </div>
      <div className="fin-row">
        <span className="fin-row__label">Invoiced ₦{naira(invoice.amountKobo)}</span>
        <span className="fin-amount">
          {settled ? 'Settled' : `Outstanding ₦${naira(invoice.outstandingKobo)}`}
        </span>
      </div>
      {!settled && (
        <div className="fin-form">
          <div className="field">
            <label htmlFor={`ord-pay-${invoice.id}`}>Amount received (₦)</label>
            <input
              id={`ord-pay-${invoice.id}`}
              type="number"
              min="0"
              value={amount}
              placeholder={String(Math.round(invoice.outstandingKobo / 100))}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="fin-form__actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={receive}>
              Record payment
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- forms */

interface FieldSpec {
  id: string
  label: string
  value: string
  set: (value: string) => void
  placeholder?: string
  numeric?: boolean
}

/**
 * A small inline form that posts one request then refreshes the store. Errors
 * raised by the handler are surfaced as a toast rather than swallowed.
 */
function SimpleForm({
  fields,
  action,
  onSubmit,
  success,
}: {
  fields: FieldSpec[]
  action: string
  onSubmit: () => Promise<void>
  success: string
}) {
  const refreshStore = useFinanceStore((s) => s.refreshStore)
  const pushToast = useWorldStore((s) => s.pushToast)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await onSubmit()
      await refreshStore()
      pushToast(success, 'success')
    } catch (caught) {
      pushToast(caught instanceof Error ? caught.message : 'Could not save that', 'warning')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fin-form">
      {fields.map((field) => (
        <div className="field" key={field.id}>
          <label htmlFor={field.id}>{field.label}</label>
          <input
            id={field.id}
            type={field.numeric ? 'number' : 'text'}
            min={field.numeric ? '0' : undefined}
            value={field.value}
            placeholder={field.placeholder}
            onChange={(event) => field.set(event.target.value)}
          />
        </div>
      ))}
      <div className="fin-form__actions">
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={submit}>
          {action}
        </button>
      </div>
    </div>
  )
}
