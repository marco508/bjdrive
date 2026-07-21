import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Loader, ErrorBox } from '../../components/ui.jsx'
import { formatFCFA } from '../../lib/geo.js'

const KKIAPAY_SRC = 'https://cdn.kkiapay.me/k.js'

function loadKkiapay() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`script[src="${KKIAPAY_SRC}"]`)) return
  const s = document.createElement('script')
  s.src = KKIAPAY_SRC
  document.body.appendChild(s)
}

export default function Payment() {
  const { orderId } = useParams()
  const nav = useNavigate()
  const { showToast } = useApp()

  const { data, loading, error, reload } = useAsync(() => api.initiatePayment(orderId), [orderId])
  const [busy, setBusy] = useState(false)
  const listenersRef = useRef(false)

  const hasKey = !!data?.publicKey

  useEffect(() => {
    if (!hasKey) return
    loadKkiapay()
    if (listenersRef.current) return
    listenersRef.current = true
    const onSuccess = async (resp) => {
      try {
        await api.confirmPayment(orderId, resp?.transactionId)
        nav(`/client/track/${orderId}`, { replace: true })
      } catch (e) {
        showToast('Erreur : ' + e.message)
      }
    }
    const onFailed = () => showToast('Paiement échoué')
    if (window.addSuccessListener) window.addSuccessListener(onSuccess)
    if (window.addFailedListener) window.addFailedListener(onFailed)
  }, [hasKey, orderId, nav, showToast])

  if (loading) {
    return (
      <>
        <TopBar title="Paiement" back />
        <div className="screen"><Loader /></div>
      </>
    )
  }

  if (error || !data) {
    return (
      <>
        <TopBar title="Paiement" back />
        <div className="screen"><ErrorBox error={error || 'Paiement indisponible'} onRetry={reload} /></div>
      </>
    )
  }

  const { amount, breakdown } = data

  function payWithKkiapay() {
    if (!window.openKkiapayWidget) {
      showToast('Le module de paiement se charge, réessayez.')
      loadKkiapay()
      return
    }
    window.openKkiapayWidget({
      amount,
      key: data.publicKey,
      sandbox: data.sandbox,
      position: 'center',
      theme: '#0a7d3c',
    })
  }

  async function paySimulated() {
    setBusy(true)
    try {
      await api.confirmPayment(orderId)
      nav(`/client/track/${orderId}`, { replace: true })
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar title="Paiement" subtitle="Réglez votre commande" back />
      <div className="screen">
        <div className="card">
          <p className="section-title" style={{ marginTop: 0 }}>Récapitulatif</p>
          <Row label="Produits" value={formatFCFA(breakdown.subtotal)} />
          <Row label="Livraison" value={formatFCFA(breakdown.deliveryFee)} />
          <Row label="Commission (10%)" value={formatFCFA(breakdown.commission)} />
          <div className="divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>Total</strong>
            <span className="price-total">{formatFCFA(amount)}</span>
          </div>
        </div>

        <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
          Mobile Money · Moov Money · Carte bancaire (via KkiaPay)
        </p>

        {hasKey ? (
          <button className="btn" onClick={payWithKkiapay}>
            Payer {formatFCFA(amount)}
          </button>
        ) : (
          <>
            <button className="btn" onClick={paySimulated} disabled={busy}>
              {busy ? 'Traitement…' : `Payer ${formatFCFA(amount)}`}
            </button>
            <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
              Mode test : paiement simulé (aucune vraie transaction).
            </p>
          </>
        )}
      </div>
    </>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}
