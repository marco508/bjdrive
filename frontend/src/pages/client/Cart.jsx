import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { TopBar, Empty } from '../../components/ui.jsx'
import { formatFCFA } from '../../lib/geo.js'

export default function Cart() {
  const nav = useNavigate()
  const { cartItems, cartStores, cartSubtotal, addToCart, clearCart } = useApp()

  // Regroupe les articles par enseigne
  const byStore = cartStores.map((store) => ({
    store,
    items: cartItems.filter((it) => it.store.id === store.id),
  }))

  return (
    <>
      <TopBar
        title="Mon panier"
        subtitle={cartStores.length > 1 ? `${cartStores.length} enseignes` : cartStores[0]?.name}
        back
        right={cartItems.length ? <button className="pill" onClick={clearCart}>Vider</button> : null}
      />
      <div className="screen">
        {cartItems.length === 0 ? (
          <Empty icon="🛒" title="Panier vide" text="Ajoutez des produits depuis une enseigne ou la recherche.">
            <button className="btn" style={{ maxWidth: 240, margin: '14px auto 0' }} onClick={() => nav('/client')}>
              Voir les enseignes
            </button>
          </Empty>
        ) : (
          <>
            {cartStores.length > 1 && (
              <div className="card" style={{ background: 'var(--green-soft)', color: 'var(--green-dark)', fontSize: 13 }}>
                🛵 Panier <b>multi-enseignes</b> : un seul livreur passe dans chaque boutique. Les frais de livraison
                dépendent de la distance totale de la tournée (calculés à l'étape suivante).
              </div>
            )}
            {byStore.map(({ store, items }) => {
              const sub = items.reduce((s, it) => s + it.product.price * it.qty, 0)
              return (
                <div key={store.id}>
                  <p className="section-title">{store.emoji} {store.name}</p>
                  <div className="card">
                    {items.map(({ product, qty }) => (
                      <div className="product" key={product.id}>
                        <div className="thumb">{product.emoji || '🛍️'}</div>
                        <div className="info">
                          <h4>{product.name}</h4>
                          <div className="price">{formatFCFA(product.price * qty)}</div>
                          <div className="stock">{formatFCFA(product.price)} × {qty}</div>
                        </div>
                        <div className="stepper">
                          <button onClick={() => addToCart(store, product, -1)}>−</button>
                          <span className="n">{qty}</span>
                          <button onClick={() => addToCart(store, product, 1)} disabled={qty >= (product.stock ?? 9999)}>+</button>
                        </div>
                      </div>
                    ))}
                    <div className="divider" />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span className="muted">Sous-total {store.name}</span>
                      <span>{formatFCFA(sub)}</span>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Total produits</strong>
                <span className="price-total">{formatFCFA(cartSubtotal)}</span>
              </div>
              <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                + livraison (selon la distance) + 10 % de service, calculés à l'étape suivante.
              </p>
            </div>
          </>
        )}
      </div>

      {cartItems.length > 0 && (
        <div className="footer-bar">
          <button className="btn" onClick={() => nav('/client/checkout')}>Continuer vers la livraison</button>
        </div>
      )}
    </>
  )
}
