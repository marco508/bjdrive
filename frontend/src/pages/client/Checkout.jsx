import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { TopBar } from '../../components/ui.jsx'
import DeliveryMap from '../../components/DeliveryMap.jsx'
import { getCurrentPosition, formatFCFA } from '../../lib/geo.js'

export default function Checkout() {
  const nav = useNavigate()
  const { user, cartItems, cartStores, cartSubtotal, clearCart, showToast } = useApp()

  const [pos, setPos] = useState(null)
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [phone, setPhone] = useState(user?.phone || '')
  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState('')
  const [busy, setBusy] = useState(false)

  if (cartItems.length === 0) {
    return (
      <>
        <TopBar title="Livraison" back />
        <div className="screen"><p className="muted">Votre panier est vide.</p></div>
      </>
    )
  }

  async function locate() {
    setLocating(true)
    setGeoError('')
    try {
      const p = await getCurrentPosition()
      setPos({ lat: p.lat, lng: p.lng })
    } catch (e) {
      setGeoError("Impossible d'obtenir votre position. Autorisez la localisation pour être livré au bon endroit.")
    } finally {
      setLocating(false)
    }
  }

  async function confirm() {
    if (!pos) return
    setBusy(true)
    try {
      const order = await api.createOrder({
        items: cartItems.map(({ product, qty }) => ({ productId: product.id, qty })),
        destLat: pos.lat,
        destLng: pos.lng,
        destAddress: address,
        destNote: note,
      })
      clearCart()
      nav(`/client/pay/${order.id}`)
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const origin = cartStores[0] ? { lat: cartStores[0].lat, lng: cartStores[0].lng } : null

  return (
    <>
      <TopBar title="Livraison à domicile" subtitle={cartStores.length > 1 ? `${cartStores.length} enseignes` : cartStores[0]?.name} back />
      <div className="screen">
        <p className="section-title">Votre position de livraison</p>
        {!pos ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 38 }}>📍</div>
            <p className="muted" style={{ marginTop: 4 }}>
              Nous avons besoin de votre position réelle pour vous livrer et calculer le tarif selon la distance.
            </p>
            <button className="btn" onClick={locate} disabled={locating}>
              {locating ? 'Localisation…' : '📍 Utiliser ma position'}
            </button>
            {geoError && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{geoError}</p>}
          </div>
        ) : (
          <>
            <DeliveryMap origin={origin} destination={pos} />
            <button className="btn ghost small" style={{ marginTop: 10 }} onClick={locate} disabled={locating}>
              Actualiser ma position
            </button>
          </>
        )}

        <div className="card" style={{ marginTop: 14 }}>
          <label className="field">
            <span>Adresse / repère (quartier, rue, point de repère)</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ex : quartier, rue, point de repère" />
          </label>
          <label className="field">
            <span>Instructions au livreur (optionnel)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex : portail bleu, appeler en arrivant" />
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Téléphone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+229 ..." />
          </label>
        </div>

        <div className="card">
          {cartStores.length > 1 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              🛵 Tournée dans {cartStores.length} enseignes — le tarif de livraison dépend de la distance totale.
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Sous-total produits</strong>
            <span className="price-total">{formatFCFA(cartSubtotal)}</span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            Frais de livraison (selon la distance) et service (10 %) ajoutés à l'étape du paiement.
          </p>
        </div>
      </div>

      <div className="footer-bar">
        <button className="btn" onClick={confirm} disabled={busy || !pos}>
          {busy ? 'Envoi…' : 'Commander'}
        </button>
      </div>
    </>
  )
}
