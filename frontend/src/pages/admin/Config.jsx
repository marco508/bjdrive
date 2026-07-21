import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext.jsx'
import { api } from '../../services/api.js'
import { useAsync } from '../../components/useApi.js'
import { TopBar, Loader, ErrorBox } from '../../components/ui.jsx'

export default function AdminConfig() {
  const { logout, showToast } = useApp()
  const { data, loading, error, reload } = useAsync(api.adminConfig, [])

  const [form, setForm] = useState({
    baseDeliveryFee: '',
    perKmFee: '',
    commissionPercent: '',
    maxDeliveriesPerDay: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) {
      setForm({
        baseDeliveryFee: data.baseDeliveryFee ?? '',
        perKmFee: data.perKmFee ?? '',
        commissionPercent: data.commissionRate != null ? data.commissionRate * 100 : '',
        maxDeliveriesPerDay: data.maxDeliveriesPerDay ?? '',
      })
    }
  }, [data])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const logoutBtn = <button className="pill" onClick={logout}>Quitter</button>

  async function save() {
    setSaving(true)
    try {
      await api.adminUpdateConfig({
        baseDeliveryFee: Number(form.baseDeliveryFee),
        perKmFee: Number(form.perKmFee),
        commissionRate: Number(form.commissionPercent) / 100,
        maxDeliveriesPerDay: Number(form.maxDeliveriesPerDay),
      })
      showToast('Réglages enregistrés')
      reload()
    } catch (e) {
      showToast(e.message || 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <TopBar title="Réglages plateforme" right={logoutBtn} />
      <div className="screen">
        {loading && <Loader />}
        <ErrorBox error={error} onRetry={reload} />

        {!loading && !error && data && (
          <div className="card">
            <label className="field">
              <span>Frais de livraison de base ({data.currency || 'FCFA'})</span>
              <input
                type="number"
                inputMode="numeric"
                value={form.baseDeliveryFee}
                onChange={set('baseDeliveryFee')}
              />
            </label>

            <label className="field">
              <span>Tarif par km ({data.currency || 'FCFA'})</span>
              <input
                type="number"
                inputMode="numeric"
                value={form.perKmFee}
                onChange={set('perKmFee')}
              />
            </label>

            <label className="field">
              <span>Commission plateforme (%)</span>
              <input
                type="number"
                inputMode="numeric"
                value={form.commissionPercent}
                onChange={set('commissionPercent')}
              />
            </label>

            <label className="field">
              <span>Plafond de livraisons par livreur / jour</span>
              <input
                type="number"
                inputMode="numeric"
                value={form.maxDeliveriesPerDay}
                onChange={set('maxDeliveriesPerDay')}
              />
            </label>

            <div className="divider" />

            <button className="btn" disabled={saving} onClick={save}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>

            <p className="muted" style={{ marginBottom: 0, marginTop: 12, fontSize: 13 }}>
              Ces réglages s'appliquent aux futures commandes et acceptations de
              livraison.
            </p>
          </div>
        )}
      </div>
    </>
  )
}
