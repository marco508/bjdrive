import { useState } from 'react'
import { api } from '../../services/api.js'
import { useApp } from '../../context/AppContext.jsx'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Empty, Loader, ErrorBox } from '../../components/ui.jsx'
import DeliveryMap from '../../components/DeliveryMap.jsx'
import Icon from '../../components/Icon.jsx'

// Extrait des coordonnées d'un lien Google Maps / partage de position WhatsApp,
// ou d'une saisie « lat, lng ». Renvoie {lat,lng} ou null.
export function parseLocation(input) {
  if (!input) return null
  const s = String(input).trim()
  // "6.36, 2.42" ou "6.36 2.42"
  const plain = s.match(/^(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/)
  if (plain) return { lat: Number(plain[1]), lng: Number(plain[2]) }
  // .../@6.36,2.42,15z  ou  ?q=6.36,2.42  ou  ?query=6.36,2.42  ou  !3d6.36!4d2.42
  const at = s.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) }
  const q = s.match(/[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)
  if (q) return { lat: Number(q[1]), lng: Number(q[2]) }
  const d3d4 = s.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/)
  if (d3d4) return { lat: Number(d3d4[1]), lng: Number(d3d4[2]) }
  return null
}

const EMPTY = { name: '', phone: '', address: '', note: '', locInput: '', lat: null, lng: null }

export default function Beneficiaries() {
  const { showToast } = useApp()
  const listQ = useAsync(api.beneficiaries, [])
  const [form, setForm] = useState(null) // null = fermé ; sinon objet en édition
  const [busy, setBusy] = useState(false)

  const rows = listQ.data || []

  function openNew() { setForm({ ...EMPTY }) }
  function openEdit(b) {
    setForm({ id: b.id, name: b.name, phone: b.phone, address: b.address || '', note: b.note || '', locInput: `${b.lat}, ${b.lng}`, lat: b.lat, lng: b.lng })
  }

  function applyLocation() {
    const p = parseLocation(form.locInput)
    if (!p) return showToast('Lien ou coordonnées non reconnus. Collez le lien de position WhatsApp/Google Maps du proche, ou « latitude, longitude ».')
    setForm((f) => ({ ...f, lat: p.lat, lng: p.lng }))
  }

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) return showToast('Nom et téléphone requis.')
    if (form.lat == null || form.lng == null) return showToast('Précisez la position du proche (lien ou coordonnées).')
    setBusy(true)
    try {
      const dto = { name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || undefined, note: form.note.trim() || undefined, lat: form.lat, lng: form.lng }
      if (form.id) await api.updateBeneficiary(form.id, dto)
      else await api.addBeneficiary(dto)
      showToast('Proche enregistré ✅')
      setForm(null)
      listQ.reload()
    } catch (e) {
      showToast('Erreur : ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(b) {
    if (!window.confirm(`Supprimer ${b.name} de vos proches ?`)) return
    try {
      await api.removeBeneficiary(b.id)
      listQ.reload()
    } catch (e) {
      showToast('Erreur : ' + e.message)
    }
  }

  return (
    <>
      <TopBar title="Mes proches" subtitle="Commander pour eux au Bénin" back />
      <div className="screen">
        <div className="card" style={{ background: 'var(--green-soft)' }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            Enregistrez les personnes pour qui vous commandez au Bénin. Au moment de payer, choisissez « Pour un proche »
            et le livreur ira les livrer directement — vous payez depuis ici, elles reçoivent là-bas.
          </p>
        </div>

        {listQ.loading && !listQ.data && <Loader label="Chargement…" />}
        <ErrorBox error={listQ.error} onRetry={listQ.reload} />

        {!listQ.loading && rows.length === 0 && !form && (
          <Empty iconName="group" title="Aucun proche enregistré" text="Ajoutez un proche pour lui envoyer des courses.">
            <button className="btn" style={{ maxWidth: 240, margin: '14px auto 0' }} onClick={openNew}>Ajouter un proche</button>
          </Empty>
        )}

        {rows.map((b) => (
          <div key={b.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{b.name}</strong>
                <div className="muted" style={{ fontSize: 13 }}>{b.phone}</div>
                {b.address && <div className="muted" style={{ fontSize: 13 }}>📍 {b.address}</div>}
                {b.note && <div className="muted" style={{ fontSize: 12 }}>📝 {b.note}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn ghost small" onClick={() => openEdit(b)}>Modifier</button>
                <button className="btn ghost small" style={{ color: 'var(--red)' }} onClick={() => remove(b)}>Suppr.</button>
              </div>
            </div>
          </div>
        ))}

        {rows.length > 0 && !form && (
          <button className="btn outline" style={{ marginTop: 6 }} onClick={openNew}>+ Ajouter un proche</button>
        )}

        {form && (
          <div className="card">
            <p className="section-title" style={{ marginTop: 0 }}>{form.id ? 'Modifier le proche' : 'Nouveau proche'}</p>
            <label className="field">
              <span>Nom du proche</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex : Maman Adjovi" />
            </label>
            <label className="field">
              <span>Téléphone (le livreur l'appellera)</span>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+229 ..." />
            </label>
            <label className="field">
              <span>Adresse / quartier (repère)</span>
              <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Ex : Akpakpa, près du marché" />
            </label>
            <label className="field">
              <span>Position du proche</span>
              <input value={form.locInput} onChange={(e) => setForm((f) => ({ ...f, locInput: e.target.value }))} placeholder="Collez le lien de position WhatsApp/Google Maps, ou 6.36, 2.42" />
            </label>
            <button className="btn ghost small" onClick={applyLocation}>Valider la position</button>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              💡 Demandez à votre proche de vous partager sa position sur WhatsApp, puis collez le lien ici.
            </p>
            {form.lat != null && (
              <>
                <div style={{ marginTop: 10 }}>
                  <DeliveryMap destination={{ lat: form.lat, lng: form.lng }} />
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  <Icon name="checkCircle" size={14} color="var(--green-dark)" /> Position enregistrée : {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                </div>
              </>
            )}
            <label className="field" style={{ marginTop: 10 }}>
              <span>Note (optionnel)</span>
              <textarea rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Ex : maison bleue, appeler avant" />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button className="btn outline" onClick={() => setForm(null)}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
