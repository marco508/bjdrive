// Espace EMPLOYÉ mobile : scanner de code-barres (caméra), stocks,
// préparation des commandes, retraits sur place, chat client.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { api } from '../../src/api'
import { useApp } from '../../src/store'
import ChatBox from '../../src/ChatBox'
import OnboardingGate from '../../src/OnboardingGate'
import { BioToggle } from '../../src/biolock'
import DeleteAccount from '../../src/DeleteAccount'
import { Badge, Btn, Card, Empty, ErrorBox, Field, Loader, RowBetween, SectionTitle } from '../../src/ui'
import { C, STATUS_ICON, STATUS_LABELS, formatFCFA } from '../../src/theme'

export default function StaffDashboard() {
  const router = useRouter()
  const { logout } = useApp()
  const [store, setStore] = useState(null)
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('orders')

  const load = useCallback(async () => {
    setError(null)
    try {
      const s = await api.staffMyStore()
      setStore(s)
      setOrders(await api.storeOrders(s.id))
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <OnboardingGate role="STAFF" />
      <ErrorBox error={error} onRetry={load} />
      {!store && !error && <Loader />}
      {store && (
        <>
          <Card>
            <Text style={{ fontWeight: '800', fontSize: 18 }}>{store.emoji || '🏪'} {store.name}</Text>
            <Text style={{ color: C.muted, fontSize: 13 }}>📍 {store.address}</Text>
          </Card>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Btn title="🧾 Commandes" variant={tab === 'orders' ? 'primary' : 'outline'} style={{ flex: 1, paddingVertical: 10 }} onPress={() => setTab('orders')} />
            <Btn title="📷 Produits & scan" variant={tab === 'products' ? 'primary' : 'outline'} style={{ flex: 1, paddingVertical: 10 }} onPress={() => setTab('products')} />
          </View>

          {tab === 'orders' && <OrdersTab store={store} orders={orders} reload={load} />}
          {tab === 'products' && <ProductsTab store={store} reload={load} />}
        </>
      )}
      <BioToggle />
      <Btn title="Se déconnecter" variant="ghost" onPress={async () => { await logout(); router.replace('/') }} />
      <DeleteAccount />
    </ScrollView>
  )
}

function OrdersTab({ store, orders, reload }) {
  const [busyId, setBusyId] = useState(null)
  const [codes, setCodes] = useState({})
  const list = [...(orders || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  async function markReady(orderId) {
    setBusyId(orderId)
    try {
      await api.markStoreReady(orderId, store.id)
      await reload()
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function completePickup(orderId) {
    setBusyId(orderId)
    try {
      await api.completePickup(orderId, store.id, (codes[orderId] || '').trim())
      Alert.alert('✅', 'Commande remise au client !')
      await reload()
    } catch (e) {
      Alert.alert('Code refusé', e.message)
    } finally {
      setBusyId(null)
    }
  }

  async function handover(orderId) {
    setBusyId(orderId)
    try {
      const r = await api.confirmHandover(orderId, store.id)
      Alert.alert('🤝', `Remise au livreur ${r.driver} enregistrée.`)
      await reload()
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusyId(null)
    }
  }

  if (!orders) return <Loader />
  if (list.length === 0) return <Empty icon="🧾" title="Aucune commande" text="Les commandes clients s'afficheront ici." />

  return (
    <>
      {list.map((o) => (
        <Card key={o.id}>
          <RowBetween>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              {new Date(o.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {o.fulfillment === 'PICKUP' ? ' · 🏪 retrait' : ''}
              {o.paymentMethod === 'CASH' ? ' · 💵' : ''}
            </Text>
            <Badge tone={o.status === 'DELIVERED' ? 'green' : o.status === 'CANCELLED' ? 'red' : 'yellow'}>
              {STATUS_ICON[o.status]} {STATUS_LABELS[o.status]}
            </Badge>
          </RowBetween>
          {(o.items || []).map((it) => (
            <RowBetween key={it.productId} style={{ paddingVertical: 3 }}>
              <Text style={{ flex: 1 }} numberOfLines={1}>{it.emoji} {it.name} ×{it.qty}</Text>
              <Text>{formatFCFA(it.price * it.qty)}</Text>
            </RowBetween>
          ))}

          {['AWAITING_DRIVER', 'AWAITING_PICKUP'].includes(o.status) && !o.part?.pickedUpAt &&
            (o.part?.readyAt ? (
              <Badge>📦 Prête</Badge>
            ) : (
              <Btn title="📦 Marquer comme prête" variant="outline" style={{ marginTop: 8 }} disabled={busyId === o.id} onPress={() => markReady(o.id)} />
            ))}

          {o.fulfillment !== 'PICKUP' && o.status === 'AWAITING_PICKUP' && o.delivery &&
            (o.part?.handedOverAt ? (
              <Badge>🤝 Remise au livreur confirmée</Badge>
            ) : (
              <Btn title="🤝 Confirmer la remise au livreur" variant="outline" style={{ marginTop: 8 }} disabled={busyId === o.id} onPress={() => handover(o.id)} />
            ))}

          {o.fulfillment === 'PICKUP' && o.status === 'AWAITING_PICKUP' && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TextInput
                placeholder="Code du client"
                placeholderTextColor={C.muted}
                keyboardType="number-pad"
                maxLength={6}
                value={codes[o.id] || ''}
                onChangeText={(t) => setCodes((c) => ({ ...c, [o.id]: t.replace(/\D/g, '') }))}
                style={{ flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, color: C.ink }}
              />
              <Btn title="✅ Remettre" style={{ paddingHorizontal: 14 }} disabled={busyId === o.id || !(codes[o.id] || '').trim()} onPress={() => completePickup(o.id)} />
            </View>
          )}

          {o.status !== 'PENDING_PAYMENT' && o.status !== 'CANCELLED' && (
            <View style={{ marginTop: 10 }}>
              <ChatBox orderId={o.id} />
            </View>
          )}
        </Card>
      ))}
    </>
  )
}

function ProductsTab({ store, reload }) {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanning, setScanning] = useState(false)
  const [found, setFound] = useState(null)
  const [form, setForm] = useState({ name: '', price: '', stock: '', unit: 'pièce', barcode: '' })
  const [busy, setBusy] = useState(false)
  const scannedRef = useRef(false)

  async function openScanner() {
    if (!permission?.granted) {
      const res = await requestPermission()
      if (!res.granted) return Alert.alert('Caméra requise', 'Autorisez la caméra pour scanner les codes-barres.')
    }
    scannedRef.current = false
    setScanning(true)
  }

  async function onScanned({ data }) {
    if (scannedRef.current || !data) return
    scannedRef.current = true
    setScanning(false)
    setBusy(true)
    try {
      const res = await api.findByBarcode(store.id, String(data))
      setFound(res)
      if (!res.found) setForm((f) => ({ ...f, barcode: String(data) }))
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  async function createProduct() {
    if (!form.name.trim() || form.price === '') return Alert.alert('Champs requis', 'Nom et prix du produit.')
    setBusy(true)
    try {
      await api.addProduct(store.id, {
        name: form.name.trim(),
        price: Number(form.price),
        stock: Number(form.stock) || 0,
        unit: form.unit || 'pièce',
        barcode: form.barcode || undefined,
      })
      Alert.alert('✅', 'Produit ajouté !')
      setFound(null)
      setForm({ name: '', price: '', stock: '', unit: 'pièce', barcode: '' })
      await reload()
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  async function changeStock(p, delta) {
    const next = Math.max(0, (p.stock || 0) + delta)
    try {
      await api.updateProduct(p.id, { stock: next })
      setFound((f) => (f?.product?.id === p.id ? { ...f, product: { ...f.product, stock: next } } : f))
      await reload()
    } catch (e) {
      Alert.alert('Erreur', e.message)
    }
  }

  return (
    <>
      <Card>
        <SectionTitle>📷 Scanner un code-barres</SectionTitle>
        <Text style={{ color: C.muted, fontSize: 13, marginBottom: 10 }}>
          Scannez un produit : s'il existe, ajustez son stock ; sinon, ajoutez-le. Le code est propre à votre enseigne.
        </Text>
        <Btn title={busy ? 'Recherche…' : '📷 Scanner avec la caméra'} onPress={openScanner} disabled={busy} />

        {found && found.found && (
          <View style={{ marginTop: 12, padding: 12, backgroundColor: C.greenSoft, borderRadius: 12 }}>
            <Text style={{ fontWeight: '700' }}>✅ {found.product.emoji || '🛍️'} {found.product.name}</Text>
            <Text style={{ color: C.muted, fontSize: 13 }}>{formatFCFA(found.product.price)} / {found.product.unit}</Text>
            <RowBetween style={{ marginTop: 8 }}>
              <Btn title="−" variant="outline" style={{ paddingHorizontal: 18, paddingVertical: 8 }} onPress={() => changeStock(found.product, -1)} />
              <Text style={{ fontWeight: '800', fontSize: 18 }}>Stock : {found.product.stock}</Text>
              <Btn title="+" variant="outline" style={{ paddingHorizontal: 18, paddingVertical: 8 }} onPress={() => changeStock(found.product, 1)} />
            </RowBetween>
          </View>
        )}

        {found && !found.found && (
          <View style={{ marginTop: 12, padding: 12, backgroundColor: '#fff7d6', borderRadius: 12 }}>
            <Text style={{ fontWeight: '700', marginBottom: 8 }}>❔ Code inconnu ({form.barcode}) — nouveau produit</Text>
            <Field label="Nom du produit" value={form.name} onChangeText={(t) => setForm((f) => ({ ...f, name: t }))} placeholder="Ex : Riz parfumé 5 kg" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label="Prix (FCFA)" value={form.price} onChangeText={(t) => setForm((f) => ({ ...f, price: t.replace(/\D/g, '') }))} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Stock" value={form.stock} onChangeText={(t) => setForm((f) => ({ ...f, stock: t.replace(/\D/g, '') }))} keyboardType="number-pad" />
              </View>
            </View>
            <Btn title="Ajouter le produit" onPress={createProduct} disabled={busy} />
          </View>
        )}
      </Card>

      <SectionTitle>Stocks ({(store.products || []).length} produits)</SectionTitle>
      {(store.products || []).map((p) => (
        <Card key={p.id}>
          <RowBetween>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600' }}>{p.emoji || '🛍️'} {p.name}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>
                {formatFCFA(p.price)} / {p.unit}{p.barcode ? ` · ▮▮ ${p.barcode}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Btn title="−" variant="ghost" style={{ paddingVertical: 6, paddingHorizontal: 13 }} onPress={() => changeStock(p, -1)} />
              <Text style={{ fontWeight: '700', minWidth: 22, textAlign: 'center' }}>{p.stock}</Text>
              <Btn title="+" variant="ghost" style={{ paddingVertical: 6, paddingHorizontal: 13 }} onPress={() => changeStock(p, 1)} />
            </View>
          </RowBetween>
        </Card>
      ))}

      {/* Scanner plein écran */}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
            onBarcodeScanned={onScanned}
          />
          <View style={{ position: 'absolute', top: '42%', left: 30, right: 30, height: 2, backgroundColor: C.yellow, opacity: 0.9 }} />
          <Pressable onPress={() => setScanning(false)} style={{ position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,.92)', borderRadius: 14, paddingHorizontal: 26, paddingVertical: 14 }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>✕ Fermer</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  )
}
