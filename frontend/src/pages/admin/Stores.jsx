import { useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import { STORE_STATUS_LABELS } from '../../services/constants.js'

const FILTERS = [
  { label: 'En attente', value: 'PENDING' },
  { label: 'Vérifiées', value: 'VERIFIED' },
  { label: 'Refusées', value: 'REJECTED' },
  { label: 'Toutes', value: undefined },
]

const STATUS_BADGE = {
  PENDING: 'badge yellow',
  VERIFIED: 'badge',
  REJECTED: 'badge red',
  SUSPENDED: 'badge gray',
}

export default function AdminStores() {
  const { logout, showToast } = useApp()
  const [filter, setFilter] = useState('PENDING')
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState(null)

  const { data, loading, error, reload } = useAsync(
    () => api.adminStores(filter),
    [filter],
  )

  const logoutBtn = <button className="pill" onClick={logout}>Quitter</button>

  async function verify(store, dto) {
    setBusy(store.id)
    try {
      await api.adminVerifyStore(store.id, { ...dto, notes: notes[store.id] || '' })
      showToast(dto.approved ? 'Enseigne vérifiée ✅' : 'Enseigne refusée ❌')
      setNotes((n) => {
        const next = { ...n }
        delete next[store.id]
        return next
      })
      reload()
    } catch (e) {
      showToast(e.message || 'Erreur')
    } finally {
      setBusy(null)
    }
  }

  const stores = data || []

  return (
    <>
      <TopBar title="Vérification des enseignes" right={logoutBtn} />
      <div className="screen">
        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 8,
            marginBottom: 4,
          }}
        >
          {FILTERS.map((f) => (
            <button
              key={f.label}
              className={`chip ${filter === f.value ? 'active' : ''}`}
              onClick={() => setFilter(f.value)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="card" style={{ background: '#fff7d6', color: 'var(--green-dark)' }}>
          <p className="muted" style={{ margin: 0, fontSize: 13, color: 'var(--green-dark)' }}>
            Vérifiez qu'il s'agit d'une vraie personne et que la boutique existe
            (visite ou appel vidéo) avant publication.
          </p>
        </div>

        {loading && <Loader />}
        <ErrorBox error={error} onRetry={reload} />

        {!loading && !error && stores.length === 0 && (
          <Empty
            icon="🏪"
            title="Aucune enseigne"
            text="Aucune enseigne pour ce filtre."
          />
        )}

        {!loading &&
          !error &&
          stores.map((s) => (
            <div key={s.id} className="card store-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="store-logo" style={{ background: s.color || 'var(--green)' }}>
                  {s.emoji || '🛒'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{s.name}</h3>
                  <div className="meta">
                    <span>{s.category?.emoji} {s.category?.name}</span>
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    <span>📍 {s.address}</span>
                  </div>
                </div>
                <span className={STATUS_BADGE[s.status] || 'badge gray'}>
                  {STORE_STATUS_LABELS[s.status]}
                </span>
              </div>

              <div className="divider" />

              <div style={{ fontSize: 14 }}>
                <div><strong>{s.owner?.name}</strong></div>
                <div className="muted">✉️ {s.owner?.email}</div>
                <div className="muted">📞 {s.owner?.phone}</div>
                <div className="muted" style={{ marginTop: 4 }}>
                  🏷️ {s._count?.products ?? 0} produits
                </div>
                {s.verificationNotes && (
                  <div className="muted" style={{ marginTop: 4 }}>
                    📝 {s.verificationNotes}
                  </div>
                )}
              </div>

              {s.status === 'PENDING' && (
                <>
                  <label className="field" style={{ marginTop: 12 }}>
                    <span>Notes de vérification (optionnel)</span>
                    <input
                      type="text"
                      value={notes[s.id] || ''}
                      placeholder="Ex : visite effectuée le…"
                      onChange={(e) =>
                        setNotes((n) => ({ ...n, [s.id]: e.target.value }))
                      }
                    />
                  </label>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    <button
                      className="btn small"
                      disabled={busy === s.id}
                      onClick={() => verify(s, { approved: true, method: 'ONSITE' })}
                    >
                      ✅ Vérifier (sur place)
                    </button>
                    <button
                      className="btn outline small"
                      disabled={busy === s.id}
                      onClick={() => verify(s, { approved: true, method: 'VIDEO' })}
                    >
                      ✅ Vérifier (vidéo)
                    </button>
                    <button
                      className="btn danger small"
                      disabled={busy === s.id}
                      onClick={() => verify(s, { approved: false })}
                    >
                      ❌ Refuser
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
      </div>
    </>
  )
}
