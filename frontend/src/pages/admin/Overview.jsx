import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Loader, ErrorBox } from '../../components/ui.jsx'
import { formatFCFA } from '../../lib/geo.js'

export default function AdminOverview() {
  const { logout } = useApp()
  const nav = useNavigate()
  const { data, loading, error, reload } = useAsync(api.adminOverview, [])

  const logoutBtn = <button className="pill" onClick={logout}>Quitter</button>

  return (
    <>
      <TopBar title="BjDrive — Admin" subtitle="Vue d'ensemble" right={logoutBtn} />
      <div className="screen">
        {loading && <Loader />}
        <ErrorBox error={error} onRetry={reload} />

        {!loading && !error && data && (
          <>
            <div className="kpi-grid">
              <div className="kpi">
                <div className="n">{data.verifiedStores ?? 0}</div>
                <div className="l">Enseignes vérifiées</div>
              </div>
              <div className="kpi">
                <div className="n">{data.pendingStores ?? 0}</div>
                <div className="l">En attente</div>
              </div>
              <div className="kpi">
                <div className="n">{data.users ?? 0}</div>
                <div className="l">Utilisateurs</div>
              </div>
              <div className="kpi">
                <div className="n">{data.drivers ?? 0}</div>
                <div className="l">Livreurs</div>
              </div>
              <div className="kpi">
                <div className="n">{data.orders ?? 0}</div>
                <div className="l">Commandes</div>
              </div>
              <div className="kpi">
                <div className="n">{data.deliveredOrders ?? 0}</div>
                <div className="l">Livrées</div>
              </div>
            </div>

            {data.pendingStores > 0 && (
              <div
                className="card"
                style={{ background: '#fff7d6', color: 'var(--green-dark)' }}
              >
                <p className="section-title" style={{ marginTop: 0 }}>
                  ⏳ Enseignes à vérifier
                </p>
                <p style={{ margin: '0 0 12px', fontSize: 14 }}>
                  {data.pendingStores} enseigne(s) en attente de vérification.
                </p>
                <button className="btn yellow" onClick={() => nav('/admin/stores')}>
                  Vérifier {data.pendingStores} enseigne(s)
                </button>
              </div>
            )}

            <p className="section-title">Finances</p>
            <div className="kpi-grid">
              <div className="kpi">
                <div className="n">{formatFCFA(data.grossVolume)}</div>
                <div className="l">Volume total</div>
              </div>
              <div
                className="kpi"
                style={{ background: '#e6f4ea', color: 'var(--green-dark)' }}
              >
                <div className="n" style={{ color: 'var(--green)' }}>
                  {formatFCFA(data.platformRevenue)}
                </div>
                <div className="l">Revenus plateforme (10%)</div>
              </div>
              <div className="kpi">
                <div className="n">{formatFCFA(data.storesPayout)}</div>
                <div className="l">Reversé aux enseignes</div>
              </div>
              <div className="kpi">
                <div className="n">{formatFCFA(data.driversPayout)}</div>
                <div className="l">Reversé aux livreurs</div>
              </div>
            </div>

            <div className="card">
              <p className="section-title" style={{ marginTop: 0 }}>
                💡 Modèle de commission
              </p>
              <p className="muted" style={{ margin: 0, fontSize: 14 }}>
                La commission de 10% est ajoutée au total payé par le client et
                revient à la plateforme.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
