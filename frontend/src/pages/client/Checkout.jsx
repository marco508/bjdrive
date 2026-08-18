import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
  const [paymentMethod, setPaymentMethod] = useState('KKIAPAY')
  const [allowCash, setAllowCash] = useState(false)
  // Retrait sur place possible uniquement pour un panier mono-enseigne.
  const [fulfillment, setFulfillment] = useState('DELIVERY')
  // Diaspora : commander pour soi ou pour un proche au Bénin.
  const [orderFor, setOrderFor] = useState('ME')
  const [benefs, setBenefs] = useState([])
  const [benefId, setBenefId] = useState('')
  const forRelative = orderFor === 'RELATIVE'
  const canPickup = cartStores.length === 1 && !forRelative
  const isPickup = fulfillment === 'PICKUP' && canPickup
  const selectedBenef = benefs.find((b) => b.id === benefId) || null

  useEffect(() => {
    api.publicConfig()
      .then((c) => {
        setAllowCash(!!c.allowCashOnDelivery)
        // Confiance d'abord : le paiement à la réception est proposé par défaut
        // (le client ne paie que quand ses courses sont dans ses mains).
        if (c.allowCashOnDelivery) setPaymentMethod('CASH')
      })
      .catch(() => {})
    api.beneficiaries().then((list) => setBenefs(list || [])).catch(() => {})
  }, [])

  // Pour un proche : livraison prépayée par défaut (le proche ne paie rien).
  useEffect(() => {
    if (forRelative) {
      setFulfillment('DELIVERY')
      setPaymentMethod('KKIAPAY')
    }
  }, [forRelative])

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

  const canConfirm = forRelative ? !!benefId : (isPickup || !!pos)

  async function confirm() {
    if (!canConfirm) return
    setBusy(true)
    try {
      const base = {
        items: cartItems.map(({ product, qty }) => ({ productId: product.id, qty })),
        destNote: note,
        paymentMethod,
      }
      let order
      if (forRelative) {
        // Livraison à un proche enregistré : adresse + contact repris côté serveur.
        order = await api.createOrder({ ...base, fulfillment: 'DELIVERY', beneficiaryId: benefId })
      } else {
        order = await api.createOrder({
          ...base,
          ...(isPickup ? {} : { destLat: pos.lat, destLng: pos.lng, destAddress: address }),
          fulfillment: isPickup ? 'PICKUP' : 'DELIVERY',
        })
      }
      clearCart()
      if (paymentMethod === 'CASH') {
        showToast(isPickup ? 'Commande envoyée — vous paierez sur place au retrait.' : 'Commande envoyée — vous paierez le livreur à la réception.')
        nav(`/client/track/${order.id}`, { replace: true })
      } else {
        nav(`/client/pay/${order.id}`)
      }
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
        <p className="section-title">Pour qui est cette commande ?</p>
        <div className="card">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
            <input type="radio" name="orderFor" checked={orderFor === 'ME'} onChange={() => setOrderFor('ME')} />
            <span>Pour moi</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0' }}>
            <input type="radio" name="orderFor" checked={forRelative} onChange={() => setOrderFor('RELATIVE')} style={{ marginTop: 3 }} />
            <span>
              Pour un proche au Bénin
              <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                Vous payez d'ici, il/elle reçoit là-bas. Livraison prépayée.
              </span>
            </span>
          </label>
        </div>

        {forRelative ? (
          <>
            <p className="section-title">Livrer à quel proche ?</p>
            {benefs.length === 0 ? (
              <div className="card" style={{ textAlign: 'center' }}>
                <p className="muted" style={{ marginTop: 0 }}>Vous n'avez pas encore enregistré de proche.</p>
                <Link className="btn" to="/client/beneficiaries" style={{ maxWidth: 240, margin: '0 auto', display: 'inline-block' }}>
                  Ajouter un proche
                </Link>
              </div>
            ) : (
              <div className="card">
                {benefs.map((b) => (
                  <label key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <input type="radio" name="benef" checked={benefId === b.id} onChange={() => setBenefId(b.id)} style={{ marginTop: 3 }} />
                    <span>
                      <strong>{b.name}</strong> <span className="muted">· {b.phone}</span>
                      {b.address && <span className="muted" style={{ display: 'block', fontSize: 12 }}>📍 {b.address}</span>}
                    </span>
                  </label>
                ))}
                <Link className="btn ghost small" to="/client/beneficiaries" style={{ marginTop: 8, display: 'inline-block' }}>
                  Gérer mes proches
                </Link>
              </div>
            )}
            {selectedBenef && (
              <div className="card" style={{ background: 'var(--green-soft)' }}>
                <p style={{ margin: 0, fontSize: 14 }}>
                  Le livreur appellera <strong>{selectedBenef.name}</strong> au {selectedBenef.phone}. Vous pourrez lui
                  partager un lien de suivi une fois la commande payée.
                </p>
              </div>
            )}
          </>
        ) : (
          <>
        <p className="section-title">Comment souhaitez-vous récupérer votre commande ?</p>
        <div className="card">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
            <input type="radio" name="fulfillment" checked={fulfillment === 'DELIVERY'} onChange={() => setFulfillment('DELIVERY')} />
            <span>Me faire livrer à domicile</span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', opacity: canPickup ? 1 : 0.45 }}>
            <input type="radio" name="fulfillment" disabled={!canPickup} checked={isPickup} onChange={() => setFulfillment('PICKUP')} style={{ marginTop: 3 }} />
            <span>
              Passer chercher sur place (gratuit, sans frais de livraison)
              {!canPickup && (
                <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                  Disponible pour un panier d'une seule enseigne.
                </span>
              )}
            </span>
          </label>
        </div>

        {isPickup ? (
          <div className="card" style={{ background: 'var(--green-soft)' }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              Vous retirerez votre commande chez <strong>{cartStores[0]?.name}</strong> — {cartStores[0]?.address}.
              Un code de réception vous sera donné : présentez-le à l'enseigne pour récupérer vos courses.
            </p>
          </div>
        ) : (
          <>
        <p className="section-title">Votre position de livraison</p>
        {!pos ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 38 }}>📍</div>
            <p className="muted" style={{ marginTop: 4 }}>
              Nous avons besoin de votre position réelle pour vous livrer et calculer le tarif selon la distance.
            </p>
            <button className="btn" onClick={locate} disabled={locating}>
              {locating ? 'Localisation…' : 'Utiliser ma position'}
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
          </>
        )}
          </>
        )}

        {allowCash && !forRelative && (
          <div className="card" style={{ marginTop: 14 }}>
            <p className="section-title" style={{ marginTop: 0 }}>Mode de paiement</p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0' }}>
              <input type="radio" name="paymethod" checked={paymentMethod === 'CASH'} onChange={() => setPaymentMethod('CASH')} style={{ marginTop: 3 }} />
              <span>
                Payer en espèces {isPickup ? 'sur place au retrait' : 'à la réception'}
                <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                  Vous ne payez que quand vos courses sont dans vos mains.
                </span>
              </span>
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
              <input type="radio" name="paymethod" checked={paymentMethod === 'KKIAPAY'} onChange={() => setPaymentMethod('KKIAPAY')} />
              <span>Payer maintenant (Mobile Money / Moov / carte)</span>
            </label>
          </div>
        )}

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
            {isPickup
              ? 'Retrait sur place : aucun frais de livraison, seuls les frais de service sont ajoutés.'
              : 'Frais de livraison et de service (selon la distance) ajoutés au total à l\'étape suivante.'}
          </p>
        </div>
      </div>

      <div className="footer-bar">
        <button className="btn" onClick={confirm} disabled={busy || !canConfirm}>
          {busy ? 'Envoi…' : forRelative ? 'Commander pour mon proche' : 'Commander'}
        </button>
      </div>
    </>
  )
}
