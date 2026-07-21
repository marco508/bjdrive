import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox, StatusBadge } from '../../components/ui.jsx'
import { STATUS_LABELS, STATUS_ICON } from '../../services/constants.js'
import { formatFCFA } from '../../lib/geo.js'

function isToday(iso) {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

const VERIF_BANNERS = {
  PENDING: {
    bg: '#fff7d6',
    color: 'var(--green-dark)',
    text: '⏳ Enseigne en attente de vérification — elle sera visible des clients une fois validée par l’équipe BjDrive.',
  },
  REJECTED: { bg: '#fdeaec', color: 'var(--red)', text: '❌ Enseigne refusée.' },
  VERIFIED: { bg: '#e6f4ea', color: 'var(--green-dark)', text: '✅ Enseigne vérifiée et visible.' },
}

export default function ManagerDashboard() {
  const { logout } = useApp()
  const nav = useNavigate()
  const { data: stores, loading, error, reload } = useAsync(api.myStores)
  const store = stores?.[0] || null

  const orders = useAsync(() => (store ? api.storeOrders(store.id) : Promise.resolve([])), [store?.id])

  const logoutBtn = <button className="pill" onClick={logout}>Quitter</button>

  if (loading) {
    return (
      <>
        <TopBar title="Espace manager" subtitle="Tableau de bord" right={logoutBtn} />
        <div className="screen"><Loader /></div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <TopBar title="Espace manager" subtitle="Tableau de bord" right={logoutBtn} />
        <div className="screen"><ErrorBox error={error} onRetry={reload} /></div>
      </>
    )
  }

  if (!store) {
    return (
      <>
        <TopBar title="Espace manager" subtitle="Tableau de bord" right={logoutBtn} />
        <div className="screen">
          <Empty icon="🏪" title="Bienvenue !" text="Créez votre enseigne pour commencer.">
            <button className="btn" style={{ maxWidth: 260, margin: '16px auto 0' }} onClick={() => nav('/manager/store')}>
              ➕ Créer mon enseigne
            </button>
          </Empty>
        </div>
      </>
    )
  }

  const list = orders.data || []
  const active = list.filter(
    (o) => !['DELIVERED', 'CANCELLED', 'PENDING_PAYMENT'].includes(o.status),
  )
  const todays = list.filter((o) => isToday(o.createdAt))
  const partAmount = (o) => o.part?.payoutAmount ?? (o.items || []).reduce((s, i) => s + i.price * i.qty, 0)
  const revenue = todays
    .filter((o) => o.status === 'DELIVERED')
    .reduce((s, o) => s + partAmount(o), 0)
  const recent = [...list]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)

  const banner = VERIF_BANNERS[store.status]

  return (
    <>
      <TopBar title={store.name || 'Espace manager'} subtitle="Tableau de bord" right={logoutBtn} />
      <div className="screen">
        {banner && (
          <div className="card" style={{ background: banner.bg, color: banner.color, fontSize: 14 }}>
            {banner.text}
          </div>
        )}

        <div className="kpi-grid">
          <div className="kpi"><div className="n">{active.length}</div><div className="l">Commandes actives</div></div>
          <div className="kpi"><div className="n">{todays.length}</div><div className="l">Commandes du jour</div></div>
          <div className="kpi"><div className="n">{store._count?.products ?? 0}</div><div className="l">Produits</div></div>
          <div className="kpi"><div className="n">{formatFCFA(revenue)}</div><div className="l">CA livré (jour)</div></div>
        </div>

        <p className="section-title">Commandes récentes</p>
        {orders.loading && <Loader />}
        <ErrorBox error={orders.error} onRetry={orders.reload} />
        {!orders.loading && !orders.error && recent.length === 0 && (
          <p className="muted">Aucune commande pour le moment.</p>
        )}
        {recent.map((o) => (
          <div
            key={o.id}
            className="card"
            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
            onClick={() => nav('/manager/orders')}
          >
            <div className="store-logo" style={{ background: 'var(--green)', width: 44, height: 44, fontSize: 20 }}>
              {STATUS_ICON[o.status]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div><StatusBadge status={o.status} labels={STATUS_LABELS} icons={STATUS_ICON} /></div>
            </div>
            <strong>{formatFCFA(partAmount(o))}</strong>
          </div>
        ))}

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn outline" onClick={() => nav('/manager/products')}>🏷️ Mes produits</button>
          <button className="btn ghost" onClick={() => nav('/manager/store')}>🏪 Mon enseigne</button>
        </div>
      </div>
    </>
  )
}
