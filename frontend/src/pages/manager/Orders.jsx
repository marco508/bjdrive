import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox, StatusBadge } from '../../components/ui.jsx'
import { STATUS_LABELS, STATUS_ICON } from '../../services/constants.js'
import { formatFCFA } from '../../lib/geo.js'

export default function ManagerOrders() {
  const nav = useNavigate()
  const storesQ = useAsync(api.myStores)
  const store = storesQ.data?.[0] || null

  const ordersQ = useAsync(() => (store ? api.storeOrders(store.id) : Promise.resolve([])), [store?.id])
  const orders = [...(ordersQ.data || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  if (storesQ.loading) {
    return (
      <>
        <TopBar title="Commandes" />
        <div className="screen"><Loader /></div>
      </>
    )
  }

  if (storesQ.error) {
    return (
      <>
        <TopBar title="Commandes" />
        <div className="screen"><ErrorBox error={storesQ.error} onRetry={storesQ.reload} /></div>
      </>
    )
  }

  if (!store) {
    return (
      <>
        <TopBar title="Commandes" />
        <div className="screen">
          <Empty icon="🏪" title="Créez votre enseigne" text="Vos commandes entrantes apparaîtront ici.">
            <button className="btn" style={{ maxWidth: 240, margin: '14px auto 0' }} onClick={() => nav('/manager/store')}>
              Créer mon enseigne
            </button>
          </Empty>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title="Commandes" subtitle={store.name} />
      <div className="screen">
        {ordersQ.loading && <Loader />}
        <ErrorBox error={ordersQ.error} onRetry={ordersQ.reload} />

        {!ordersQ.loading && !ordersQ.error && orders.length === 0 && (
          <Empty icon="🧾" title="Aucune commande" text="Les nouvelles commandes des clients s’afficheront ici." />
        )}

        {orders.map((o) => {
          const itemCount = (o.items || []).reduce((s, i) => s + i.qty, 0)
          return (
            <div key={o.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  {new Date(o.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {itemCount} article{itemCount > 1 ? 's' : ''}
                </div>
                <StatusBadge status={o.status} labels={STATUS_LABELS} icons={STATUS_ICON} />
              </div>

              <ul className="list-reset" style={{ margin: '10px 0' }}>
                {(o.items || []).map((it) => (
                  <li key={it.productId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '3px 0' }}>
                    <span>{it.emoji} {it.name} <span className="muted">×{it.qty}</span></span>
                    <span>{formatFCFA(it.price * it.qty)}</span>
                  </li>
                ))}
              </ul>

              {o.destAddress && <div className="muted" style={{ fontSize: 13 }}>📍 {o.destAddress}</div>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 13 }}>Total</span>
                <strong className="price-total" style={{ fontSize: 18 }}>{formatFCFA(o.total)}</strong>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
