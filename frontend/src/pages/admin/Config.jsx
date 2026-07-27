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
    allowCashOnDelivery: true,
    trustedDriverDeliveries: '',
    newDriverMaxOrderTotal: '',
    payoutDelayDays: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) {
      setForm({
        baseDeliveryFee: data.baseDeliveryFee ?? '',
        perKmFee: data.perKmFee ?? '',
        commissionPercent: data.commissionRate != null ? data.commissionRate * 100 : '',
        maxDeliveriesPerDay: data.maxDeliveriesPerDay ?? '',
        allowCashOnDelivery: data.allowCashOnDelivery ?? true,
        trustedDriverDeliveries: data.trustedDriverDeliveries ?? '',
        newDriverMaxOrderTotal: data.newDriverMaxOrderTotal ?? '',
        payoutDelayDays: data.payoutDelayDays ?? '',
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
        allowCashOnDelivery: !!form.allowCashOnDelivery,
        trustedDriverDeliveries: Number(form.trustedDriverDeliveries) || 20,
        newDriverMaxOrderTotal: Number(form.newDriverMaxOrderTotal) || 0,
        payoutDelayDays: Number(form.payoutDelayDays) || 0,
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

            <label style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 0 8px' }}>
              <input
                type="checkbox"
                checked={!!form.allowCashOnDelivery}
                onChange={(e) => setForm((f) => ({ ...f, allowCashOnDelivery: e.target.checked }))}
              />
              <span>💵 Autoriser le paiement en espèces à la livraison</span>
            </label>

            <p className="section-title">🛡️ Anti-fraude</p>

            <label className="field">
              <span>Livraisons réussies pour devenir livreur « confirmé »</span>
              <input type="number" inputMode="numeric" value={form.trustedDriverDeliveries} onChange={set('trustedDriverDeliveries')} />
            </label>

            <label className="field">
              <span>Valeur max d'une commande pour un nouveau livreur (FCFA)</span>
              <input type="number" inputMode="numeric" value={form.newDriverMaxOrderTotal} onChange={set('newDriverMaxOrderTotal')} />
            </label>
            <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
              Avant d'être confirmé, un livreur ne voit ni les commandes en espèces, ni celles au-dessus de ce plafond.
            </p>

            <label className="field">
              <span>Délai avant versement après livraison (jours — fenêtre de litige)</span>
              <input type="number" inputMode="numeric" value={form.payoutDelayDays} onChange={set('payoutDelayDays')} />
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
