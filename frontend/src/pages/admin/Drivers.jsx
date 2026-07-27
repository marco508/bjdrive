import { useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'

const STATUS_LABELS = {
  PENDING: '🕒 En attente',
  VERIFIED: '✅ Vérifié',
  REJECTED: '❌ Refusé',
  SUSPENDED: '⛔ Suspendu',
}
const FILTERS = [
  { key: 'PENDING', label: 'À vérifier' },
  { key: 'VERIFIED', label: 'Vérifiés' },
  { key: '', label: 'Tous' },
]

// Vérification des livreurs par le super-admin (symétrique aux enseignes).
export default function AdminDrivers() {
  const { logout, showToast } = useApp()
  const [filter, setFilter] = useState('PENDING')
  const [busyId, setBusyId] = useState(null)
  const [notes, setNotes] = useState({})
  const { data, loading, error, reload } = useAsync(() => api.adminDrivers(filter || undefined), [filter])

  async function verify(userId, approved) {
    setBusyId(userId)
    try {
      await api.adminVerifyDriver(userId, { approved, notes: notes[userId] || undefined })
      showToast(approved ? 'Livreur vérifié ✅' : 'Livreur refusé')
      reload()
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function suspend(userId, suspended) {
    setBusyId(userId)
    try {
      await api.adminSuspendDriver(userId, suspended)
      showToast(suspended ? 'Livreur suspendu' : 'Livreur réactivé')
      reload()
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <TopBar title="Livreurs" subtitle="Vérification des comptes" right={<button className="pill" onClick={logout}>Quitter</button>} />
      <div className="screen">
        <div className="row" style={{ marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`btn small ${filter === f.key ? '' : 'outline'}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>

        {loading && <Loader />}
        <ErrorBox error={error} onRetry={reload} />
        {!loading && !error && (data || []).length === 0 && (
          <Empty icon="🛵" title="Aucun livreur" text="Les comptes livreurs apparaîtront ici." />
        )}

        {(data || []).map((p) => (
          <div key={p.userId} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{p.user?.name}</strong>
                <div className="muted" style={{ fontSize: 13 }}>{p.user?.email}</div>
                {p.user?.phone && <div className="muted" style={{ fontSize: 13 }}>📞 {p.user.phone}</div>}
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  🛵 {p.vehicle} · inscrit le {new Date(p.user?.createdAt || p.createdAt).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <span className="badge gray">{STATUS_LABELS[p.status] || p.status}</span>
            </div>

            {p.verificationNotes && (
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>📝 {p.verificationNotes}</div>
            )}

            {p.status === 'PENDING' || p.status === 'REJECTED' ? (
              <>
                <label className="field" style={{ marginTop: 10 }}>
                  <span>Notes de vérification (pièce d'identité, entretien...)</span>
                  <input value={notes[p.userId] || ''} onChange={(e) => setNotes((n) => ({ ...n, [p.userId]: e.target.value }))}
                    placeholder="Ex : CNI vérifiée, entretien téléphonique OK" />
                </label>
                <div className="row">
                  <button className="btn small" disabled={busyId === p.userId} onClick={() => verify(p.userId, true)}>✅ Vérifier</button>
                  <button className="btn danger small" disabled={busyId === p.userId} onClick={() => verify(p.userId, false)}>Refuser</button>
                </div>
              </>
            ) : p.status === 'VERIFIED' ? (
              <button className="btn outline small" style={{ marginTop: 10 }} disabled={busyId === p.userId} onClick={() => suspend(p.userId, true)}>
                ⛔ Suspendre
              </button>
            ) : (
              <button className="btn outline small" style={{ marginTop: 10 }} disabled={busyId === p.userId} onClick={() => suspend(p.userId, false)}>
                Réactiver
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
