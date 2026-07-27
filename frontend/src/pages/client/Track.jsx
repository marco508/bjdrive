import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import DeliveryMap from '../../components/DeliveryMap.jsx'
import OrderChat from '../../components/OrderChat.jsx'
import Icon from '../../components/Icon.jsx'
import { trackOrder } from '../../services/realtime.js'
import { STATUS_LABELS, STATUS_ICON, ORDER_FLOW } from '../../services/constants.js'
import { formatFCFA, estimateEta } from '../../lib/geo.js'

export default function Track() {
  const { orderId } = useParams()
  const { showToast } = useApp()
  const { data: order, loading, error, reload } = useAsync(() => api.order(orderId), [orderId])

  const [driverPos, setDriverPos] = useState(null)
  const [slot, setSlot] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const unsub = trackOrder(orderId, {
      onUpdate: () => reload(),
      onDriver: (d) => setDriverPos({ lat: d.lat, lng: d.lng }),
    })
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  if (loading) {
    return (<><TopBar title="Suivi en temps réel" back /><div className="screen"><Loader /></div></>)
  }
  if (error || !order) {
    return (
      <><TopBar title="Suivi en temps réel" back />
        <div className="screen">{error ? <ErrorBox error={error} onRetry={reload} /> : <Empty iconName="search" title="Commande introuvable" />}</div>
      </>
    )
  }

  const status = order.status
  const stores = order.stores || []
  const isPickup = order.fulfillment === 'PICKUP'
  const dest = { lat: order.destLat, lng: order.destLng }
  const origin = order.originLat != null ? { lat: order.originLat, lng: order.originLng }
    : stores[0]?.store ? { lat: stores[0].store.lat, lng: stores[0].store.lng } : null
  const currentIdx = ORDER_FLOW.indexOf(status)
  const showCode = status === 'AWAITING_PICKUP' || status === 'IN_DELIVERY'
  const driver = order.delivery?.driver
  const subtitle = stores.length > 1 ? `${stores.length} enseignes` : stores[0]?.store?.name

  const etaSeconds = driverPos ? estimateEta(driverPos, dest).seconds
    : order.scheduledDeliveryAt ? (new Date(order.scheduledDeliveryAt) - Date.now()) / 1000 : null

  async function reschedule() {
    if (!slot) return
    setBusy(true)
    try { await api.rescheduleOrder(order.id, new Date(slot).toISOString()); showToast('Créneau modifié ✅'); reload() }
    catch (e) { showToast('Erreur : ' + e.message) } finally { setBusy(false) }
  }
  async function cancel() {
    setBusy(true)
    try { await api.cancelOrder(order.id); showToast('Commande annulée'); reload() }
    catch (e) { showToast('Erreur : ' + e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <TopBar title="Suivi en temps réel" subtitle={subtitle} back />
      <div className="screen">
        {status === 'IN_DELIVERY' && (
          <DeliveryMap tall origin={origin} destination={dest} driver={driverPos} etaSeconds={etaSeconds} />
        )}

        <div className="card" style={{ marginTop: status === 'IN_DELIVERY' ? 14 : 0, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>{isPickup && status === 'AWAITING_PICKUP' ? '🏪' : STATUS_ICON[status]}</div>
          <h2 style={{ margin: '6px 0 0' }}>
            {isPickup && status === 'AWAITING_PICKUP' ? 'Préparation — à retirer sur place' : STATUS_LABELS[status]}
          </h2>
        </div>

        {isPickup && status !== 'CANCELLED' && status !== 'DELIVERED' && (
          <div className="card" style={{ background: 'var(--green-soft)' }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              À retirer chez <strong>{stores[0]?.store?.name}</strong> — {stores[0]?.store?.address}
              <br />
              <span className="muted" style={{ fontSize: 13 }}>
                Présentez votre code de réception à l'enseigne pour récupérer votre commande.
              </span>
            </p>
          </div>
        )}

        {status !== 'CANCELLED' && status !== 'PENDING_PAYMENT' && <OrderChat orderId={order.id} />}

        {showCode && (
          <div className="card" style={{ textAlign: 'center', background: 'var(--green)', color: '#fff' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Votre code de réception</p>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 6 }}>{order.receptionCode}</div>
            <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.9 }}>Communiquez ce code au livreur à la remise.</p>
            {order.paymentMethod === 'CASH' && (
              <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700 }}>
                À préparer en espèces : {formatFCFA(order.total)}
              </p>
            )}
          </div>
        )}

        {status === 'DELIVERED' && <ReviewCard order={order} onDone={reload} showToast={showToast} />}

        {/* Enseignes de la tournée + état des retraits */}
        {stores.length > 0 && status !== 'CANCELLED' && (
          <div className="card">
            <p className="section-title" style={{ marginTop: 0 }}>
              {stores.length > 1 ? `Tournée · ${stores.length} enseignes` : 'Enseigne'}
            </p>
            <ul className="list-reset">
              {stores.map((os) => (
                <li key={os.storeId} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
                  <span>{os.store?.emoji} {os.store?.name}</span>
                  <span className={os.pickedUpAt ? 'badge' : 'badge gray'}>{os.pickedUpAt ? '✓ Récupéré' : 'À récupérer'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {driver && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="store-logo" style={{ background: 'var(--green)', width: 48, height: 48 }}><Icon name='moped' size={26} color='#fff' /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{driver.name}</strong>
              <div className="muted" style={{ fontSize: 13 }}>{driver.phone}</div>
            </div>
            <a className="btn ghost small" href={`tel:${driver.phone}`} style={{ textDecoration: 'none' }}>Appeler</a>
          </div>
        )}

        {status === 'IN_DELIVERY' && order.scheduledDeliveryAt && (
          <div className="card">
            <p style={{ margin: 0 }}>
              Livraison prévue vers{' '}
              <strong>{new Date(order.scheduledDeliveryAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</strong>
            </p>
            {order.scheduleModified ? (
              <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Créneau déjà modifié une fois.</p>
            ) : (
              <>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>Choisir un autre créneau</span>
                  <input type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)} />
                </label>
                <button className="btn outline small" onClick={reschedule} disabled={busy || !slot}>Modifier le créneau (1 seule fois)</button>
              </>
            )}
          </div>
        )}

        {status !== 'CANCELLED' && !isPickup && (
          <div className="card">
            <p className="section-title" style={{ marginTop: 0 }}>Progression</p>
            <ul className="timeline">
              {ORDER_FLOW.map((st, i) => (
                <li key={st} className={i < currentIdx ? 'done' : i === currentIdx ? 'current' : ''}>
                  <span className="dot">{i < currentIdx ? '✓' : STATUS_ICON[st]}</span>
                  <div><div className="t-label">{STATUS_LABELS[st]}</div></div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {status === 'CANCELLED' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36 }}>❌</div>
            <p style={{ marginBottom: 0 }}>Cette commande a été annulée.</p>
            {order.paymentStatus === 'REFUND_PENDING' && (
              <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Remboursement en cours de traitement.</p>
            )}
            {order.paymentStatus === 'REFUNDED' && (
              <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Vous avez été remboursé.</p>
            )}
          </div>
        )}

        <div className="card">
          <p className="section-title" style={{ marginTop: 0 }}>Détail de la commande</p>
          <ul className="list-reset">
            {order.items.map((it) => (
              <li key={it.id || it.productId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
                <span>{it.emoji} {it.name} <span className="muted">×{it.qty}{stores.length > 1 ? ` · ${it.storeName}` : ''}</span></span>
                <span>{formatFCFA(it.price * it.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="divider" />
          <Row label="Sous-total" value={formatFCFA(order.subtotal)} />
          <Row label="Livraison & service" value={formatFCFA(order.deliveryFee + order.commission)} detail={order} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <strong>Total</strong>
            <span className="price-total">{formatFCFA(order.total)}</span>
          </div>
          {order.destAddress && (
            <>
              <div className="divider" />
              <div className="muted" style={{ fontSize: 13 }}>📍 {order.destAddress}</div>
              {order.destNote && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>📝 {order.destNote}</div>}
            </>
          )}
        </div>

        {(status === 'AWAITING_DRIVER' || status === 'AWAITING_PICKUP') && (
          <button className="btn danger" onClick={cancel} disabled={busy}>Annuler la commande</button>
        )}
      </div>
    </>
  )
}

function Row({ label, value, detail }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 14 }}>
        <span className="muted">
          {label}
          {detail && (
            <button
              onClick={() => setOpen((o) => !o)}
              style={{ border: 'none', background: 'none', color: 'var(--green-dark)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: '0 0 0 6px' }}
            >
              {open ? 'masquer' : 'voir le détail'}
            </button>
          )}
        </span>
        <span>{value}</span>
      </div>
      {detail && open && (
        <div style={{ paddingLeft: 12, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span className="muted">· Livraison (distance)</span>
            <span className="muted">{formatFCFA(detail.deliveryFee)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span className="muted">· Frais de service BjDrive</span>
            <span className="muted">{formatFCFA(detail.commission)}</span>
          </div>
        </div>
      )}
    </>
  )
}

// Sélecteur d'étoiles (1 à 5).
function Stars({ value, onChange }) {
  return (
    <div style={{ fontSize: 26, letterSpacing: 4, cursor: 'pointer', userSelect: 'none' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} onClick={() => onChange(n)} style={{ opacity: n <= value ? 1 : 0.25 }}>⭐</span>
      ))}
    </div>
  )
}

// Avis après livraison : note du livreur + de chaque enseigne.
function ReviewCard({ order, onDone, showToast }) {
  const already = (order.reviews || []).length > 0
  const [driverRating, setDriverRating] = useState(0)
  const [storeRatings, setStoreRatings] = useState({})
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)

  if (already) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <p style={{ margin: 0 }}>🙏 Merci pour votre avis !</p>
      </div>
    )
  }

  async function send() {
    setBusy(true)
    try {
      await api.reviewOrder(order.id, {
        driverRating: driverRating || undefined,
        driverComment: comment || undefined,
        stores: Object.entries(storeRatings)
          .filter(([, r]) => r > 0)
          .map(([storeId, rating]) => ({ storeId, rating })),
      })
      showToast('Merci pour votre avis ⭐')
      onDone()
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const nothing = !driverRating && !Object.values(storeRatings).some((r) => r > 0)
  return (
    <div className="card">
      <p className="section-title" style={{ marginTop: 0 }}>Notez votre expérience</p>
      {order.delivery?.driver && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>🛵 Livreur · {order.delivery.driver.name}</div>
          <Stars value={driverRating} onChange={setDriverRating} />
        </div>
      )}
      {(order.stores || []).map((os) => (
        <div key={os.storeId} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 14, marginBottom: 4 }}>{os.store?.emoji} {os.store?.name}</div>
          <Stars value={storeRatings[os.storeId] || 0} onChange={(n) => setStoreRatings((p) => ({ ...p, [os.storeId]: n }))} />
        </div>
      ))}
      <label className="field">
        <span>Commentaire (optionnel)</span>
        <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Un mot sur la livraison ?" />
      </label>
      <button className="btn" onClick={send} disabled={busy || nothing}>
        {busy ? 'Envoi…' : 'Envoyer mon avis'}
      </button>
    </div>
  )
}
