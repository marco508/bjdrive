import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import { formatFCFA } from '../../lib/geo.js'
import { imageSrc } from '../../config.js'

const CATEGORIES = ['Épicerie', 'Frais', 'Surgelés', 'Boissons', 'Boulangerie', 'Hygiène', 'Autres']
const EMOJIS = ['🛍️', '🍚', '🛢️', '🥫', '🍗', '💧', '🥛', '🥖', '🥚', '🧀', '🧃', '🍝', '🧼', '🌾', '🌶️', '🐟', '🍬', '🥤', '🧻']
const EMPTY = { name: '', emoji: '🛍️', category: 'Épicerie', price: '', stock: '', unit: 'pièce', barcode: '' }

export default function ManagerProducts() {
  const { showToast } = useApp()
  const nav = useNavigate()
  const storesQ = useAsync(api.myStores)
  const store = storesQ.data?.[0] || null

  const productsQ = useAsync(() => (store ? api.myStore(store.id) : Promise.resolve(null)), [store?.id])
  const products = productsQ.data?.products || []
  // File des ajustements de stock demandés par les employés non-valideurs.
  const requestsQ = useAsync(() => (store ? api.stockRequests(store.id, 'PENDING') : Promise.resolve([])), [store?.id])

  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  if (storesQ.loading) {
    return (
      <>
        <TopBar title="Produits & stocks" />
        <div className="screen"><Loader /></div>
      </>
    )
  }

  if (storesQ.error) {
    return (
      <>
        <TopBar title="Produits & stocks" />
        <div className="screen"><ErrorBox error={storesQ.error} onRetry={storesQ.reload} /></div>
      </>
    )
  }

  if (!store) {
    return (
      <>
        <TopBar title="Produits & stocks" />
        <div className="screen">
          <Empty iconName="storefront" title="Créez d’abord votre enseigne" text="Vous pourrez ensuite gérer vos produits et stocks.">
            <button className="btn" style={{ maxWidth: 240, margin: '14px auto 0' }} onClick={() => nav('/manager/store')}>
              Créer mon enseigne
            </button>
          </Empty>
        </div>
      </>
    )
  }

  function resetForm() {
    setForm(EMPTY)
    setEditing(null)
    setOpen(false)
  }

  function startEdit(p) {
    setEditing(p.id)
    setForm({
      name: p.name || '',
      emoji: p.emoji || '🛍️',
      category: p.category || 'Épicerie',
      price: p.price ?? '',
      stock: p.stock ?? '',
      unit: p.unit || 'pièce',
      barcode: p.barcode || '',
    })
    setOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || form.price === '' || isNaN(Number(form.price))) {
      showToast('Nom et prix valides requis.')
      return
    }
    const dto = {
      name: form.name.trim(),
      category: form.category,
      emoji: form.emoji,
      price: Number(form.price),
      stock: Number(form.stock) || 0,
      unit: form.unit || 'pièce',
      barcode: form.barcode.trim() || undefined,
    }
    setBusy(true)
    try {
      if (editing) {
        await api.updateProduct(editing, dto)
        showToast('Produit mis à jour ✅')
      } else {
        await api.addProduct(store.id, dto)
        showToast('Produit ajouté ✅')
      }
      resetForm()
      await productsQ.reload()
    } catch (err) {
      showToast(err.message || 'Enregistrement impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function doImport() {
    const parsed = importText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, price, stock, unit, emoji] = line.split(';').map((s) => (s || '').trim())
        return {
          name,
          price: Number(price),
          stock: Number(stock) || 0,
          unit: unit || 'pièce',
          emoji: emoji || '🛍️',
        }
      })
      .filter((p) => p.name && !isNaN(p.price))
    if (parsed.length === 0) {
      showToast('Aucune ligne valide à importer.')
      return
    }
    setBusy(true)
    try {
      const res = await api.importProducts(store.id, parsed)
      showToast(`${res.imported} produits importés`)
      setImportText('')
      await productsQ.reload()
    } catch (err) {
      showToast(err.message || 'Import impossible.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStock(p, delta) {
    try {
      await api.adjustStock(p.id, delta) // gérant : appliqué immédiatement
      await productsQ.reload()
    } catch (err) {
      showToast(err.message || 'Mise à jour impossible.')
    }
  }

  async function decide(requestId, approved) {
    try {
      await api.decideStockRequest(requestId, approved)
      showToast(approved ? 'Ajustement validé et appliqué.' : 'Ajustement refusé.')
      await Promise.all([requestsQ.reload(), productsQ.reload()])
    } catch (err) {
      showToast(err.message)
    }
  }

  async function del(p) {
    try {
      await api.removeProduct(p.id)
      showToast('Produit supprimé')
      await productsQ.reload()
    } catch (err) {
      showToast(err.message || 'Suppression impossible.')
    }
  }

  async function uploadPhoto(p, file) {
    if (!file) return
    setBusy(true)
    try {
      await api.uploadProductImage(p.id, file)
      showToast('Photo ajoutée 📷')
      await productsQ.reload()
    } catch (err) {
      showToast(err.message || 'Envoi de la photo impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar
        title="Produits & stocks"
        subtitle={store.name}
        right={
          <button className="pill" onClick={() => { setEditing(null); setForm(EMPTY); setOpen((o) => !o) }}>
            {open ? '✕' : '+ Ajouter'}
          </button>
        }
      />
      <div className="screen">
        {/* Ajustements de stock à valider (demandes des employés) */}
        {(requestsQ.data || []).length > 0 && (
          <div className="card" style={{ borderLeft: '4px solid var(--yellow)' }}>
            <p className="section-title" style={{ marginTop: 0 }}>Ajustements de stock à valider</p>
            {(requestsQ.data || []).map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{r.product?.emoji} {r.product?.name}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {r.requestedBy?.name} propose : {r.oldStock} → <strong style={{ color: 'var(--green-dark)' }}>{r.newStock}</strong>
                    {' '}(stock actuel : {r.product?.stock}) · {new Date(r.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <button className="btn small" onClick={() => decide(r.id, true)}>Valider</button>
                <button className="btn danger small" onClick={() => decide(r.id, false)}>Refuser</button>
              </div>
            ))}
          </div>
        )}

        {open && (
          <div className="card">
            <p className="section-title" style={{ marginTop: 0 }}>{editing ? 'Modifier le produit' : 'Nouveau produit'}</p>
            <form onSubmit={submit}>
              <label className="field">
                <span>Nom</span>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. Riz parfumé 5 kg" />
              </label>
              <div className="row" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
                {EMOJIS.map((em) => (
                  <button
                    type="button"
                    key={em}
                    onClick={() => set('emoji', em)}
                    style={{
                      fontSize: 20,
                      width: 38,
                      height: 38,
                      borderRadius: 9,
                      border: form.emoji === em ? '2px solid var(--green)' : '1px solid var(--line)',
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
              <div className="row">
                <label className="field">
                  <span>Catégorie</span>
                  <select value={form.category} onChange={(e) => set('category', e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Unité</span>
                  <input value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="pièce, kg, sac…" />
                </label>
              </div>
              <div className="row">
                <label className="field">
                  <span>Prix (FCFA)</span>
                  <input type="number" min="0" value={form.price} onChange={(e) => set('price', e.target.value)} />
                </label>
                <label className="field">
                  <span>Stock</span>
                  <input type="number" min="0" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
                </label>
              </div>
              <label className="field">
                <span>Code-barres (optionnel — propre à votre enseigne)</span>
                <input value={form.barcode} onChange={(e) => set('barcode', e.target.value)} placeholder="Scannez ou saisissez le code" />
              </label>
              <button className="btn" disabled={busy}>{editing ? 'Enregistrer' : 'Ajouter le produit'}</button>
            </form>
          </div>
        )}

        <div className="card">
          <p className="section-title" style={{ marginTop: 0 }}>Import rapide</p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={4}
            placeholder="Un produit par ligne : Nom;prix;stock;unité;emoji"
            style={{ width: '100%' }}
          />
          <button className="btn outline small" style={{ marginTop: 8 }} onClick={doImport} disabled={busy}>
            Importer
          </button>
        </div>

        <p className="section-title">Mes produits</p>
        {productsQ.loading && <Loader />}
        <ErrorBox error={productsQ.error} onRetry={productsQ.reload} />

        {!productsQ.loading && !productsQ.error && products.length === 0 && (
          <Empty iconName="barcode" title="Aucun produit" text="Ajoutez vos premiers articles pour ouvrir vos rayons." />
        )}

        {products.length > 0 && (
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {products.map((p) => (
              <div className="product" key={p.id}>
                <div className="thumb" style={{ overflow: 'hidden' }}>
                  {p.imageUrl ? (
                    <img src={imageSrc(p.imageUrl)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    p.emoji
                  )}
                </div>
                <div className="info">
                  <h4>{p.name}</h4>
                  <div className="price">
                    {formatFCFA(p.price)} <span className="muted" style={{ fontWeight: 400 }}>/ {p.unit}</span>
                  </div>
                  <div className={`stock ${p.stock <= 5 ? 'low' : ''}`}>Stock : {p.stock}</div>
                  <label className="muted" style={{ fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                    📷 {p.imageUrl ? 'Changer la photo' : 'Ajouter une photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                      onChange={(e) => uploadPhoto(p, e.target.files?.[0])} />
                  </label>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <div className="stepper">
                    <button type="button" onClick={() => changeStock(p, -1)}>−</button>
                    <span className="n">{p.stock}</span>
                    <button type="button" onClick={() => changeStock(p, 1)}>+</button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn ghost small" onClick={() => startEdit(p)}>Modifier</button>
                    <button className="btn danger small" onClick={() => del(p)}>Supprimer</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
