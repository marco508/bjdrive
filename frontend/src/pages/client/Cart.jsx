import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { TopBar, Empty } from '../../components/ui.jsx'
import { formatFCFA } from '../../lib/geo.js'

export default function Cart() {
  const nav = useNavigate()
  const { cart, cartItems, cartSubtotal, addToCart, clearCart } = useApp()
  const store = cart.store

  return (
    <>
      <TopBar
        title="Mon panier"
        subtitle={store?.name}
        back
        right={cartItems.length ? <button className="pill" onClick={clearCart}>Vider</button> : null}
      />
      <div className="screen">
        {cartItems.length === 0 ? (
          <Empty icon="🛒" title="Panier vide" text="Ajoutez des produits depuis une enseigne.">
            <button className="btn" style={{ maxWidth: 240, margin: '14px auto 0' }} onClick={() => nav('/client')}>
              Voir les enseignes
            </button>
          </Empty>
        ) : (
          <>
            <div className="card">
              {cartItems.map(({ product, qty }) => (
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
                    <button onClick={() => addToCart(store, product, 1)} disabled={qty >= product.stock}>+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>Sous-total</strong>
                <span className="price-total">{formatFCFA(cartSubtotal)}</span>
              </div>
              <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
                Frais de livraison calculés à l'étape suivante selon votre position.
              </p>
            </div>
          </>
        )}
      </div>

      {cartItems.length > 0 && (
        <div className="footer-bar">
          <button className="btn" onClick={() => nav('/client/checkout')}>
            Continuer vers la livraison
          </button>
        </div>
      )}
    </>
  )
}
