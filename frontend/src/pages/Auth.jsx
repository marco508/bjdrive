import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useApp } from '../context/AppContext.jsx'

const ROLE_MAP = {
  client: { role: 'CLIENT', ic: '🛒', label: 'Client', canRegister: true },
  manager: { role: 'MANAGER', ic: '🏪', label: 'Manager d\'enseigne', canRegister: true },
  driver: { role: 'DRIVER', ic: '🛵', label: 'Livreur', canRegister: true },
  superadmin: { role: 'SUPERADMIN', ic: '🛡️', label: 'Administrateur', canRegister: false },
}

export default function Auth({ mode }) {
  const [params] = useSearchParams()
  const roleKey = params.get('role') || 'client'
  const info = ROLE_MAP[roleKey] || ROLE_MAP.client
  const nav = useNavigate()
  const { login, register } = useApp()

  const isRegister = mode === 'register' && info.canRegister
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      if (isRegister) {
        await register({ name, email, password, phone: phone || undefined, role: info.role })
      } else {
        await login({ email, password })
      }
      nav('/', { replace: true }) // redirige selon le rôle réel
    } catch (e2) {
      setErr(e2.message || 'Une erreur est survenue.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen" style={{ paddingTop: 'calc(28px + var(--safe-top))' }}>
      <button className="btn ghost small" onClick={() => nav('/')} style={{ marginBottom: 18 }}>‹ Accueil</button>
      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <div style={{ fontSize: 40 }}>{info.ic}</div>
        <h2 style={{ margin: '8px 0 2px' }}>{isRegister ? 'Créer un compte' : 'Connexion'}</h2>
        <p className="muted" style={{ margin: 0 }}>{info.label}</p>
      </div>

      <div className="card">
        <form onSubmit={submit}>
          {isRegister && (
            <label className="field">
              <span>Nom complet</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Awa Sossou" required />
            </label>
          )}
          <label className="field">
            <span>E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.bj" required />
          </label>
          {isRegister && roleKey === 'client' && (
            <label className="field">
              <span>Téléphone (pour la livraison)</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+229 ..." />
            </label>
          )}
          <label className="field">
            <span>Mot de passe</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" required minLength={4} />
          </label>
          {err && <p style={{ color: 'var(--red)', fontSize: 13, margin: '4px 0 12px' }}>{err}</p>}
          <button className="btn" disabled={busy}>{busy ? '…' : isRegister ? 'Créer mon compte' : 'Se connecter'}</button>
        </form>
      </div>

      {info.canRegister && (
        <p style={{ textAlign: 'center', fontSize: 14 }}>
          {isRegister ? (
            <>Déjà un compte ? <Link to={`/login?role=${roleKey}`} style={{ color: 'var(--green-dark)', fontWeight: 700 }}>Se connecter</Link></>
          ) : (
            <>Pas de compte ? <Link to={`/register?role=${roleKey}`} style={{ color: 'var(--green-dark)', fontWeight: 700 }}>Créer un compte</Link></>
          )}
        </p>
      )}
    </div>
  )
}
