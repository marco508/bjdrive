import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { useAsync } from '../../components/useApi.js'
import { api } from '../../services/api.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import { getCurrentPosition, formatFCFA } from '../../lib/geo.js'

export default function Search() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const { addToCart, cartCount, cartSubtotal, cart } = useApp()
  const q = params.get('q') || ''
  const [term, setTerm] = useState(q)
  const [pos, setPos] = useState(null)

  useEffect(() => {
    getCurrentPosition().then((p) => setPos({ lat: p.lat, lng: p.lng })).catch(() => {})
  }, [])

  const res = useAsync(() => (q.trim().length >= 2 ? api.searchProducts(q, pos?.lat, pos?.lng) : Promise.resolve([])), [q, pos])
  const offers = res.data || []
  const cheapest = offers.length ? Math.min(...offers.map((o) => o.price)) : null

  function submit(e) {
    e.preventDefault()
    if (term.trim().length >= 2) setParams({ q: term.trim() })
  }
  const qtyOf = (pid) => cart.items[pid]?.qty || 0

  return (
    <>
      <TopBar title="Rechercher un produit" subtitle="Comparez les prix entre enseignes" back />
      <div className="screen">
        <form onSubmit={submit} style={{ marginBottom: 12 }}>
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="🔎 Ex : riz, huile, lait..." autoFocus />
        </form>

        {res.loading && <Loader label="Recherche…" />}
        <ErrorBox error={res.error} onRetry={res.reload} />
        {!res.loading && q.length >= 2 && offers.length === 0 && (
          <Empty icon="🔍" title="Aucun résultat" text={`Aucun produit « ${q} » dans les enseignes vérifiées.`} />
        )}
        {q.length < 2 && <p className="muted">Saisissez au moins 2 caractères.</p>}

        {offers.length > 0 && (
          <>
            <p className="section-title">{offers.length} offre(s) — du moins cher au plus cher</p>
            {offers.map((o) => {
              const store = {
                id: o.storeId, name: o.storeName, emoji: o.storeEmoji, color: o.storeColor,
                address: o.storeAddress, lat: o.storeLat, lng: o.storeLng,
              }
              const product = { id: o.id, name: o.name, price: o.price, emoji: o.emoji, unit: o.unit, stock: o.stock }
              const qty = qtyOf(o.id)
              return (
                <div className="card" key={o.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="thumb">{o.emoji || '🛍️'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: 0 }}>{o.name}</h4>
                    <div className="price" style={{ color: 'var(--green-dark)', fontWeight: 700 }}>
                      {formatFCFA(o.price)} <span className="muted" style={{ fontWeight: 400 }}>/ {o.unit}</span>
                      {o.price === cheapest && <span className="badge" style={{ marginLeft: 6 }}>Moins cher</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {o.storeEmoji} {o.storeName}{o.distance != null ? ` · à ${(o.distance / 1000).toFixed(1)} km` : ''}
                    </div>
                  </div>
                  {qty === 0 ? (
                    <button className="btn ghost small" onClick={() => addToCart(store, product, 1)}>Ajouter</button>
                  ) : (
                    <div className="stepper">
                      <button onClick={() => addToCart(store, product, -1)}>−</button>
                      <span className="n">{qty}</span>
                      <button onClick={() => addToCart(store, product, 1)} disabled={qty >= o.stock}>+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}
      </div>

      {cartCount > 0 && (
        <button className="btn cart-fab" onClick={() => nav('/client/cart')}>
          🛒 Voir le panier · {cartCount} article{cartCount > 1 ? 's' : ''} · {formatFCFA(cartSubtotal)}
        </button>
      )}
    </>
  )
}
