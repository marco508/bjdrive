import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import { formatFCFA, getCurrentPosition } from '../../lib/geo.js'

export default function ClientHome() {
  const { user } = useApp()
  const nav = useNavigate()
  const firstName = user?.name?.split(' ')[0] || 'bienvenue'

  const [selected, setSelected] = useState(null)
  const [pos, setPos] = useState(null)

  const cats = useAsync(() => api.categories(), [])

  useEffect(() => {
    let alive = true
    getCurrentPosition()
      .then((p) => alive && setPos(p))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const stores = useAsync(
    () => api.stores({ categoryId: selected || undefined, lat: pos?.lat, lng: pos?.lng }),
    [selected, pos]
  )

  return (
    <>
      <TopBar title={`Bonjour, ${firstName} 👋`} subtitle="Où faisons-nous vos courses ?" />
      <div className="screen">
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 4 }}>
          <button
            className={`chip ${!selected ? 'active' : ''}`}
            onClick={() => setSelected(null)}
            style={{ whiteSpace: 'nowrap' }}
          >
            🗂️ Toutes
          </button>
          {(cats.data || []).map((c) => (
            <button
              key={c.id}
              className={`chip ${selected === c.id ? 'active' : ''}`}
              onClick={() => setSelected(c.id)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>

        <p className="section-title">Enseignes vérifiées</p>

        {stores.loading && <Loader />}
        {stores.error && <ErrorBox error={stores.error} onRetry={stores.reload} />}

        {!stores.loading && !stores.error && (stores.data || []).length === 0 && (
          <Empty
            icon="🏪"
            title="Aucune enseigne vérifiée"
            text="Aucune enseigne vérifiée près de vous pour l'instant."
          />
        )}

        {!stores.loading &&
          !stores.error &&
          (stores.data || []).map((s) => (
            <div key={s.id} className="card store-card" onClick={() => nav(`/client/store/${s.id}`)}>
              <div className="store-logo" style={{ background: s.color || 'var(--green)' }}>
                {s.emoji || '🛒'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{s.name}</h3>
                <div className="meta">
                  <span>{s.category?.emoji} {s.category?.name}</span>
                </div>
                <div className="meta" style={{ marginTop: 4 }}>
                  <span>📍 {s.address}</span>
                </div>
                <div className="meta" style={{ marginTop: 6 }}>
                  <span className="badge">🚚 {formatFCFA(s.deliveryFee)} livraison</span>
                  {s.distance != null && (
                    <span className="badge gray">{(s.distance / 1000).toFixed(1)} km</span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 22, color: 'var(--muted)' }}>›</span>
            </div>
          ))}
      </div>
    </>
  )
}
