import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import DeliveryMap from '../../components/DeliveryMap.jsx'
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
    return (
      <>
        <TopBar title="Suivi en temps réel" back />
        <div className="screen"><Loader /></div>
      </>
    )
  }

  if (error || !order) {
    return (
      <>
        <TopBar title="Suivi en temps réel" back />
        <div className="screen">
          {error ? <ErrorBox error={error} onRetry={reload} /> : <Empty icon="🔍" title="Commande introuvable" />}
        </div>
      </>
    )
  }

  const status = order.status
  const store = order.store
  const dest = { lat: order.destLat, lng: order.destLng }
  const currentIdx = ORDER_FLOW.indexOf(status)
  const showCode = status === 'AWAITING_PICKUP' || status === 'IN_DELIVERY'
  const driver = order.delivery?.driver

  const etaSeconds = driverPos
    ? estimateEta(driverPos, dest).seconds
    : order.scheduledDeliveryAt
    ? (new Date(order.scheduledDeliveryAt) - Date.now()) / 1000
    : null

  async function reschedule() {
    if (!slot) return
    setBusy(true)
    try {
      await api.rescheduleOrder(order.id, new Date(slot).toISOString())
      showToast('Créneau modifié ✅')
      reload()
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    setBusy(true)
    try {
      await api.cancelOrder(order.id)
      showToast('Commande annulée')
      reload()
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title="Suivi en temps réel" subtitle={store?.name} back />
      <div className="screen">
        {status === 'IN_DELIVERY' && (
          <DeliveryMap
            tall
            origin={{ lat: store.lat, lng: store.lng }}
            destination={dest}
            driver={driverPos}
            etaSeconds={etaSeconds}
          />
        )}

        <div className="card" style={{ marginTop: status === 'IN_DELIVERY' ? 14 : 0, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>{STATUS_ICON[status]}</div>
          <h2 style={{ margin: '6px 0 0' }}>{STATUS_LABELS[status]}</h2>
        </div>

        {showCode && (
          <div className="card" style={{ textAlign: 'center', background: 'var(--green)', color: '#fff' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>Votre code de réception</p>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 6 }}>{order.receptionCode}</div>
            <p style={{ margin: '6px 0 0', fontSize: 13, opacity: 0.9 }}>
              Communiquez ce code au livreur à la remise de la commande.
            </p>
          </div>
        )}

        {driver && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="store-logo" style={{ background: 'var(--green)', width: 48, height: 48, fontSize: 24 }}>🛵</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{driver.name}</strong>
              <div className="muted" style={{ fontSize: 13 }}>{driver.phone}</div>
            </div>
            <a className="btn ghost small" href={`tel:${driver.phone}`} style={{ textDecoration: 'none' }}>📞 Appeler</a>
          </div>
        )}

        {status === 'IN_DELIVERY' && order.scheduledDeliveryAt && (
          <div className="card">
            <p style={{ margin: 0 }}>
              🕒 Livraison prévue vers{' '}
              <strong>
                {new Date(order.scheduledDeliveryAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </strong>
            </p>
            {order.scheduleModified ? (
              <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Créneau déjà modifié une fois.</p>
            ) : (
              <>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>Choisir un autre créneau</span>
                  <input type="datetime-local" value={slot} onChange={(e) => setSlot(e.target.value)} />
                </label>
                <button className="btn outline small" onClick={reschedule} disabled={busy || !slot}>
                  Modifier le créneau (1 seule fois)
                </button>
              </>
            )}
          </div>
        )}

        {status !== 'CANCELLED' && (
          <div className="card">
            <p className="section-title" style={{ marginTop: 0 }}>Progression</p>
            <ul className="timeline">
              {ORDER_FLOW.map((st, i) => {
                const done = i < currentIdx
                const current = i === currentIdx
                return (
                  <li key={st} className={done ? 'done' : current ? 'current' : ''}>
                    <span className="dot">{done ? '✓' : STATUS_ICON[st]}</span>
                    <div>
                      <div className="t-label">{STATUS_LABELS[st]}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {status === 'CANCELLED' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36 }}>❌</div>
            <p style={{ marginBottom: 0 }}>Cette commande a été annulée.</p>
          </div>
        )}

        <div className="card">
          <p className="section-title" style={{ marginTop: 0 }}>Détail de la commande</p>
          <ul className="list-reset">
            {order.items.map((it) => (
              <li key={it.productId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
                <span>{it.emoji} {it.name} <span className="muted">×{it.qty}</span></span>
                <span>{formatFCFA(it.price * it.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="divider" />
          <Row label="Sous-total" value={formatFCFA(order.subtotal)} />
          <Row label="Livraison" value={formatFCFA(order.deliveryFee)} />
          <Row label="Commission (10%)" value={formatFCFA(order.commission)} />
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
          <button className="btn danger" onClick={cancel} disabled={busy}>
            Annuler la commande
          </button>
        )}
      </div>
    </>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 14 }}>
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}
