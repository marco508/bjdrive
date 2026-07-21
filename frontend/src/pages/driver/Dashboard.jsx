import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import { formatFCFA, getCurrentPosition, estimateEta, haversine } from '../../lib/geo.js'
import DeliveryMap from '../../components/DeliveryMap.jsx'

export default function DriverDashboard() {
  const { user, logout, showToast } = useApp()

  const [pos, setPos] = useState(null)
  const [sharing, setSharing] = useState(false)

  const watchId = useRef(null)
  const lastSent = useRef(null) // { pos:{lat,lng}, time:number }

  // Position GPS initiale au montage.
  useEffect(() => {
    let alive = true
    getCurrentPosition()
      .then((p) => { if (alive) setPos({ lat: p.lat, lng: p.lng }) })
      .catch(() => showToast('Position GPS indisponible. Activez la localisation.'))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nettoyage du watch au démontage.
  useEffect(() => () => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  const myState = useAsync(api.myDeliveries, [])
  const md = myState.data
  const avState = useAsync(
    () => (pos ? api.availableDeliveries(pos.lat, pos.lng) : Promise.resolve([])),
    [pos]
  )

  async function reloadAll() {
    await Promise.all([myState.reload(), avState.reload()])
  }

  // Envoi throttlé de la position au serveur (économie de data).
  function maybeSend(loc) {
    const now = Date.now()
    const last = lastSent.current
    const moved = last ? haversine(last.pos, loc) : Infinity
    const elapsed = last ? now - last.time : Infinity
    if (elapsed > 12000 || moved > 20) {
      lastSent.current = { pos: loc, time: now }
      api.sendLocation(loc.lat, loc.lng).catch(() => {})
    }
  }

  async function toggleSharing() {
    if (sharing) {
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current)
        watchId.current = null
      }
      lastSent.current = null
      setSharing(false)
      try { await api.setAvailability(false) } catch { /* ignore */ }
      return
    }
    if (!('geolocation' in navigator)) {
      showToast('GPS indisponible sur cet appareil.')
      return
    }
    try { await api.setAvailability(true) } catch { /* ignore */ }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude }
        setPos(loc)
        maybeSend(loc)
      },
      () => showToast('Position GPS refusée.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    )
    setSharing(true)
    showToast('Partage de position activé 📡')
  }

  async function enableLocation() {
    try {
      const p = await getCurrentPosition()
      setPos({ lat: p.lat, lng: p.lng })
    } catch {
      showToast('Impossible d’obtenir la position GPS.')
    }
  }

  async function pickup(orderId, storeId) {
    try {
      const r = await api.pickupStore(orderId, storeId)
      showToast(r?.allPickedUp ? 'Tout récupéré — en route ! 🛵' : 'Retrait enregistré 🏪')
      await reloadAll()
    } catch (e) {
      showToast(e.message || 'Erreur lors du retrait.')
    }
  }

  async function complete(orderId, code) {
    try {
      await api.completeDelivery(orderId, code)
      showToast('Commande livrée ✅ Bravo !')
      await reloadAll()
    } catch (e) {
      showToast(e.message || 'Code de réception incorrect.')
    }
  }

  async function accept(orderId) {
    try {
      await api.acceptDelivery(orderId)
      showToast('Livraison acceptée 🛵 En route !')
      await reloadAll()
    } catch (e) {
      showToast(e.message || 'Livraison déjà prise ou plafond atteint.')
    }
  }

  const deliveries = md?.deliveries || []
  const active = deliveries.filter((d) =>
    ['AWAITING_PICKUP', 'IN_DELIVERY'].includes(d.order?.status)
  )
  const hasInDelivery = active.some((d) => d.order?.status === 'IN_DELIVERY')
  const remaining = md?.remaining ?? 0
  const capReached = remaining <= 0

  return (
    <>
      <TopBar
        title={`Livreur · ${user?.name?.split(' ')[0] || ''}`}
        subtitle="Zémidjan"
        right={<button className="pill" onClick={logout}>Quitter</button>}
      />
      <div className="screen">
        {/* Résumé du jour */}
        {myState.loading && !md && <Loader label="Chargement de vos livraisons…" />}
        <ErrorBox error={myState.error} onRetry={myState.reload} />
        {md && (
          <div className="card">
            <p className="section-title" style={{ marginTop: 0 }}>Aujourd&rsquo;hui</p>
            <div className="kpi-grid">
              <div className="kpi">
                <div className="n">{md.count}/{md.maxPerDay}</div>
                <div className="l">Livraisons du jour</div>
              </div>
              <div className="kpi">
                <div className="n">{md.remaining}</div>
                <div className="l">Restantes</div>
              </div>
              <div className="kpi">
                <div className="n">{formatFCFA(md.potentialEarnings)}</div>
                <div className="l">Gains potentiels</div>
              </div>
              <div className="kpi">
                <div className="n">{formatFCFA(md.confirmedEarnings)}</div>
                <div className="l">Gains confirmés</div>
              </div>
            </div>
            <div className="divider" />
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 13 }}>
                {sharing ? '📡 Position partagée en direct' : 'Partage de position désactivé'}
              </span>
              <button
                className={`btn small ${sharing ? 'danger' : 'outline'}`}
                onClick={toggleSharing}
              >
                {sharing ? 'Arrêter le partage' : '📡 Partager ma position'}
              </button>
            </div>
            {hasInDelivery && !sharing && (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                💡 Une livraison est en cours : activez le partage pour que le client vous suive.
              </div>
            )}
          </div>
        )}

        {/* Livraisons en cours */}
        {active.length > 0 && (
          <>
            <p className="section-title">
              Livraison{active.length > 1 ? 's' : ''} en cours
            </p>
            {active.map((d) => (
              <ActiveDelivery
                key={d.id}
                d={d}
                pos={pos}
                onPickup={(storeId) => pickup(d.order.id, storeId)}
                onComplete={(code) => complete(d.order.id, code)}
              />
            ))}
          </>
        )}

        {/* Commandes disponibles */}
        <p className="section-title">Commandes à récupérer près de vous</p>
        {!pos ? (
          <div className="card">
            <p style={{ marginTop: 0 }}>Activez votre position pour voir les commandes proches.</p>
            <button className="btn" onClick={enableLocation}>📍 Activer ma position</button>
          </div>
        ) : (
          <>
            {avState.loading && !avState.data && <Loader label="Recherche de commandes…" />}
            <ErrorBox error={avState.error} onRetry={avState.reload} />
            {capReached && (avState.data?.length > 0) && (
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                Plafond du jour atteint (5)
              </div>
            )}
            {!avState.loading && !avState.error && (avState.data?.length || 0) === 0 && (
              <Empty
                icon="🛵"
                title="Rien pour l'instant"
                text="Les commandes payées proches de vous apparaîtront ici."
              />
            )}
            {(avState.data || []).map((a) => (
              <div key={a.id} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <strong>{a.stores?.length > 1 ? `${a.stores.length} enseignes` : a.stores?.[0]?.name}</strong>
                  <span className="badge yellow">Gain {formatFCFA(a.earnings)}</span>
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {(a.stores || []).map((s) => s.name).join(' · ')}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>📍 {a.destAddress}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  📦 {a.itemCount} articles · 🛣️ à {(a.distanceToStore / 1000).toFixed(1)} km
                </div>
                <button
                  className="btn small"
                  style={{ marginTop: 10 }}
                  disabled={capReached}
                  onClick={() => accept(a.id)}
                >
                  Prendre cette livraison
                </button>
                {capReached && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Plafond du jour atteint (5)
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}

function ActiveDelivery({ d, pos, onPickup, onComplete }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const order = d.order
  const stores = order.stores || []
  const dest = { lat: order.destLat, lng: order.destLng }
  const origin = order.originLat != null ? { lat: order.originLat, lng: order.originLng }
    : stores[0]?.store ? { lat: stores[0].store.lat, lng: stores[0].store.lng } : null

  async function submit() {
    if (busy) return
    setBusy(true)
    try { await onComplete(code.trim()) } finally { setBusy(false) }
  }
  async function doPickup(storeId) {
    if (busy) return
    setBusy(true)
    try { await onPickup(storeId) } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <strong>{stores.length > 1 ? `Tournée · ${stores.length} enseignes` : stores[0]?.store?.name}</strong>
        <span className="badge yellow">À encaisser {formatFCFA(order.total)}</span>
      </div>
      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>📍 {order.destAddress}</div>
      {order.destNote && (
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>📝 {order.destNote}</div>
      )}

      {order.status === 'AWAITING_PICKUP' && (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 6px' }}>Récupérez dans chaque enseigne :</p>
          {stores.map((os) => {
            const items = (order.items || []).filter((i) => i.storeId === os.storeId)
            const summary = items.map((i) => `${i.emoji || ''} ${i.qty}× ${i.name}`.trim()).join(' · ')
            return (
              <div key={os.storeId} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{os.store?.emoji} {os.store?.name}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>{os.store?.address}</div>
                  </div>
                  {os.pickedUpAt ? (
                    <span className="badge">✓ Récupéré</span>
                  ) : (
                    <button className="btn small" disabled={busy} onClick={() => doPickup(os.storeId)}>Récupéré</button>
                  )}
                </div>
                {summary && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>📦 {summary}</div>}
              </div>
            )
          })}
        </div>
      )}

      {order.status === 'IN_DELIVERY' && (
        <>
          <div style={{ marginTop: 12 }}>
            <DeliveryMap
              origin={origin}
              destination={dest}
              driver={pos}
              etaSeconds={pos ? estimateEta(pos, dest).seconds : null}
              tall
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Code de réception"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Demandez au client son code de réception.
            </div>
            <button
              className="btn"
              style={{ marginTop: 10 }}
              disabled={busy || !code}
              onClick={submit}
            >
              ✅ Valider la livraison
            </button>
          </div>
        </>
      )}
    </div>
  )
}
