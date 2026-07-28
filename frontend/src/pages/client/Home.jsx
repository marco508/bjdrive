import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { useAsync } from '../../components/useApi.js'
import { api } from '../../services/api.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import { getCurrentPosition, formatFCFA } from '../../lib/geo.js'
import { imageSrc } from '../../config.js'

// Bannières promotionnelles de l'accueil (mises en avant produit BjDrive).
const PROMOS = [
  {
    key: 'delivery',
    cls: 'g1',
    icon: 'localShipping',
    title: 'Livré chez vous, suivi en direct',
    text: 'Suivez votre livreur sur la carte, minute par minute, jusqu’à votre porte.',
    cta: 'Je commande',
    to: null, // reste sur la page (scroll vers les enseignes)
  },
  {
    key: 'cash',
    cls: 'g2',
    icon: 'payments',
    title: 'Payez comme vous voulez',
    text: 'Mobile Money, carte bancaire… ou en espèces à la réception.',
    cta: 'Voir les enseignes',
    to: null,
  },
  {
    key: 'pickup',
    cls: 'g3',
    icon: 'storefront',
    title: 'Retrait sur place : 0 F de livraison',
    text: 'Commandez à l’avance, passez chercher — votre panier vous attend.',
    cta: 'Essayer',
    to: null,
  },
  {
    key: 'multi',
    cls: 'g4',
    icon: 'shoppingCart',
    title: 'Un panier, plusieurs enseignes',
    text: 'Supermarché + pharmacie + kiosque : un seul livreur fait toute la tournée.',
    cta: 'Composer mon panier',
    to: null,
  },
]

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
  // Personnalisation : proposer de recommander là où le client a déjà commandé.
  const ordersQ = useAsync(() => api.myOrders().catch(() => []), [])
  const reorder = useMemo(() => {
    const delivered = (ordersQ.data || []).filter((o) => o.status === 'DELIVERED' && o.stores?.[0]?.store)
    if (delivered.length === 0) return null
    const last = delivered[0]
    return { store: last.stores[0].store, total: last.total, count: delivered.length }
  }, [ordersQ.data])

  function submitSearch(e) {
    e.preventDefault()
    if (q.trim().length >= 2) nav(`/client/search?q=${encodeURIComponent(q.trim())}`)
  }

  const list = stores.data || []

  return (
    <>
      <TopBar title={`Bonjour, ${user?.name?.split(' ')[0] || 'bienvenue'} 👋`} subtitle="Où faisons-nous vos courses ?" />
      <div className="screen">
        {/* Recherche produit multi-enseignes */}
        <form onSubmit={submitSearch} className="home-search">
          <Icon name="search" size={20} color="var(--muted)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un produit (riz, huile, savon…)"
            aria-label="Rechercher un produit"
          />
          {q.trim().length >= 2 && <button className="btn small">Chercher</button>}
        </form>

        {/* Bannières promotionnelles */}
        <div className="promo-scroller" aria-label="Offres et services BjDrive">
          {reorder && (
            <div className="promo g1" onClick={() => nav(`/client/store/${reorder.store.id}`)}>
              <div>
                <h3>Recommander chez {reorder.store.name} ?</h3>
                <p>Vous avez déjà commandé {reorder.count > 1 ? `${reorder.count} fois` : 'ici'} — vos habitudes vous attendent.</p>
              </div>
              <span className="promo-cta">Voir la boutique ›</span>
            </div>
          )}
          {PROMOS.map((p) => (
            <div key={p.key} className={`promo ${p.cls}`} onClick={() => window.scrollTo({ top: 420, behavior: 'smooth' })}>
              <div>
                <div style={{ marginBottom: 8, opacity: 0.9 }}><Icon name={p.icon} size={22} color="#fff" /></div>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
              <span className="promo-cta">{p.cta} ›</span>
            </div>
          ))}
        </div>

        {denied && (
          <div className="card" style={{ background: '#fff7d6', color: '#8a6d00', fontSize: 13 }}>
            Activez la localisation pour voir les enseignes <b>les plus proches de vous</b>.
            <button className="btn ghost small" style={{ marginTop: 8 }}
              onClick={() => getCurrentPosition().then((p) => { setPos({ lat: p.lat, lng: p.lng }); setDenied(false) }).catch(() => {})}>
              Réessayer
            </button>
          </div>
        )}

        {/* Catégories */}
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
          <Empty iconName="storefront" title="Aucune enseigne" text="Aucune enseigne vérifiée disponible pour l'instant." />
        )}
        <div className="grid-cards">
        {list.map((s) => (
          <div key={s.id} className="card store-card" onClick={() => nav(`/client/store/${s.id}`)}>
            {s.imageUrl ? (
              <img src={imageSrc(s.imageUrl)} alt={s.name} className="store-logo" style={{ objectFit: 'cover' }} />
            ) : (
              <div className="store-logo" style={{ background: s.color || 'var(--green)' }}>{s.emoji || '🛒'}</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3>{s.name}</h3>
              <div className="meta"><span>{s.category?.emoji} {s.category?.name} · {s.address}</span></div>
              {s.distance != null && (
                <div className="meta" style={{ marginTop: 4 }}>
                  <span className="badge">à {(s.distance / 1000).toFixed(1)} km</span>
                </div>
              )}
            </div>
            <span style={{ color: 'var(--muted)', display: 'flex' }}><Icon name="chevronRight" size={22} /></span>
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
      className={`chip ${active ? 'active' : ''}`}
      style={{ whiteSpace: 'nowrap' }}
    >
      {emoji} {label}
    </button>
  )
}
