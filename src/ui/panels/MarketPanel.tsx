import { useEffect, useState } from 'react'
import { company, naira, type Product } from '../../api/company'
import { useWorldStore } from '../../state/worldStore'
import { Icon } from '../Icon'

/** A backend-backed market surface for the current company's catalogue. */
export function MarketPanel() {
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void company.products().then((result) => setProducts(result.products)).catch(() => setError('The market is unavailable right now.'))
  }, [])

  return (
    <div className="panel-backdrop">
      <div className="panel panel--wide app-panel">
        <div className="panel__header">
          <div className="panel__avatar app-icon app-icon--green"><Icon name="briefcase" size={22} /></div>
          <div className="panel__heading"><h3 className="panel__title">Market</h3><div className="panel__sub">Products, stock and supplies</div></div>
          <button type="button" className="panel__close" onClick={() => useWorldStore.getState().closePanel()} aria-label="Close market"><Icon name="close" size={15} /></button>
        </div>
        <div className="panel__body">
          {error && <div className="fo-error">{error}</div>}
          {!error && products.length === 0 && <div className="empty-state">Create your first product in Business to populate the market.</div>}
          {products.map((product) => <div className="market-row" key={product.id}>
            <div className="market-row__icon"><Icon name="briefcase" size={20} /></div>
            <div className="market-row__main"><strong>{product.name}</strong><small>{product.onHand} units in stock · cost ₦{naira(product.unitCostKobo)}</small></div>
            <span className="market-row__price">₦{naira(product.unitPriceKobo)}</span>
          </div>)}
        </div>
        <div className="panel__footer"><button type="button" className="btn btn--primary" onClick={() => useWorldStore.getState().openPanel('business')}>Manage business</button></div>
      </div>
    </div>
  )
}
