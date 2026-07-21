import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import { formatFCFA } from '../../lib/geo.js'

export default function StorePage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { cart, addToCart, cartCount, cartSubtotal } = useApp()

  const { data: store, loading, error, reload } = useAsync(() => api.store(id), [id])

  const byCategory = useMemo(() => {
    const map = {}
    for (const p of store?.products || []) (map[p.category || 'Autres'] ||= []).push(p)
    return map
  }, [store])

  if (loading) {
    return (
      <>
        <TopBar title="Enseigne" back />
        <div className="screen"><Loader /></div>
      </>
    )
  }

  if (error || !store) {
    return (
      <>
        <TopBar title="Enseigne" back />
        <div className="screen"><ErrorBox error={error || 'Enseigne introuvable'} onRetry={reload} /></div>
      </>
    )
  }

  const qtyInCart = (pid) => cart.items[pid]?.qty || 0

  return (
    <>
      <TopBar
        title={store.name}
        subtitle={store.address}
        back
        right={store.category ? <span className="pill">{store.category.emoji} {store.category.name}</span> : null}
      />
      <div className="screen">
        {(store.products || []).length === 0 && (
          <Empty icon="📭" title="Rayons vides" text="Cette enseigne n'a pas encore ajouté de produits." />
        )}

        {Object.entries(byCategory).map(([cat, items]) => (
          <div key={cat}>
            <p className="section-title">{cat}</p>
            <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
              {items.map((p) => {
                const q = qtyInCart(p.id)
                const out = p.stock <= 0
                return (
                  <div className="product" key={p.id}>
                    <div className="thumb">{p.emoji || '🛍️'}</div>
                    <div className="info">
                      <h4>{p.name}</h4>
                      <div className="price">
                        {formatFCFA(p.price)} <span className="muted" style={{ fontWeight: 400 }}>/ {p.unit}</span>
                      </div>
                      <div className={`stock ${p.stock <= 5 ? 'low' : ''}`}>
                        {out ? 'Rupture' : `${p.stock} en stock`}
                      </div>
                    </div>
                    {out ? (
                      <span className="badge red">Épuisé</span>
                    ) : q === 0 ? (
                      <button className="btn ghost small" onClick={() => addToCart(store, p, 1)}>Ajouter</button>
                    ) : (
                      <div className="stepper">
                        <button onClick={() => addToCart(store, p, -1)}>−</button>
                        <span className="n">{q}</span>
                        <button onClick={() => addToCart(store, p, 1)} disabled={q >= p.stock}>+</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {cartCount > 0 && (
        <button className="btn cart-fab" onClick={() => nav('/client/cart')}>
          🛒 Voir le panier · {cartCount} article{cartCount > 1 ? 's' : ''} · {formatFCFA(cartSubtotal)}
        </button>
      )}
    </>
  )
}
