import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'
import { api } from '../services/api.js'
import Icon from './Icon.jsx'

// Bloc « compte » commun à tous les rôles : déconnexion bien visible
// et suppression de compte (mot de passe exigé, avertissement clair).
export default function AccountDanger() {
  const { logout, showToast } = useApp()
  const nav = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  function handleLogout() {
    logout()
    nav('/')
  }

  async function deleteAccount(e) {
    e.preventDefault()
    if (!password) return
    setBusy(true)
    try {
      await api.deleteMe(password)
      showToast('Votre compte a été supprimé.')
      logout()
      nav('/')
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button className="btn danger" onClick={handleLogout} style={{ display: 'flex', gap: 8 }}>
        <Icon name="logout" size={18} /> Se déconnecter
      </button>

      <div className="card" style={{ marginTop: 14 }}>
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            style={{ border: 'none', background: 'none', color: 'var(--red)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontFamily: 'inherit' }}
          >
            <Icon name="deleteForever" size={16} /> Supprimer définitivement mon compte
          </button>
        ) : (
          <form onSubmit={deleteAccount}>
            <p style={{ fontSize: 13, color: 'var(--red)', marginTop: 0 }}>
              <strong>Action irréversible.</strong> Vos données personnelles seront supprimées et vous ne pourrez plus
              vous connecter. Confirmez avec votre mot de passe :
            </p>
            <label className="field">
              <span>Mot de passe</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </label>
            <div className="row">
              <button type="button" className="btn ghost small" onClick={() => { setConfirming(false); setPassword('') }}>
                Annuler
              </button>
              <button className="btn danger small" disabled={busy || !password}>
                {busy ? '…' : 'Supprimer mon compte'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
