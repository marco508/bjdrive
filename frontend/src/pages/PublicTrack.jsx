import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api.js'
import { STATUS_LABELS, STATUS_ICON, ORDER_FLOW } from '../services/constants.js'
import DeliveryMap from '../components/DeliveryMap.jsx'

// Suivi de commande PUBLIC : le proche destinataire au Bénin suit sa livraison
// sans compte, via le lien que le client (souvent à l'étranger) lui a partagé.
export default function PublicTrack() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    api.publicTrack(token).then(setData).catch((e) => setError(e.message))
  }, [token])

  useEffect(() => {
    load()
    // Rafraîchissement doux toutes les 20 s tant que la commande est en cours.
    const id = setInterval(load, 20000)
    return () => clearInterval(id)
  }, [load])

  if (error) {
    return (
      <div className="screen" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 40 }}>🔍</div>
          <p>Ce lien de suivi n'est plus valide.</p>
        </div>
      </div>
    )
  }
  if (!data) {
    return <div className="screen" style={{ maxWidth: 560, margin: '0 auto' }}><p className="muted" style={{ marginTop: 40, textAlign: 'center' }}>Chargement du suivi…</p></div>
  }

  const status = data.status
  const isFinal = ['DELIVERED', 'CANCELLED', 'FAILED'].includes(status)
  const currentIdx = ORDER_FLOW.indexOf(status)
  const origin = data.originLat != null ? { lat: data.originLat, lng: data.originLng } : null
  const dest = { lat: data.destLat, lng: data.destLng }

  return (
    <div className="screen" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', padding: '18px 0 8px' }}>
        <div style={{ fontWeight: 800, color: 'var(--green-dark)', fontSize: 20 }}>🛒🛵 BjDrive</div>
        <div className="muted" style={{ fontSize: 13 }}>Suivi de livraison</div>
      </div>

      {data.recipientName && (
        <div className="card" style={{ background: 'var(--green-soft)' }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Bonjour <strong>{data.recipientName}</strong> — une commande vous est destinée
            {data.destAddress ? <> à <strong>{data.destAddress}</strong></> : null}.
          </p>
        </div>
      )}

      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>{STATUS_ICON[status]}</div>
        <h2 style={{ margin: '6px 0 0' }}>{STATUS_LABELS[status] || status}</h2>
      </div>

      {status === 'IN_DELIVERY' && (
        <DeliveryMap tall origin={origin} destination={dest} />
      )}

      {data.driver && !isFinal && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="store-logo" style={{ background: 'var(--green)', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>🛵</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{data.driver.name}</strong>
            <div className="muted" style={{ fontSize: 13 }}>Votre livreur</div>
          </div>
          {data.driver.phone && <a className="btn ghost small" href={`tel:${data.driver.phone}`} style={{ textDecoration: 'none' }}>Appeler</a>}
        </div>
      )}

      {!isFinal && data.fulfillment !== 'PICKUP' && (
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

      {data.stores?.length > 0 && (
        <div className="card">
          <p className="section-title" style={{ marginTop: 0 }}>{data.stores.length > 1 ? 'Enseignes' : 'Enseigne'}</p>
          <ul className="list-reset">
            {data.stores.map((s, i) => (
              <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
                <span>{s.emoji} {s.name}</span>
                <span className={s.pickedUpAt ? 'badge' : 'badge gray'}>{s.pickedUpAt ? '✓ Récupéré' : 'En préparation'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 16 }}>
        Livraison assurée par BjDrive. Ce suivi se met à jour automatiquement.
      </p>
    </div>
  )
}
