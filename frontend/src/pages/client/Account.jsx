import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { TopBar } from '../../components/ui.jsx'

export default function Account() {
  const { user, logout } = useApp()
  const nav = useNavigate()

  function handleLogout() {
    logout()
    nav('/')
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
