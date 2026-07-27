import { useNavigate, NavLink } from 'react-router-dom'

export function TopBar({ title, subtitle, back, right }) {
  const nav = useNavigate()
  return (
    <div className="topbar">
      {back && <button className="back" onClick={() => nav(-1)} aria-label="Retour">‹</button>}
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="sub">{subtitle}</p>}
      </div>
      <div className="spacer" />
      {right}
    </div>
  )
}

// Barre d'onglets en mobile, sidebar de navigation en desktop (voir index.css).
function Tabs({ tabs }) {
  return (
    <nav className="tabbar">
      <div className="brand">
        <span className="logo">🛒🛵</span>
        <b>BjDrive</b>
      </div>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="ic">{t.ic}</span>
          {t.label}
        </NavLink>
      ))}
      <div className="side-foot">
        Marketplace de livraison au Bénin
        <br />🇧🇯 Enseignes vérifiées · paiement sécurisé
      </div>
    </nav>
  )
}

export const ClientTabs = () => (
  <Tabs
    tabs={[
      { to: '/client', ic: '🛒', label: 'Enseignes', end: true },
      { to: '/client/orders', ic: '📦', label: 'Commandes' },
      { to: '/client/account', ic: '👤', label: 'Compte' },
    ]}
  />
)

export const ManagerTabs = () => (
  <Tabs
    tabs={[
      { to: '/manager', ic: '📊', label: 'Tableau', end: true },
      { to: '/manager/products', ic: '🏷️', label: 'Produits' },
      { to: '/manager/orders', ic: '🧾', label: 'Commandes' },
      { to: '/manager/store', ic: '🏪', label: 'Enseigne' },
    ]}
  />
)

export const AdminTabs = () => (
  <Tabs
    tabs={[
      { to: '/admin', ic: '📊', label: 'Vue', end: true },
      { to: '/admin/orders', ic: '🧾', label: 'Commandes' },
      { to: '/admin/stores', ic: '✅', label: 'Enseignes' },
      { to: '/admin/drivers', ic: '🛵', label: 'Livreurs' },
      { to: '/admin/finance', ic: '💸', label: 'Finances' },
      { to: '/admin/config', ic: '⚙️', label: 'Réglages' },
    ]}
  />
)

export function Empty({ icon, title, text, children }) {
  return (
    <div className="center-empty">
      <div className="big">{icon}</div>
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

export function Loader({ label = 'Chargement…' }) {
  return <p className="muted" style={{ padding: 16 }}>{label}</p>
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
