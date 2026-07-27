import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, setToken } from '../services/api.js'
import { useApp } from '../context/AppContext.jsx'

// Page ouverte depuis le lien e-mail : /reset?token=...
// Après réinitialisation, l'utilisateur est directement connecté.
export default function Reset() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const nav = useNavigate()
  const { refreshUser } = useApp()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (password.length < 6) return setErr('6 caractères minimum.')
    if (password !== confirm) return setErr('Les deux mots de passe ne correspondent pas.')
    setBusy(true)
    try {
      const res = await api.resetPassword(token, password)
      setToken(res.accessToken, res.refreshToken)
      await refreshUser()
      nav('/', { replace: true })
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen" style={{ paddingTop: 'calc(28px + var(--safe-top))', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 40 }}>🔑</div>
        <h2 style={{ margin: '8px 0 2px' }}>Nouveau mot de passe</h2>
        <p className="muted" style={{ margin: 0 }}>Choisissez un mot de passe fort (6 caractères minimum).</p>
      </div>

      {!token ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>Lien invalide — ouvrez le lien reçu par e-mail, ou refaites une demande.</p>
          <button className="btn" onClick={() => nav('/login')}>Retour à la connexion</button>
        </div>
      ) : (
        <div className="card">
          <form onSubmit={submit}>
            <label className="field">
              <span>Nouveau mot de passe</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoFocus />
            </label>
            <label className="field">
              <span>Confirmez le mot de passe</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
            </label>
            {err && <p style={{ color: 'var(--red)', fontSize: 13, margin: '4px 0 12px' }}>{err}</p>}
            <button className="btn" disabled={busy}>{busy ? '…' : 'Changer mon mot de passe'}</button>
          </form>
        </div>
      )}
    </div>
  )
}
