import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { useAsync } from '../../components/useApi.js'
import { api } from '../../services/api.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import { getCurrentPosition } from '../../lib/geo.js'

export default function ClientHome() {
  const { user } = useApp()
  const nav = useNavigate()
  const [pos, setPos] = useState(null)
  const [denied, setDenied] = useState(false)
  const [selected, setSelected] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    getCurrentPosition()
      .then((p) => setPos({ lat: p.lat, lng: p.lng }))
      .catch(() => setDenied(true))
  }, [])

  const cats = useAsync(() => api.categories(), [])
  const stores = useAsync(
    () => api.stores({ categoryId: selected || undefined, lat: pos?.lat, lng: pos?.lng }),
    [selected, pos],
  )

  function submitSearch(e) {
    e.preventDefault()
    if (q.trim().length >= 2) nav(`/client/search?q=${encodeURIComponent(q.trim())}`)
  }

  const list = stores.data || []

  return (
    <>
      <TopBar title={`Bonjour, ${user?.name?.split(' ')[0] || 'bienvenue'} 👋`} subtitle="Où faisons-nous vos courses ?" />
      <div className="screen">
        <form onSubmit={submitSearch} style={{ marginBottom: 12 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔎 Rechercher un produit (ex : riz, huile...)"
            aria-label="Rechercher un produit"
          />
        </form>

        {denied && (
          <div className="card" style={{ background: '#fff7d6', color: '#8a6d00', fontSize: 13 }}>
            📍 Activez la localisation pour voir les enseignes <b>les plus proches de vous</b>.
            <button className="btn ghost small" style={{ marginTop: 8 }}
              onClick={() => getCurrentPosition().then((p) => { setPos({ lat: p.lat, lng: p.lng }); setDenied(false) }).catch(() => {})}>
              Réessayer
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0 10px' }}>
          <Chip active={selected === ''} onClick={() => setSelected('')} label="Toutes" emoji="🧺" />
          {(cats.data || []).map((c) => (
            <Chip key={c.id} active={selected === c.id} onClick={() => setSelected(c.id)} label={c.name} emoji={c.emoji} />
          ))}
        </div>

        <p className="section-title">{pos ? 'Enseignes les plus proches' : 'Enseignes vérifiées'}</p>
        {stores.loading && <Loader />}
        <ErrorBox error={stores.error} onRetry={stores.reload} />
        {!stores.loading && list.length === 0 && (
          <Empty icon="🏪" title="Aucune enseigne" text="Aucune enseigne vérifiée disponible pour l'instant." />
        )}
        <div className="grid-cards">
        {list.map((s) => (
          <div key={s.id} className="card store-card" onClick={() => nav(`/client/store/${s.id}`)}>
            <div className="store-logo" style={{ background: s.color || 'var(--green)' }}>{s.emoji || '🛒'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3>{s.name}</h3>
              <div className="meta"><span>{s.category?.emoji} {s.category?.name} · 📍 {s.address}</span></div>
              {s.distance != null && (
                <div className="meta" style={{ marginTop: 4 }}>
                  <span className="badge">à {(s.distance / 1000).toFixed(1)} km</span>
                </div>
              )}
            </div>
            <span style={{ fontSize: 22, color: 'var(--muted)' }}>›</span>
          </div>
        ))}
        </div>
      </div>
    </>
  )
}

function Chip({ active, onClick, label, emoji }) {
  return (
    <button
      onClick={onClick}
      className="chip"
      style={{
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        border: 'none',
        background: active ? 'var(--green)' : 'var(--green-soft)',
        color: active ? '#fff' : 'var(--green-dark)',
      }}
    >
      {emoji} {label}
    </button>
  )
}
