import { useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox, StatusBadge } from '../../components/ui.jsx'
import OrderChat from '../../components/OrderChat.jsx'
import AccountDanger from '../../components/AccountDanger.jsx'
import { STATUS_LABELS, STATUS_ICON } from '../../services/constants.js'
import { formatFCFA } from '../../lib/geo.js'

// Espace EMPLOYÉ : rattaché à une seule enseigne.
// - renseigner/retrouver un produit par code-barres (scanner douchette ou saisie)
// - gérer les stocks
// - préparer les commandes, valider les retraits sur place, discuter avec le client
export default function StaffDashboard() {
  const { user, logout, showToast } = useApp()
  const storeQ = useAsync(api.staffMyStore, [])
  const store = storeQ.data
  const ordersQ = useAsync(() => (store ? api.storeOrders(store.id) : Promise.resolve([])), [store?.id])

  const [tab, setTab] = useState('orders')

  if (storeQ.loading) return (<><TopBar title="Espace employé" /><div className="screen"><Loader /></div></>)
  if (storeQ.error || !store) {
    return (
      <>
        <TopBar title="Espace employé" />
        <div className="screen"><ErrorBox error={storeQ.error || 'Aucune enseigne rattachée.'} onRetry={storeQ.reload} /></div>
      </>
    )
  }

  return (
    <>
      <TopBar
        title={`${store.emoji || '🏪'} ${store.name}`}
        subtitle={`Employé · ${user?.name?.split(' ')[0] || ''}`}
       
      />
      <div className="screen">
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <button className={`chip ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>Commandes</button>
          <button className={`chip ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>Produits & scan</button>
        </div>

        {tab === 'orders' && <OrdersTab store={store} ordersQ={ordersQ} showToast={showToast} />}
        {tab === 'products' && <ProductsTab store={store} reload={storeQ.reload} showToast={showToast} />}

        <div style={{ marginTop: 24 }}>
          <AccountDanger />
        </div>
      </div>
    </>
  )
}

function OrdersTab({ store, ordersQ, showToast }) {
  const [busyId, setBusyId] = useState(null)
  const [codes, setCodes] = useState({})
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

  async function completePickup(orderId) {
    setBusyId(orderId)
    try {
      await api.completePickup(orderId, store.id, (codes[orderId] || '').trim())
      showToast('Commande remise au client ✅')
      setCodes((c) => ({ ...c, [orderId]: '' }))
      ordersQ.reload()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusyId(null)
    }
  }

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

  return (
    <>
      {ordersQ.loading && <Loader />}
      <ErrorBox error={ordersQ.error} onRetry={ordersQ.reload} />
      {!ordersQ.loading && orders.length === 0 && (
        <Empty iconName="receipt" title="Aucune commande" text="Les commandes clients s'afficheront ici." />
      )}
      {orders.map((o) => {
        const itemCount = (o.items || []).reduce((s, i) => s + i.qty, 0)
        const isPickup = o.fulfillment === 'PICKUP'
        const activePickup = isPickup && o.status === 'AWAITING_PICKUP'
        return (
          <div key={o.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="muted" style={{ fontSize: 12 }}>
                {new Date(o.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                {' · '}{itemCount} article{itemCount > 1 ? 's' : ''}
                {isPickup && ' · 🏪 Retrait sur place'}
                {o.paymentMethod === 'CASH' && ' · 💵 espèces'}
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

            {['AWAITING_DRIVER', 'AWAITING_PICKUP'].includes(o.status) && !o.part?.pickedUpAt && (
              o.part?.readyAt ? (
                <div className="badge" style={{ marginBottom: 8 }}>📦 Prête</div>
              ) : (
                <button className="btn small outline" style={{ marginBottom: 8 }} disabled={busyId === o.id} onClick={() => markReady(o.id)}>
                  Marquer comme prête
                </button>
              )
            )}

            {o.paymentMethod === 'CASH' && !isPickup && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Espèces collectées par le livreur — le reversement de l'enseigne est garanti par BjDrive.
              </div>
            )}

            {!isPickup && o.status === 'AWAITING_PICKUP' && o.delivery && (
              o.part?.handedOverAt ? (
                <div className="badge" style={{ marginBottom: 8 }}>🤝 Remise au livreur confirmée</div>
              ) : (
                <button className="btn small outline" style={{ marginBottom: 8 }} disabled={busyId === o.id} onClick={() => handover(o.id)}>
                  Confirmer la remise au livreur
                </button>
              )
            )}

            {activePickup && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
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

            {o.status !== 'PENDING_PAYMENT' && o.status !== 'CANCELLED' && <OrderChat orderId={o.id} />}
          </div>
        )
      })}
    </>
  )
}

// File des ajustements en attente (visible du valideur ; l'employé voit les siens).
function StockRequests({ store, canApprove, showToast, onChanged }) {
  const requestsQ = useAsync(() => api.stockRequests(store.id, 'PENDING'), [store.id])
  const list = requestsQ.data || []
  if (list.length === 0) return null

  async function decide(id, approved) {
    try {
      await api.decideStockRequest(id, approved)
      showToast(approved ? 'Ajustement validé et appliqué.' : 'Ajustement refusé.')
      requestsQ.reload()
      onChanged?.()
    } catch (e) {
      showToast(e.message)
    }
  }

  return (
    <div className="card" style={{ borderLeft: '4px solid var(--yellow)' }}>
      <p className="section-title" style={{ marginTop: 0 }}>
        {canApprove ? 'Ajustements de stock à valider' : 'Vos demandes en attente'}
      </p>
      {list.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 14 }}>{r.product?.emoji} {r.product?.name}</strong>
            <div className="muted" style={{ fontSize: 12 }}>
              {r.requestedBy?.name} : {r.oldStock} → <strong style={{ color: 'var(--green-dark)' }}>{r.newStock}</strong>
            </div>
          </div>
          {canApprove ? (
            <>
              <button className="btn small" onClick={() => decide(r.id, true)}>Valider</button>
              <button className="btn danger small" onClick={() => decide(r.id, false)}>Refuser</button>
            </>
          ) : (
            <span className="badge yellow">En attente</span>
          )}
        </div>
      ))}
    </div>
  )
}

const EMPTY_FORM = { name: '', price: '', stock: '', unit: 'pièce', barcode: '' }

function ProductsTab({ store, reload, showToast }) {
  const { user } = useApp()
  const canApprove = !!user?.staffCanApprove
  const [code, setCode] = useState('')
  const [found, setFound] = useState(null) // { found, product } après recherche
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const products = store.products || []

  async function search(e) {
    e?.preventDefault()
    const c = code.trim()
    if (!c) return
    setBusy(true)
    try {
      const res = await api.findByBarcode(store.id, c)
      setFound(res)
      if (!res.found) setForm((f) => ({ ...f, barcode: c }))
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function createProduct(e) {
    e.preventDefault()
    if (!form.name.trim() || form.price === '') return showToast('Nom et prix requis.')
    setBusy(true)
    try {
      await api.addProduct(store.id, {
        name: form.name.trim(),
        price: Number(form.price),
        stock: Number(form.stock) || 0,
        unit: form.unit || 'pièce',
        barcode: form.barcode.trim() || undefined,
      })
      showToast('Produit ajouté ✅')
      setForm(EMPTY_FORM)
      setFound(null)
      setCode('')
      reload()
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Ajustement de stock : appliqué directement si valideur/gérant, sinon
  // transformé en DEMANDE que le gérant ou un valideur approuvera.
  async function changeStock(p, delta) {
    try {
      const res = await api.adjustStock(p.id, delta)
      if (res.applied) {
        reload()
      } else {
        showToast('Demande envoyée — un valideur doit approuver cet ajustement.')
      }
      return res
    } catch (err) {
      showToast(err.message)
      return null
    }
  }

  return (
    <>
      <StockRequests store={store} canApprove={canApprove} showToast={showToast} onChanged={reload} />

      {!canApprove && (
        <div className="card" style={{ fontSize: 13, color: 'var(--muted)' }}>
          Les ajustements de stock que vous saisissez sont envoyés au gérant (ou à un valideur désigné)
          pour approbation — seules les ventes décomptent le stock automatiquement.
        </div>
      )}

      <div className="card">
        <p className="section-title" style={{ marginTop: 0 }}>Code-barres</p>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Scannez avec une douchette (le code s'écrit tout seul) ou saisissez le code, puis validez.
          Le code est propre à votre enseigne. 📱 Sur l'application mobile, utilisez la caméra pour scanner.
        </p>
        <form onSubmit={search} style={{ display: 'flex', gap: 8 }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex : 6181234567890" autoFocus style={{ flex: 1 }} />
          <button className="btn small" disabled={busy || !code.trim()}>Chercher</button>
        </form>

        {found && found.found && (
          <div style={{ marginTop: 12, padding: 12, background: 'var(--green-soft)', borderRadius: 12 }}>
            <strong>✅ {found.product.emoji || '🛍️'} {found.product.name}</strong>
            <div className="muted" style={{ fontSize: 13 }}>{formatFCFA(found.product.price)} / {found.product.unit} · Stock : {found.product.stock}</div>
            <div className="stepper" style={{ marginTop: 8 }}>
              <button type="button" onClick={() => changeStock(found.product, -1).then((res) => res?.applied && setFound((f) => ({ ...f, product: res.product })))}>−</button>
              <span className="n">{found.product.stock}</span>
              <button type="button" onClick={() => changeStock(found.product, 1).then((res) => res?.applied && setFound((f) => ({ ...f, product: res.product })))}>+</button>
            </div>
          </div>
        )}
        {found && !found.found && (
          <form onSubmit={createProduct} style={{ marginTop: 12, padding: 12, background: '#fff7d6', borderRadius: 12 }}>
            <strong>❔ Code inconnu — ajouter ce produit</strong>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Nom du produit</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex : Riz parfumé 5 kg" />
            </label>
            <div className="row">
              <label className="field"><span>Prix (FCFA)</span>
                <input type="number" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} /></label>
              <label className="field"><span>Stock</span>
                <input type="number" min="0" value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))} /></label>
              <label className="field"><span>Unité</span>
                <input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} /></label>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Code-barres : {form.barcode}</div>
            <button className="btn small" disabled={busy}>Ajouter le produit</button>
          </form>
        )}
      </div>

      <p className="section-title">Stocks ({products.length} produits)</p>
      {products.length === 0 && <Empty iconName="barcode" title="Aucun produit" text="Ajoutez le premier produit via le code-barres ci-dessus." />}
      {products.length > 0 && (
        <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {products.map((p) => (
            <div className="product" key={p.id}>
              <div className="thumb">{p.emoji || '🛍️'}</div>
              <div className="info">
                <h4>{p.name}</h4>
                <div className="price">{formatFCFA(p.price)} <span className="muted" style={{ fontWeight: 400 }}>/ {p.unit}</span></div>
                <div className={`stock ${p.stock <= 5 ? 'low' : ''}`}>Stock : {p.stock}{p.barcode ? ` · ▮▮ ${p.barcode}` : ''}</div>
              </div>
              <div className="stepper">
                <button type="button" onClick={() => changeStock(p, -1)}>−</button>
                <span className="n">{p.stock}</span>
                <button type="button" onClick={() => changeStock(p, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
