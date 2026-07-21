import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox, StatusBadge } from '../../components/ui.jsx'
import { STATUS_LABELS, STATUS_ICON } from '../../services/constants.js'
import { formatFCFA } from '../../lib/geo.js'

export default function ClientOrders() {
  const nav = useNavigate()
  const { data, loading, error, reload } = useAsync(() => api.myOrders(), [])

  return (
    <>
      <TopBar title="Mes commandes" />
      <div className="screen">
        {loading && <Loader />}
        {error && <ErrorBox error={error} onRetry={reload} />}

        {!loading && !error && (data || []).length === 0 && (
          <Empty icon="📦" title="Aucune commande" text="Vos commandes et leur suivi apparaîtront ici.">
            <button className="btn" style={{ maxWidth: 240, margin: '14px auto 0' }} onClick={() => nav('/client')}>
              Commander maintenant
            </button>
          </Empty>
        )}

        {!loading &&
          !error &&
          (data || []).map((o) => {
            const count = (o.items || []).reduce((s, i) => s + i.qty, 0)
            return (
              <div key={o.id} className="card store-card" onClick={() => nav(`/client/track/${o.id}`)}>
                <div className="store-logo" style={{ background: 'var(--green)' }}>{STATUS_ICON[o.status]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{o.store?.name}</h3>
                  <div className="meta"><span>{count} articles · {formatFCFA(o.total)}</span></div>
                  <div style={{ marginTop: 6 }}>
                    <StatusBadge status={o.status} labels={STATUS_LABELS} icons={STATUS_ICON} />
                  </div>
                </div>
                <span style={{ fontSize: 22, color: 'var(--muted)' }}>›</span>
              </div>
            )
          })}
      </div>
    </>
  )
}
