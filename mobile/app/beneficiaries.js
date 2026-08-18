// Carnet de proches au Bénin (diaspora) : le client enregistre les personnes
// pour qui il commande. La position se saisit en collant le lien de position
// WhatsApp/Google Maps du proche (ou « latitude, longitude »).
import { useCallback, useEffect, useState } from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import { api } from '../src/api'
import { Btn, Card, Field, Loader, SectionTitle } from '../src/ui'
import { C } from '../src/theme'

export function parseLocation(input) {
  if (!input) return null
  const s = String(input).trim()
  const plain = s.match(/^(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)$/)
  if (plain) return { lat: Number(plain[1]), lng: Number(plain[2]) }
  const at = s.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) }
  const q = s.match(/[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/)
  if (q) return { lat: Number(q[1]), lng: Number(q[2]) }
  const d = s.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/)
  if (d) return { lat: Number(d[1]), lng: Number(d[2]) }
  return null
}

const EMPTY = { name: '', phone: '', address: '', note: '', locInput: '', lat: null, lng: null }

export default function Beneficiaries() {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.beneficiaries().then(setRows).catch(() => setRows([]))
  }, [])
  useEffect(() => { load() }, [load])

  function openEdit(b) {
    setForm({ id: b.id, name: b.name, phone: b.phone, address: b.address || '', note: b.note || '', locInput: `${b.lat}, ${b.lng}`, lat: b.lat, lng: b.lng })
  }

  function applyLocation() {
    const p = parseLocation(form.locInput)
    if (!p) return Alert.alert('Position non reconnue', 'Collez le lien de position WhatsApp/Google Maps du proche, ou « latitude, longitude ».')
    setForm((f) => ({ ...f, lat: p.lat, lng: p.lng }))
  }

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) return Alert.alert('Champs requis', 'Nom et téléphone requis.')
    if (form.lat == null) return Alert.alert('Position requise', 'Validez la position du proche.')
    setBusy(true)
    try {
      const dto = { name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || undefined, note: form.note.trim() || undefined, lat: form.lat, lng: form.lng }
      if (form.id) await api.updateBeneficiary(form.id, dto)
      else await api.addBeneficiary(dto)
      setForm(null)
      load()
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  function remove(b) {
    Alert.alert('Supprimer', `Supprimer ${b.name} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { try { await api.removeBeneficiary(b.id); load() } catch (e) { Alert.alert('Erreur', e.message) } } },
    ])
  }

  if (!rows) return <Loader />

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Card style={{ backgroundColor: C.greenSoft }}>
        <Text style={{ fontSize: 14 }}>
          Enregistrez vos proches au Bénin. À la commande, choisissez « Pour un proche » : vous payez d'ici, il/elle reçoit là-bas.
        </Text>
      </Card>

      {rows.map((b) => (
        <Card key={b.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>{b.name}</Text>
              <Text style={{ color: C.muted, fontSize: 13 }}>{b.phone}</Text>
              {!!b.address && <Text style={{ color: C.muted, fontSize: 13 }}>📍 {b.address}</Text>}
            </View>
            <View style={{ gap: 6 }}>
              <Btn title="Modifier" variant="outline" style={{ paddingVertical: 6, paddingHorizontal: 12 }} onPress={() => openEdit(b)} />
              <Btn title="Suppr." variant="outline" style={{ paddingVertical: 6, paddingHorizontal: 12 }} onPress={() => remove(b)} />
            </View>
          </View>
        </Card>
      ))}

      {!form && <Btn title="+ Ajouter un proche" variant={rows.length ? 'outline' : 'primary'} onPress={() => setForm({ ...EMPTY })} />}

      {form && (
        <Card>
          <SectionTitle>{form.id ? 'Modifier le proche' : 'Nouveau proche'}</SectionTitle>
          <Field label="Nom du proche" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Ex : Maman Adjovi" />
          <Field label="Téléphone (le livreur l'appellera)" value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="+229 ..." keyboardType="phone-pad" />
          <Field label="Adresse / quartier (repère)" value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} placeholder="Ex : Akpakpa, près du marché" />
          <Field label="Position (lien WhatsApp/Maps ou 6.36, 2.42)" value={form.locInput} onChangeText={(v) => setForm((f) => ({ ...f, locInput: v }))} placeholder="Collez le lien de position" />
          <Btn title="Valider la position" variant="outline" style={{ paddingVertical: 8 }} onPress={applyLocation} />
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
            💡 Demandez à votre proche de partager sa position sur WhatsApp, puis collez le lien ici.
          </Text>
          {form.lat != null && (
            <Text style={{ color: C.greenDark, fontSize: 12, marginTop: 6 }}>✓ Position : {form.lat.toFixed(5)}, {form.lng.toFixed(5)}</Text>
          )}
          <Field label="Note (optionnel)" value={form.note} onChangeText={(v) => setForm((f) => ({ ...f, note: v }))} placeholder="Ex : maison bleue, appeler avant" />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Btn title={busy ? 'Enregistrement…' : 'Enregistrer'} disabled={busy} onPress={save} />
            <Btn title="Annuler" variant="outline" onPress={() => setForm(null)} />
          </View>
        </Card>
      )}
    </ScrollView>
  )
}
