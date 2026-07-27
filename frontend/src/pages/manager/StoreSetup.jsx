import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Loader, ErrorBox } from '../../components/ui.jsx'

// Comptes employés : créés par le gérant, rattachés à SON enseigne.
// Un employé se connecte avec son e-mail et gère produits, stocks et commandes.
function StaffSection({ store, showToast }) {
  const staffQ = useAsync(() => api.listStaff(store.id), [store.id])
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function add(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      return showToast('Nom, e-mail et mot de passe (6 caractères min) requis.')
    }
    setBusy(true)
    try {
      await api.addStaff(store.id, { ...form, phone: form.phone || undefined })
      showToast('Compte employé créé ✅ Transmettez-lui ses identifiants.')
      setForm({ name: '', email: '', password: '', phone: '' })
      setOpen(false)
      staffQ.reload()
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(s) {
    if (!window.confirm(`Supprimer le compte employé de ${s.name} ?`)) return
    try {
      await api.removeStaff(store.id, s.id)
      showToast('Employé retiré.')
      staffQ.reload()
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="section-title" style={{ margin: 0 }}>👥 Mes employés</p>
        <button type="button" className="btn small outline" onClick={() => setOpen((o) => !o)}>
          {open ? '✕ Annuler' : '+ Ajouter'}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        Vos employés se connectent avec leur propre compte pour renseigner les produits (avec scanner de
        code-barres sur mobile), gérer les stocks, préparer les commandes et répondre aux clients.
      </p>

      {open && (
        <form onSubmit={add} style={{ marginTop: 8 }}>
          <div className="row">
            <label className="field"><span>Nom</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label>
            <label className="field"><span>Téléphone (optionnel)</span>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+229 ..." /></label>
          </div>
          <div className="row">
            <label className="field"><span>E-mail de connexion</span>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></label>
            <label className="field"><span>Mot de passe</span>
              <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="6 caractères min" /></label>
          </div>
          <button className="btn small" disabled={busy}>Créer le compte employé</button>
        </form>
      )}

      <ErrorBox error={staffQ.error} onRetry={staffQ.reload} />
      {(staffQ.data || []).map((s) => (
        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)', marginTop: 8 }}>
          <div>
            <strong style={{ fontSize: 14 }}>{s.name}</strong>
            <div className="muted" style={{ fontSize: 12 }}>✉️ {s.email}{s.phone ? ` · 📞 ${s.phone}` : ''}</div>
          </div>
          <button type="button" className="btn danger small" onClick={() => remove(s)}>Retirer</button>
        </div>
      ))}
      {!staffQ.loading && (staffQ.data || []).length === 0 && (
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Aucun employé pour l'instant.</p>
      )}
    </div>
  )
}
import { STORE_STATUS_LABELS } from '../../services/constants.js'
import { getCurrentPosition } from '../../lib/geo.js'
import { imageSrc } from '../../config.js'
import DeliveryMap from '../../components/DeliveryMap.jsx'
import AccountDanger from '../../components/AccountDanger.jsx'

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
      showToast('Position GPS indisponible. Activez la localisation pour placer votre enseigne.')
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

        {existing && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {existing.imageUrl ? (
              <img src={imageSrc(existing.imageUrl)} alt={existing.name}
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} />
            ) : (
              <div className="store-logo" style={{ width: 64, height: 64, fontSize: 30 }}>{existing.emoji || '🏪'}</div>
            )}
            <label className="btn outline small" style={{ cursor: 'pointer' }}>
              📷 {existing.imageUrl ? 'Changer la photo' : 'Ajouter une photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    await api.uploadStoreImage(existing.id, file)
                    showToast('Photo de l’enseigne mise à jour 📷')
                    reload()
                  } catch (err) {
                    showToast(err.message || 'Envoi impossible.')
                  }
                }} />
            </label>
          </div>
        )}

        {existing && <StaffSection store={existing} showToast={showToast} />}

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

          <div className="field">
            <span>Position de l’enseigne</span>
            <button type="button" className="btn outline" onClick={locate} disabled={locating}>
              {locating ? 'Localisation…' : '📍 Définir sur ma position'}
            </button>
            {form.lat != null && form.lng != null && (
              <>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
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

        <div style={{ marginTop: 24 }}>
          <AccountDanger />
        </div>
      </div>
    </>
  )
}
