import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Loader, ErrorBox } from '../../components/ui.jsx'
import { STORE_STATUS_LABELS } from '../../services/constants.js'
import { formatFCFA, getCurrentPosition, COTONOU } from '../../lib/geo.js'
import DeliveryMap from '../../components/DeliveryMap.jsx'

const EMOJIS = ['🛒', '🏬', '🥫', '🏪', '🛍️', '💊', '🥖', '🧺']
const COLORS = ['#0a7d3c', '#1565c0', '#e8112d', '#8a5a00', '#6a1b9a', '#00838f']

export default function StoreSetup() {
  const { showToast } = useApp()
  const { data: stores, loading, error, reload } = useAsync(api.myStores)
  const cats = useAsync(api.categories)
  const existing = stores?.[0] || null

  const [form, setForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    emoji: '🛒',
    color: '#0a7d3c',
    address: '',
    deliveryFee: '',
    lat: null,
    lng: null,
  })
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [justCreated, setJustCreated] = useState(false)

  useEffect(() => {
    if (!existing) return
    setForm({
      name: existing.name || '',
      description: existing.description || '',
      categoryId: existing.category?.id || '',
      emoji: existing.emoji || '🛒',
      color: existing.color || '#0a7d3c',
      address: existing.address || '',
      deliveryFee: existing.deliveryFee ?? '',
      lat: existing.lat ?? null,
      lng: existing.lng ?? null,
    })
  }, [existing?.id])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function locate() {
    setLocating(true)
    try {
      const pos = await getCurrentPosition()
      setForm((f) => ({ ...f, lat: pos.lat, lng: pos.lng }))
    } catch {
      setForm((f) => ({ ...f, lat: COTONOU.lat, lng: COTONOU.lng }))
      showToast('Position GPS indisponible — Cotonou utilisé par défaut.')
    } finally {
      setLocating(false)
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.address.trim() || !form.categoryId || form.lat == null || form.lng == null) {
      showToast('Nom, catégorie, adresse et position sont requis.')
      return
    }
    const dto = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      categoryId: form.categoryId,
      emoji: form.emoji,
      color: form.color,
      address: form.address.trim(),
      lat: form.lat,
      lng: form.lng,
    }
    if (form.deliveryFee !== '' && form.deliveryFee != null) dto.deliveryFee = Number(form.deliveryFee)
    setSaving(true)
    try {
      if (existing) {
        await api.updateStore(existing.id, dto)
        showToast('Enseigne mise à jour ✅')
      } else {
        await api.createStore(dto)
        setJustCreated(true)
        showToast('Enseigne créée ✅')
      }
      await reload()
    } catch (err) {
      showToast(err.message || 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Mon enseigne" back />
        <div className="screen"><Loader /></div>
      </>
    )
  }

  return (
    <>
      <TopBar title={existing ? 'Mon enseigne' : 'Créer mon enseigne'} back />
      <div className="screen">
        <ErrorBox error={error} onRetry={reload} />

        {existing && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="muted">Statut :</span>
            <span className={`badge ${existing.status === 'VERIFIED' ? '' : existing.status === 'REJECTED' || existing.status === 'SUSPENDED' ? 'red' : 'yellow'}`}>
              {STORE_STATUS_LABELS[existing.status] || existing.status}
            </span>
          </div>
        )}

        {justCreated && (
          <div className="card" style={{ background: '#fff7d6', color: 'var(--green-dark)', fontSize: 14 }}>
            ⏳ Votre enseigne est en attente de vérification — elle sera visible des clients une fois validée par l’équipe BjDrive.
          </div>
        )}

        <form onSubmit={submit}>
          <label className="field">
            <span>Nom de l’enseigne</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex. Supermarché Erevan" />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={3} placeholder="Quelques mots sur votre enseigne…" />
          </label>

          <label className="field">
            <span>Catégorie</span>
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Choisir —</option>
              {(cats.data || []).map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
          </label>
          {cats.error && <ErrorBox error={cats.error} onRetry={cats.reload} />}

          <div className="field">
            <span>Logo</span>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {EMOJIS.map((em) => (
                <button
                  type="button"
                  key={em}
                  className={`btn small ${form.emoji === em ? '' : 'outline'}`}
                  onClick={() => set('emoji', em)}
                  style={{ fontSize: 20, minWidth: 46 }}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span>Couleur</span>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => set('color', c)}
                  aria-label={c}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: c,
                    border: form.color === c ? '3px solid var(--green-dark)' : '2px solid var(--line)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>

          <label className="field">
            <span>Adresse</span>
            <input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Rue, quartier, ville" />
          </label>

          <label className="field">
            <span>Frais de livraison (FCFA, optionnel)</span>
            <input type="number" min="0" value={form.deliveryFee} onChange={(e) => set('deliveryFee', e.target.value)} placeholder="Ex. 500" />
          </label>

          <div className="field">
            <span>Position de l’enseigne</span>
            <button type="button" className="btn outline" onClick={locate} disabled={locating}>
              {locating ? 'Localisation…' : '📍 Définir sur ma position'}
            </button>
            {form.lat != null && form.lng != null && (
              <>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                  {form.deliveryFee !== '' && form.deliveryFee != null ? ` · Livraison ${formatFCFA(form.deliveryFee)}` : ''}
                </div>
                <div style={{ marginTop: 8 }}>
                  <DeliveryMap origin={{ lat: form.lat, lng: form.lng }} />
                </div>
              </>
            )}
          </div>

          <div className="footer-bar">
            <button type="submit" className="btn" disabled={saving}>
              {saving ? 'Enregistrement…' : existing ? 'Enregistrer' : 'Créer mon enseigne'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
