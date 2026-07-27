import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar } from '../../components/ui.jsx'
import { pushSupported, getPushStatus, enablePush, disablePush } from '../../lib/push.js'
import { resetOnboarding } from '../../components/Onboarding.jsx'
import { formatFCFA } from '../../lib/geo.js'

export default function Account() {
  const { user, logout, showToast } = useApp()
  const nav = useNavigate()
  const [pushStatus, setPushStatus] = useState('unsupported')
  const statsQ = useAsync(api.myStats, [])
  const stats = statsQ.data

  useEffect(() => {
    getPushStatus().then(setPushStatus).catch(() => {})
  }, [])

  function handleLogout() {
    logout()
    nav('/')
  }

  async function togglePush() {
    try {
      if (pushStatus === 'subscribed') {
        await disablePush()
        setPushStatus('ready')
        showToast('Notifications désactivées')
      } else {
        await enablePush()
        setPushStatus('subscribed')
        showToast('Notifications activées 🔔')
      }
    } catch (e) {
      showToast(e.message)
    }
  }

  return (
    <>
      <TopBar title="Mon compte" />
      <div className="screen">
        <div className="card" style={{ textAlign: 'center' }}>
          <div
            className="store-logo"
            style={{ background: 'var(--green)', margin: '0 auto 10px', width: 64, height: 64, fontSize: 30 }}
          >
            👤
          </div>
          <h2 style={{ margin: '0 0 2px' }}>{user?.name}</h2>
          <p className="muted" style={{ margin: 0 }}>{user?.email}</p>
          {user?.phone && <p className="muted" style={{ margin: '2px 0 0' }}>{user.phone}</p>}
        </div>

        {/* Mes habitudes d'achat */}
        {stats && stats.totalOrders > 0 && (
          <>
            <p className="section-title">📊 Mes habitudes</p>
            <div className="kpi-grid">
              <div className="kpi">
                <div className="n">{stats.totalOrders}</div>
                <div className="l">Commandes livrées</div>
              </div>
              <div className="kpi">
                <div className="n">{formatFCFA(stats.totalSpent)}</div>
                <div className="l">Total dépensé</div>
              </div>
              <div className="kpi">
                <div className="n">{formatFCFA(stats.avgBasket)}</div>
                <div className="l">Panier moyen</div>
              </div>
              <div className="kpi">
                <div className="n">{stats.topStores[0]?.emoji || '🏪'}</div>
                <div className="l">{stats.topStores[0]?.name || '—'}</div>
              </div>
            </div>

            {stats.topProducts.length > 0 && (
              <div className="card">
                <p className="section-title" style={{ marginTop: 0 }}>🏆 Vos produits les plus commandés</p>
                <ul className="list-reset">
                  {stats.topProducts.map((p, i) => (
                    <li key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
                      <span>{['🥇', '🥈', '🥉', '4.', '5.'][i]} {p.emoji} {p.name} <span className="muted">×{p.qty}</span></span>
                      <span className="muted">{formatFCFA(p.spent)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {stats.topStores.length > 0 && (
              <div className="card">
                <p className="section-title" style={{ marginTop: 0 }}>🏪 Vos enseignes préférées</p>
                <ul className="list-reset">
                  {stats.topStores.map((s) => (
                    <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 14 }}>
                      <span>{s.emoji} {s.name} <span className="muted">· {s.orders} commande{s.orders > 1 ? 's' : ''}</span></span>
                      <span className="muted">{formatFCFA(s.spent)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {pushSupported() && ['ready', 'subscribed'].includes(pushStatus) && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔔</span>
            <div style={{ flex: 1, fontSize: 14 }}>
              Notifications de suivi de commande {pushStatus === 'subscribed' ? '(activées)' : ''}
            </div>
            <button className="btn small outline" onClick={togglePush}>
              {pushStatus === 'subscribed' ? 'Désactiver' : 'Activer'}
            </button>
          </div>
        )}

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>📖</span>
          <div style={{ flex: 1, fontSize: 14 }}>Guide de prise en main</div>
          <button className="btn small outline" onClick={() => { resetOnboarding(user?.role || 'CLIENT'); window.location.reload() }}>
            Revoir
          </button>
        </div>

        <div className="card">
          <p className="section-title" style={{ marginTop: 0 }}>À propos</p>
          <p className="muted" style={{ fontSize: 14, marginTop: 0, marginBottom: 0 }}>
            BjDrive — vos courses livrées à domicile partout au Bénin, avec suivi du livreur en temps réel
            et heure d'arrivée estimée.
          </p>
        </div>

        <button className="btn danger" onClick={handleLogout}>Se déconnecter</button>
      </div>
    </>
  )
}
