import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox, StatusBadge } from '../../components/ui.jsx'
import OrderChat from '../../components/OrderChat.jsx'
import { STATUS_LABELS, STATUS_ICON } from '../../services/constants.js'
import { formatFCFA } from '../../lib/geo.js'

export default function ManagerOrders() {
  const nav = useNavigate()
  const { showToast } = useApp()
  const [busyId, setBusyId] = useState(null)
  const storesQ = useAsync(api.myStores)
  const store = storesQ.data?.[0] || null

  const ordersQ = useAsync(() => (store ? api.storeOrders(store.id) : Promise.resolve([])), [store?.id])
  const orders = [...(ordersQ.data || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  async function markReady(orderId) {
    setBusyId(orderId)
    try {
      await api.markStoreReady(orderId, store.id)
      showToast('Commande marquée prête 📦')
      ordersQ.reload()
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusyId(null)
    }
  }

  const [codes, setCodes] = useState({})

  // Traçabilité : l'enseigne confirme avoir remis les produits au livreur.
  async function handover(orderId) {
    setBusyId(orderId)
    try {
      const r = await api.confirmHandover(orderId, store.id)
      showToast(`Remise au livreur ${r.driver} enregistrée 🤝`)
      ordersQ.reload()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function completePickup(orderId) {
    setBusyId(orderId)
    try {
      await api.completePickup(orderId, store.id, (codes[orderId] || '').trim())
      showToast('Commande remise au client ✅')
      ordersQ.reload()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusyId(null)
    }
  }

  if (storesQ.loading) {
    return (
      <>
        <TopBar title="Commandes" />
        <div className="screen"><Loader /></div>
      </>
    )
  }

  if (storesQ.error) {
    return (
      <>
        <TopBar title="Commandes" />
        <div className="screen"><ErrorBox error={storesQ.error} onRetry={storesQ.reload} /></div>
      </>
    )
  }

  if (!store) {
    return (
      <>
        <TopBar title="Commandes" />
        <div className="screen">
          <Empty iconName="storefront" title="Créez votre enseigne" text="Vos commandes entrantes apparaîtront ici.">
            <button className="btn" style={{ maxWidth: 240, margin: '14px auto 0' }} onClick={() => nav('/manager/store')}>
              Créer mon enseigne
            </button>
          </Empty>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar title="Commandes" subtitle={store.name} />
      <div className="screen">
        {ordersQ.loading && <Loader />}
        <ErrorBox error={ordersQ.error} onRetry={ordersQ.reload} />

        {!ordersQ.loading && !ordersQ.error && orders.length === 0 && (
          <Empty iconName="receipt" title="Aucune commande" text="Les nouvelles commandes des clients s’afficheront ici." />
        )}

        {orders.map((o) => {
          const itemCount = (o.items || []).reduce((s, i) => s + i.qty, 0)
          return (
            <div key={o.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  {new Date(o.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {itemCount} article{itemCount > 1 ? 's' : ''}
                </div>
                <StatusBadge status={o.status} labels={STATUS_LABELS} icons={STATUS_ICON} />
              </div>

              <ul className="list-reset" style={{ margin: '10px 0' }}>
                {(o.items || []).map((it) => (
                  <li key={it.productId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '3px 0' }}>
                    <span>{it.emoji} {it.name} <span className="muted">×{it.qty}</span></span>
                    <span>{formatFCFA(it.price * it.qty)}</span>
                  </li>
                ))}
              </ul>

              {o.destAddress && <div className="muted" style={{ fontSize: 13 }}>📍 {o.destAddress}</div>}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <span className="muted" style={{ fontSize: 13 }}>Votre reversement</span>
                <strong className="price-total" style={{ fontSize: 18 }}>
                  {formatFCFA(o.part?.payoutAmount ?? (o.items || []).reduce((s, i) => s + i.price * i.qty, 0))}
                </strong>
              </div>

              {o.fulfillment === 'PICKUP' && (
                <div className="badge yellow" style={{ marginTop: 8 }}>Retrait sur place par le client</div>
              )}

              {/* Rassurance : le reversement de l'enseigne est garanti par BjDrive,
                  même quand le client paie en espèces au livreur. */}
              {o.paymentMethod === 'CASH' && o.fulfillment !== 'PICKUP' && (
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Paiement en espèces collecté par le livreur — <strong style={{ color: 'var(--green-dark)' }}>votre
                  reversement est garanti par BjDrive</strong>, quoi qu'il arrive.
                </div>
              )}

              {/* Préparation : signaler que la commande est prête */}
              {['AWAITING_DRIVER', 'AWAITING_PICKUP'].includes(o.status) && !o.part?.pickedUpAt && (
                o.part?.readyAt ? (
                  <div className="badge" style={{ marginTop: 8 }}>📦 Prête{o.fulfillment !== 'PICKUP' ? ' — en attente du livreur' : ''}</div>
                ) : (
                  <button className="btn small outline" style={{ marginTop: 8 }} disabled={busyId === o.id} onClick={() => markReady(o.id)}>
                    Marquer comme prête
                  </button>
                )
              )}

              {/* Traçabilité : confirmer la remise des produits au livreur assigné */}
              {o.fulfillment !== 'PICKUP' && o.status === 'AWAITING_PICKUP' && o.delivery && (
                o.part?.handedOverAt ? (
                  <div className="badge" style={{ marginTop: 8 }}>🤝 Remise au livreur confirmée</div>
                ) : (
                  <button className="btn small outline" style={{ marginTop: 8 }} disabled={busyId === o.id} onClick={() => handover(o.id)}>
                    Confirmer la remise au livreur
                  </button>
                )
              )}

              {/* Retrait sur place : validation avec le code du client */}
              {o.fulfillment === 'PICKUP' && o.status === 'AWAITING_PICKUP' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    placeholder="Code de réception du client"
                    inputMode="numeric"
                    maxLength={6}
                    value={codes[o.id] || ''}
                    onChange={(e) => setCodes((c) => ({ ...c, [o.id]: e.target.value.replace(/\D/g, '') }))}
                    style={{ flex: 1 }}
                  />
                  <button className="btn small" disabled={busyId === o.id || !(codes[o.id] || '').trim()} onClick={() => completePickup(o.id)}>
                    Remettre
                  </button>
                </div>
              )}

              {o.status !== 'PENDING_PAYMENT' && o.status !== 'CANCELLED' && (
                <div style={{ marginTop: 10 }}><OrderChat orderId={o.id} /></div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
