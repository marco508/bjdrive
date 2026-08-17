// Suivi de commande en temps réel : statut, code de réception, position livreur, avis.
import { useCallback, useEffect, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { api } from '../../src/api'
import { trackOrder } from '../../src/realtime'
import { useApp } from '../../src/store'
import ChatBox from '../../src/ChatBox'
import { Badge, Btn, Card, ErrorBox, Loader, RowBetween, SectionTitle } from '../../src/ui'
import { C, ORDER_FLOW, STATUS_ICON, STATUS_LABELS, formatFCFA } from '../../src/theme'

export default function Track() {
  const { id } = useLocalSearchParams()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState(null)
  const [driverPos, setDriverPos] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setOrder(await api.order(id))
    } catch (e) {
      setError(e)
    }
  }, [id])

  useEffect(() => {
    load()
    const unsub = trackOrder(id, {
      onUpdate: () => load(),
      onDriver: (d) => setDriverPos({ lat: d.lat, lng: d.lng }),
    })
    return () => unsub()
  }, [id, load])

  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!order) return <Loader />

  const status = order.status
  const isPickup = order.fulfillment === 'PICKUP'
  const showCode = status === 'AWAITING_PICKUP' || status === 'IN_DELIVERY'
  const currentIdx = ORDER_FLOW.indexOf(status)
  const driver = order.delivery?.driver

  async function cancel() {
    setBusy(true)
    try {
      await api.cancelOrder(order.id)
      load()
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Card style={{ alignItems: 'center' }}>
        <Text style={{ fontSize: 40 }}>{isPickup && status === 'AWAITING_PICKUP' ? '🏪' : STATUS_ICON[status]}</Text>
        <Text style={{ fontWeight: '800', fontSize: 18, marginTop: 4 }}>
          {isPickup && status === 'AWAITING_PICKUP' ? 'Préparation — à retirer sur place' : STATUS_LABELS[status]}
        </Text>
      </Card>

      {isPickup && status === 'AWAITING_PICKUP' && (
        <Card style={{ backgroundColor: C.greenSoft }}>
          <Text style={{ fontSize: 14 }}>
            🏪 À retirer chez <Text style={{ fontWeight: '700' }}>{order.stores?.[0]?.store?.name}</Text>
            {'\n'}📍 {order.stores?.[0]?.store?.address}
          </Text>
        </Card>
      )}

      {status !== 'CANCELLED' && status !== 'PENDING_PAYMENT' && <ChatBox orderId={order.id} />}

      {showCode && (
        <Card style={{ backgroundColor: C.green, alignItems: 'center', borderColor: C.green }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Votre code de réception</Text>
          <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: 6 }}>{order.receptionCode}</Text>
          <Text style={{ color: 'rgba(255,255,255,.9)', fontSize: 13 }}>Communiquez ce code au livreur à la remise.</Text>
          {order.paymentMethod === 'CASH' && (
            <Text style={{ color: '#fff', fontWeight: '700', marginTop: 8 }}>💵 À préparer en espèces : {formatFCFA(order.total)}</Text>
          )}
        </Card>
      )}

      {driver && (
        <Card>
          <RowBetween>
            <View>
              <Text style={{ fontWeight: '700' }}>🛵 {driver.name}</Text>
              <Text style={{ color: C.muted, fontSize: 13 }}>{driver.phone}</Text>
            </View>
            <Btn title="📞 Appeler" variant="ghost" style={{ paddingHorizontal: 14, paddingVertical: 10 }} onPress={() => Linking.openURL(`tel:${driver.phone}`)} />
          </RowBetween>
          {driverPos && (
            <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${driverPos.lat},${driverPos.lng}`)}>
              <Text style={{ color: C.greenDark, fontWeight: '600', marginTop: 10 }}>📍 Voir la position du livreur sur la carte ›</Text>
            </Pressable>
          )}
        </Card>
      )}

      {status === 'IN_DELIVERY' && order.scheduledDeliveryAt && (
        <Card>
          <Text>
            🕒 Livraison prévue vers{' '}
            <Text style={{ fontWeight: '700' }}>
              {new Date(order.scheduledDeliveryAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Text>
        </Card>
      )}

      {!['CANCELLED', 'RETURNING', 'FAILED'].includes(status) && (
        <Card>
          <SectionTitle>Progression</SectionTitle>
          {ORDER_FLOW.map((stKey, i) => (
            <View key={stKey} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 16, opacity: i <= currentIdx ? 1 : 0.35 }}>{i < currentIdx ? '✅' : STATUS_ICON[stKey]}</Text>
              <Text style={{ fontWeight: i === currentIdx ? '700' : '400', color: i <= currentIdx ? C.ink : C.muted }}>
                {STATUS_LABELS[stKey]}
              </Text>
            </View>
          ))}
        </Card>
      )}

      {status === 'CANCELLED' && (
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 32 }}>❌</Text>
          <Text>Cette commande a été annulée.</Text>
          {order.paymentStatus === 'REFUND_PENDING' && <Text style={{ color: C.muted, fontSize: 13 }}>💸 Remboursement en cours de traitement.</Text>}
          {order.paymentStatus === 'REFUNDED' && <Text style={{ color: C.muted, fontSize: 13 }}>✅ Vous avez été remboursé.</Text>}
        </Card>
      )}

      {(status === 'RETURNING' || status === 'FAILED') && (
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 32 }}>↩️</Text>
          <Text style={{ textAlign: 'center' }}>
            {status === 'RETURNING'
              ? 'Le livreur n’a pas pu vous remettre la commande — elle retourne à l’enseigne.'
              : 'Cette commande n’a pas pu être livrée.'}
          </Text>
          {order.paymentStatus === 'REFUND_PENDING' && <Text style={{ color: C.muted, fontSize: 13 }}>💸 Remboursement en cours de traitement.</Text>}
          {order.paymentStatus === 'REFUNDED' && <Text style={{ color: C.muted, fontSize: 13 }}>✅ Vous avez été remboursé.</Text>}
        </Card>
      )}

      {status === 'DELIVERED' && <ReviewCard order={order} onDone={load} />}

      <Card>
        <SectionTitle>Détail</SectionTitle>
        {(order.items || []).map((it) => (
          <RowBetween key={it.id || it.productId} style={{ paddingVertical: 4 }}>
            <Text style={{ flex: 1 }} numberOfLines={1}>{it.emoji} {it.name} ×{it.qty}</Text>
            <Text>{formatFCFA(it.price * it.qty)}</Text>
          </RowBetween>
        ))}
        <FeeRows order={order} />
      </Card>

      {(status === 'AWAITING_DRIVER' || status === 'AWAITING_PICKUP') && (
        <Btn title="Annuler la commande" variant="danger" onPress={cancel} disabled={busy} />
      )}
    </ScrollView>
  )
}

// Sous-total + « Livraison & service » (détail dépliable) + total.
function FeeRows({ order }) {
  const [open, setOpen] = useState(false)
  const fees = order.deliveryFee + order.commission
  return (
    <>
      <RowBetween style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
        <Text style={{ color: C.muted }}>Sous-total</Text>
        <Text>{formatFCFA(order.subtotal)}</Text>
      </RowBetween>
      {fees > 0 && (
        <>
          <RowBetween style={{ paddingVertical: 3 }}>
            <Pressable onPress={() => setOpen((o) => !o)}>
              <Text style={{ color: C.muted }}>
                Livraison & service <Text style={{ color: C.greenDark, fontSize: 12, textDecorationLine: 'underline' }}>{open ? 'masquer' : 'voir le détail'}</Text>
              </Text>
            </Pressable>
            <Text>{formatFCFA(fees)}</Text>
          </RowBetween>
          {open && (
            <View style={{ paddingLeft: 12 }}>
              <RowBetween style={{ paddingVertical: 2 }}>
                <Text style={{ color: C.muted, fontSize: 13 }}>· Livraison (distance)</Text>
                <Text style={{ color: C.muted, fontSize: 13 }}>{formatFCFA(order.deliveryFee)}</Text>
              </RowBetween>
              <RowBetween style={{ paddingVertical: 2 }}>
                <Text style={{ color: C.muted, fontSize: 13 }}>· Frais de service BjDrive</Text>
                <Text style={{ color: C.muted, fontSize: 13 }}>{formatFCFA(order.commission)}</Text>
              </RowBetween>
            </View>
          )}
        </>
      )}
      <RowBetween style={{ marginTop: 6 }}>
        <Text style={{ fontWeight: '700' }}>Total</Text>
        <Text style={{ fontWeight: '800', fontSize: 18, color: C.greenDark }}>{formatFCFA(order.total)}</Text>
      </RowBetween>
    </>
  )
}

function Stars({ value, onChange }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)}>
          <Text style={{ fontSize: 26, opacity: n <= value ? 1 : 0.25 }}>⭐</Text>
        </Pressable>
      ))}
    </View>
  )
}

function ReviewCard({ order, onDone }) {
  const already = (order.reviews || []).length > 0
  const [driverRating, setDriverRating] = useState(0)
  const [storeRatings, setStoreRatings] = useState({})
  const [busy, setBusy] = useState(false)

  if (already) {
    return (
      <Card style={{ alignItems: 'center' }}>
        <Text>🙏 Merci pour votre avis !</Text>
      </Card>
    )
  }

  async function send() {
    setBusy(true)
    try {
      await api.reviewOrder(order.id, {
        driverRating: driverRating || undefined,
        stores: Object.entries(storeRatings)
          .filter(([, r]) => r > 0)
          .map(([storeId, rating]) => ({ storeId, rating })),
      })
      onDone()
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  const nothing = !driverRating && !Object.values(storeRatings).some((r) => r > 0)
  return (
    <Card>
      <SectionTitle>Notez votre expérience</SectionTitle>
      {order.delivery?.driver && (
        <View style={{ marginBottom: 10 }}>
          <Text style={{ marginBottom: 4 }}>🛵 Livreur · {order.delivery.driver.name}</Text>
          <Stars value={driverRating} onChange={setDriverRating} />
        </View>
      )}
      {(order.stores || []).map((os) => (
        <View key={os.storeId} style={{ marginBottom: 10 }}>
          <Text style={{ marginBottom: 4 }}>{os.store?.emoji} {os.store?.name}</Text>
          <Stars value={storeRatings[os.storeId] || 0} onChange={(n) => setStoreRatings((p) => ({ ...p, [os.storeId]: n }))} />
        </View>
      ))}
      <Btn title={busy ? 'Envoi…' : 'Envoyer mon avis'} onPress={send} disabled={busy || nothing} />
    </Card>
  )
}
