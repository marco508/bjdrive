import { useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import { formatFCFA } from '../../lib/geo.js'

// Finances : remboursements en attente + soldes dus (enseignes / livreurs) + versements.
export default function AdminFinance() {
  const { logout, showToast } = useApp()
  const refundsQ = useAsync(api.adminRefunds, [])
  const balancesQ = useAsync(api.adminBalances, [])
  const payoutsQ = useAsync(() => api.adminPayouts(), [])
  const [busy, setBusy] = useState(null)

  async function retryRefund(orderId) {
    setBusy(orderId)
    try {
      await api.adminRetryRefund(orderId)
      showToast('Remboursement effectué ✅')
      refundsQ.reload()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function markRefunded(orderId) {
    const reference = window.prompt('Référence du remboursement manuel (Mobile Money, virement...) :') || undefined
    setBusy(orderId)
    try {
      await api.adminMarkRefunded(orderId, reference)
      showToast('Marqué remboursé ✅')
      refundsQ.reload()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(null)
    }
  }

  async function payout(user, suggested) {
    const raw = window.prompt(`Montant versé à ${user.name} (FCFA) — négatif pour un dépôt d'espèces :`, String(suggested))
    if (raw == null) return
    const amount = Math.trunc(Number(raw))
    if (!amount || isNaN(amount)) return showToast('Montant invalide.')
    const reference = window.prompt('Référence de la transaction (optionnel) :') || undefined
    setBusy(user.id)
    try {
      await api.adminCreatePayout({ userId: user.id, amount, reference })
      showToast('Versement enregistré ✅')
      await Promise.all([balancesQ.reload(), payoutsQ.reload()])
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(null)
    }
  }

  const refunds = refundsQ.data || []
  const stores = balancesQ.data?.stores || []
  const drivers = balancesQ.data?.drivers || []

  return (
    <>
      <TopBar title="Finances" subtitle="Remboursements & versements" />
      <div className="screen">
        {/* ---- Remboursements à traiter ---- */}
        <p className="section-title">Remboursements à traiter</p>
        {refundsQ.loading && <Loader />}
        <ErrorBox error={refundsQ.error} onRetry={refundsQ.reload} />
        {!refundsQ.loading && refunds.length === 0 && (
          <div className="card muted" style={{ fontSize: 14 }}>Aucun remboursement en attente.</div>
        )}
        {refunds.map((o) => (
          <div key={o.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{o.client?.name}</strong>
              <span className="price-total">{formatFCFA(o.total)}</span>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {o.client?.email} {o.client?.phone ? `· ${o.client.phone}` : ''}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Commande {o.id.slice(-6)} · annulée le {new Date(o.updatedAt).toLocaleDateString('fr-FR')}
              {o.payment?.providerRef ? ` · KkiaPay ${o.payment.providerRef}` : ''}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn small" disabled={busy === o.id} onClick={() => retryRefund(o.id)}>Rembourser via KkiaPay</button>
              <button className="btn outline small" disabled={busy === o.id} onClick={() => markRefunded(o.id)}>Marquer remboursé (manuel)</button>
            </div>
          </div>
        ))}

        {/* ---- Soldes enseignes ---- */}
        <p className="section-title">Soldes dus aux enseignes</p>
        {balancesQ.loading && <Loader />}
        <ErrorBox error={balancesQ.error} onRetry={balancesQ.reload} />
        {!balancesQ.loading && stores.length === 0 && (
          <div className="card muted" style={{ fontSize: 14 }}>Aucune vente livrée pour le moment.</div>
        )}
        {stores.map((r) => (
          <div key={r.user.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{r.user.name}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{r.storeNames.join(' · ')}</div>
              </div>
              <span className="price-total">{formatFCFA(r.balance)}</span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Gagné {formatFCFA(r.earned)} · déjà versé {formatFCFA(r.paidOut)}
              {r.pending > 0 && ` · ${formatFCFA(r.pending)} sous délai de litige (${balancesQ.data?.payoutDelayDays} j)`}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {r.account
                ? `Verser sur : ${r.account.provider} ${r.account.accountRef}${r.account.holderName ? ` (${r.account.holderName})` : ''}`
                : 'Aucun compte de versement renseigné par le gérant.'}
            </div>
            {r.available > 0 && (
              <button className="btn small outline" style={{ marginTop: 8 }} disabled={busy === r.user.id} onClick={() => payout(r.user, r.available)}>
                Verser le disponible ({formatFCFA(r.available)})
              </button>
            )}
          </div>
        ))}

        {/* ---- Soldes livreurs ---- */}
        <p className="section-title">Soldes des livreurs</p>
        {!balancesQ.loading && drivers.length === 0 && (
          <div className="card muted" style={{ fontSize: 14 }}>Aucune livraison effectuée pour le moment.</div>
        )}
        {drivers.map((r) => (
          <div key={r.user.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{r.user.name}</strong>
              <span className="price-total" style={{ color: r.balance < 0 ? 'var(--red)' : undefined }}>
                {formatFCFA(r.balance)}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Gains en ligne {formatFCFA(r.earningsOnline)} · espèces à reverser {formatFCFA(r.cashOwed)} · déjà réglé {formatFCFA(r.paidOut)}
              {r.pending > 0 && ` · ${formatFCFA(r.pending)} sous délai`}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {r.account
                ? `Régler sur : ${r.account.provider} ${r.account.accountRef}${r.account.holderName ? ` (${r.account.holderName})` : ''}`
                : 'Aucun compte de versement renseigné par le livreur.'}
            </div>
            {r.balance < 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                Le livreur doit déposer {formatFCFA(-r.balance)} (espèces collectées).
              </div>
            )}
            {r.balance !== 0 && (
              <button className="btn small outline" style={{ marginTop: 8 }} disabled={busy === r.user.id} onClick={() => payout(r.user, r.balance)}>
                Enregistrer un règlement
              </button>
            )}
          </div>
        ))}

        {/* ---- Historique des versements ---- */}
        {(payoutsQ.data || []).length > 0 && (
          <>
            <p className="section-title">Derniers versements</p>
            <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
              {(payoutsQ.data || []).slice(0, 20).map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid var(--line)' }}>
                  <span>
                    {p.user?.name} <span className="muted">· {new Date(p.createdAt).toLocaleDateString('fr-FR')}{p.reference ? ` · ${p.reference}` : ''}</span>
                  </span>
                  <span style={{ color: p.amount < 0 ? 'var(--red)' : undefined }}>{formatFCFA(p.amount)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
