import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { TopBar } from '../../components/ui.jsx'
import { pushSupported, getPushStatus, enablePush, disablePush } from '../../lib/push.js'

export default function Account() {
  const { user, logout, showToast } = useApp()
  const nav = useNavigate()
  const [pushStatus, setPushStatus] = useState('unsupported')

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
