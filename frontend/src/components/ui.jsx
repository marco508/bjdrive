import { useNavigate, NavLink } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import Icon from './Icon.jsx'

// Bandeau de page. La DÉCONNEXION est toujours accessible ici, quel que soit
// le rôle et l'écran (en plus de la sidebar desktop).
export function TopBar({ title, subtitle, back, right }) {
  const nav = useNavigate()
  const { user, logout } = useApp()
  return (
    <div className="topbar">
      {back && <button className="back" onClick={() => nav(-1)} aria-label="Retour">‹</button>}
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="sub">{subtitle}</p>}
      </div>
      <div className="spacer" />
      {right}
      {user && (
        <button
          className="pill logout-pill"
          onClick={() => { logout(); nav('/') }}
          title="Se déconnecter"
          aria-label="Se déconnecter"
        >
          <Icon name="logout" size={16} />
        </button>
      )}
    </div>
  )
}

// Barre d'onglets en mobile, sidebar de navigation en desktop (voir index.css).
// Icônes Material (SVG) — la déconnexion est toujours visible en pied de sidebar.
function Tabs({ tabs }) {
  const { logout } = useApp()
  return (
    <nav className="tabbar">
      <div className="brand">
        <span className="logo">🛒🛵</span>
        <b>BjDrive</b>
      </div>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ic"><Icon name={t.icon} size={21} /></span>
          {t.label}
        </NavLink>
      ))}
      <button className="side-logout" onClick={logout}>
        <Icon name="logout" size={19} />
        Se déconnecter
      </button>
      <div className="side-foot">
        Marketplace de livraison au Bénin
        <br />Enseignes vérifiées · paiement sécurisé
      </div>
    </nav>
  )
}

export const ClientTabs = () => (
  <Tabs
    tabs={[
      { to: '/client', icon: 'storefront', label: 'Enseignes', end: true },
      { to: '/client/orders', icon: 'receipt', label: 'Commandes' },
      { to: '/client/account', icon: 'person', label: 'Compte' },
    ]}
  />
)

export const ManagerTabs = () => (
  <Tabs
    tabs={[
      { to: '/manager', icon: 'dashboard', label: 'Tableau', end: true },
      { to: '/manager/products', icon: 'barcode', label: 'Produits' },
      { to: '/manager/orders', icon: 'receipt', label: 'Commandes' },
      { to: '/manager/store', icon: 'storefront', label: 'Enseigne' },
    ]}
  />
)

export const AdminTabs = () => (
  <Tabs
    tabs={[
      { to: '/admin', icon: 'dashboard', label: 'Vue', end: true },
      { to: '/admin/orders', icon: 'receipt', label: 'Commandes' },
      { to: '/admin/stores', icon: 'verified', label: 'Enseignes' },
      { to: '/admin/drivers', icon: 'moped', label: 'Livreurs' },
      { to: '/admin/finance', icon: 'payments', label: 'Finances' },
      { to: '/admin/config', icon: 'settings', label: 'Réglages' },
    ]}
  />
)

// État vide : icône Material dans une pastille (iconName), avec repli emoji (icon).
export function Empty({ icon, iconName, title, text, children }) {
  return (
    <div className="center-empty">
      <div className="empty-disc">
        {iconName ? <Icon name={iconName} size={34} color="var(--green)" /> : <span className="big">{icon}</span>}
      </div>
      <h3 style={{ margin: '0 0 6px' }}>{title}</h3>
      {text && <p className="muted" style={{ marginTop: 0 }}>{text}</p>}
      {children}
    </div>
  )
}

export function StatusBadge({ status, labels, icons }) {
  const cls = status === 'DELIVERED' ? 'badge' : status === 'CANCELLED' ? 'badge red' : 'badge yellow'
  return <span className={cls}>{icons[status]} {labels[status]}</span>
}

// Squelettes de chargement animés (shimmer) — plus de « Chargement… » textuel.
// kind: 'cards' (défaut, listes), 'kpi' (grilles de chiffres), 'rows' (lignes fines).
export function Loader({ kind = 'cards', count = 3 }) {
  if (kind === 'kpi') {
    return (
      <div className="kpi-grid" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="kpi">
            <div className="sk" style={{ width: '55%', height: 24, marginBottom: 8 }} />
            <div className="sk" style={{ width: '80%', height: 11 }} />
          </div>
        ))}
      </div>
    )
  }
  if (kind === 'rows') {
    return (
      <div className="card" aria-busy="true">
        {Array.from({ length: count * 2 }, (_, i) => (
          <div key={i} className="sk" style={{ height: 14, marginBottom: 12, width: `${88 - (i % 3) * 14}%` }} />
        ))}
      </div>
    )
  }
  return (
    <div aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div className="sk" style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="sk" style={{ width: '55%', height: 15, marginBottom: 8 }} />
            <div className="sk" style={{ width: '80%', height: 11 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="card" style={{ background: '#fdeaec', color: 'var(--red)' }}>
      <div style={{ fontSize: 14 }}>{error}</div>
      {onRetry && <button className="btn ghost small" style={{ marginTop: 8 }} onClick={onRetry}>Réessayer</button>}
    </div>
  )
}
