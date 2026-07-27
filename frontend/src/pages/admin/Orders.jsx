import { useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox, StatusBadge } from '../../components/ui.jsx'
import { STATUS_LABELS, STATUS_ICON } from '../../services/constants.js'
import { formatFCFA } from '../../lib/geo.js'

const FILTERS = [
  { key: '', label: 'Toutes' },
  { key: 'AWAITING_DRIVER', label: 'Sans livreur' },
  { key: 'AWAITING_PICKUP', label: 'À retirer' },
  { key: 'IN_DELIVERY', label: 'En livraison' },
  { key: 'DELIVERED', label: 'Livrées' },
  { key: 'CANCELLED', label: 'Annulées' },
]

// Supervision des commandes : suivi, méthode de paiement, déblocage des codes.
export default function AdminOrders() {
  const { logout, showToast } = useApp()
  const [filter, setFilter] = useState('')
  const [busyId, setBusyId] = useState(null)
  const { data, loading, error, reload } = useAsync(() => api.adminOrders(filter || undefined), [filter])

  async function resetCode(orderId) {
    setBusyId(orderId)
    try {
      await api.adminResetCode(orderId)
      showToast('Code débloqué ✅ Le livreur peut réessayer.')
      reload()
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <TopBar title="Commandes" subtitle="Supervision" right={<button className="pill" onClick={logout}>Quitter</button>} />
      <div className="screen">
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`btn small ${filter === f.key ? '' : 'outline'}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>

        {loading && <Loader />}
        <ErrorBox error={error} onRetry={reload} />
        {!loading && !error && (data || []).length === 0 && (
          <Empty icon="🧾" title="Aucune commande" text="Rien à superviser pour ce filtre." />
        )}

        {(data || []).map((o) => {
          const blocked = o.codeAttempts >= 5 && o.status !== 'DELIVERED'
          return (
            <div key={o.id} className="card" style={blocked ? { borderLeft: '4px solid var(--red, #b00020)' } : undefined}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{o.client?.name}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(o.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{(o.stores || []).map((s) => s.store?.name).join(', ')}
                  </div>
                </div>
                <StatusBadge status={o.status} labels={STATUS_LABELS} icons={STATUS_ICON} />
              </div>

              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                {o.paymentMethod === 'CASH' ? '💵 Espèces à la livraison' : '💳 KkiaPay'}
                {' · '}<strong style={{ color: 'inherit' }}>{formatFCFA(o.total)}</strong>
                {o.paymentStatus === 'REFUND_PENDING' && ' · 💸 remboursement en attente'}
                {o.paymentStatus === 'REFUNDED' && ' · ✅ remboursée'}
              </div>
              {o.delivery?.driver && (
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                  🛵 {o.delivery.driver.name} {o.delivery.driver.phone ? `· ${o.delivery.driver.phone}` : ''}
                </div>
              )}

              {blocked && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, color: 'var(--red, #b00020)', marginBottom: 6 }}>
                    🔒 Code de réception bloqué ({o.codeAttempts} tentatives) — vérifiez avec le client avant de débloquer.
                  </div>
                  <button className="btn small" disabled={busyId === o.id} onClick={() => resetCode(o.id)}>
                    Débloquer le code
                  </button>
                </div>
              )}
              {!blocked && o.codeAttempts > 0 && o.status !== 'DELIVERED' && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>⚠️ {o.codeAttempts} tentative(s) de code erronée(s)</div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
