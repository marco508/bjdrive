// Espace livreur : vérification, courses proches (temps réel), cycle de livraison,
// partage GPS continu, gains du jour et des 30 derniers jours.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, ScrollView, Text, View, RefreshControl, Linking } from 'react-native'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { api } from '../../src/api'
import { onNewOrders } from '../../src/realtime'
import { useApp } from '../../src/store'
import ChatBox from '../../src/ChatBox'
import OnboardingGate from '../../src/OnboardingGate'
import { BioToggle } from '../../src/biolock'
import DeleteAccount from '../../src/DeleteAccount'
import { Badge, Btn, Card, Empty, ErrorBox, Field, Loader, RowBetween, SectionTitle } from '../../src/ui'
import { C, formatFCFA } from '../../src/theme'

export default function DriverDashboard() {
  const router = useRouter()
  const { user, logout } = useApp()
  const [pos, setPos] = useState(null)
  const [md, setMd] = useState(null)
  const [available, setAvailable] = useState([])
  const [earnings, setEarnings] = useState(null)
  const [error, setError] = useState(null)
  const [sharing, setSharing] = useState(false)
  const watcher = useRef(null)
  const lastSent = useRef(0)

  const verified = md?.verificationStatus === 'VERIFIED'

  const locate = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return null
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null)
    if (loc) {
      const p = { lat: loc.coords.latitude, lng: loc.coords.longitude }
      setPos(p)
      return p
    }
    return null
  }, [])

  const load = useCallback(async (p) => {
    setError(null)
    try {
      const mine = await api.myDeliveries()
      setMd(mine)
      setEarnings(await api.myEarnings(30).catch(() => null))
      const here = p || pos
      if (here && mine.verificationStatus === 'VERIFIED') {
        setAvailable(await api.availableDeliveries(here.lat, here.lng))
      }
    } catch (e) {
      setError(e)
    }
  }, [pos])

  useEffect(() => {
    ;(async () => {
      const p = await locate()
      await load(p)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Nouvelle commande diffusée → rafraîchit la liste.
  useEffect(() => {
    if (!verified) return
    const unsub = onNewOrders(() => load())
    return () => unsub()
  }, [verified, load])

  // Partage GPS continu (position envoyée toutes les ~12 s ou 20 m).
  async function toggleSharing() {
    if (sharing) {
      watcher.current?.remove()
      watcher.current = null
      setSharing(false)
      api.setAvailability(false).catch(() => {})
      return
    }
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('GPS requis', 'Autorisez la localisation pour partager votre position.')
      return
    }
    api.setAvailability(true).catch(() => {})
    watcher.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 20 },
      (loc) => {
        const p = { lat: loc.coords.latitude, lng: loc.coords.longitude }
        setPos(p)
        const now = Date.now()
        if (now - lastSent.current > 12000) {
          lastSent.current = now
          api.sendLocation(p.lat, p.lng).catch(() => {})
        }
      },
    )
    setSharing(true)
  }

  useEffect(() => () => watcher.current?.remove(), [])

  async function accept(orderId) {
    try {
      await api.acceptDelivery(orderId)
      await load()
    } catch (e) {
      Alert.alert('Impossible', e.message)
    }
  }

  const deliveries = md?.deliveries || []
  const active = deliveries.filter((d) => ['AWAITING_PICKUP', 'IN_DELIVERY', 'RETURNING'].includes(d.order?.status))
  const capReached = (md?.remaining ?? 1) <= 0

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => load()} />}
    >
      <OnboardingGate role="DRIVER" />
      <ErrorBox error={error} onRetry={() => load()} />
      {!md && !error && <Loader label="Chargement de vos livraisons…" />}

      {md && !verified && (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: C.yellow }}>
          <Text style={{ fontWeight: '700' }}>
            {md.verificationStatus === 'PENDING' ? '🕒 Compte en attente de vérification' : '⛔ Compte non actif'}
          </Text>
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
            L'équipe BjDrive doit valider votre profil avant que vous puissiez accepter des livraisons.
          </Text>
        </Card>
      )}

      {md && verified && md.trust && !md.trust.trusted && (
        <Card style={{ borderLeftWidth: 4, borderLeftColor: C.green }}>
          <Text style={{ fontWeight: '700' }}>🌱 Livreur en période de confiance</Text>
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
            {md.trust.delivered}/{md.trust.threshold} livraisons réussies. Commandes prépayées jusqu'à{' '}
            {formatFCFA(md.trust.maxOrderTotal)} — les espèces et gros paniers se débloquent ensuite 💪
          </Text>
        </Card>
      )}

      {md && (
        <Card>
          <RowBetween>
            <View>
              <Text style={{ fontWeight: '800', fontSize: 22, color: C.greenDark }}>{md.count}/{md.maxPerDay}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>Livraisons du jour</Text>
            </View>
            <View>
              <Text style={{ fontWeight: '800', fontSize: 22, color: C.greenDark }}>{formatFCFA(md.confirmedEarnings)}</Text>
              <Text style={{ color: C.muted, fontSize: 12 }}>Gains confirmés</Text>
            </View>
          </RowBetween>
          {md.rating != null && (
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>⭐ {Number(md.rating).toFixed(1)}/5 ({md.ratingCount} avis)</Text>
          )}
          <Btn
            title={sharing ? '⏸️ Arrêter le partage de position' : '📡 Partager ma position'}
            variant={sharing ? 'danger' : 'outline'}
            style={{ marginTop: 12 }}
            onPress={toggleSharing}
          />
        </Card>
      )}

      {active.length > 0 && (
        <>
          <SectionTitle>Livraison{active.length > 1 ? 's' : ''} en cours</SectionTitle>
          {active.map((d) => (
            <ActiveDelivery key={d.id} d={d} onChanged={() => load()} />
          ))}
        </>
      )}

      {verified && (
        <>
          <SectionTitle>Commandes à récupérer près de vous</SectionTitle>
          {available.length === 0 && <Empty icon="🛵" title="Rien pour l'instant" text="Les commandes payées proches de vous apparaîtront ici." />}
          {available.map((a) => (
            <Card key={a.id}>
              <RowBetween>
                <Text style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {a.stores?.length > 1 ? `${a.stores.length} enseignes` : a.stores?.[0]?.name}
                </Text>
                <Badge tone="yellow">Gain {formatFCFA(a.earnings)}</Badge>
              </RowBetween>
              {a.paymentMethod === 'CASH' && (
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>💵 Encaisser {formatFCFA(a.cashToCollect)} auprès du client</Text>
              )}
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }} numberOfLines={1}>📍 {a.destAddress || 'Position GPS du client'}</Text>
              {a.recipientName && (
                <Text style={{ color: C.greenDark, fontSize: 13, marginTop: 2 }}>📦 Pour {a.recipientName} · {a.recipientPhone}</Text>
              )}
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
                📦 {a.itemCount} articles · 🛣️ à {(a.distanceToStore / 1000).toFixed(1)} km
              </Text>
              <Btn title="Prendre cette livraison" style={{ marginTop: 10 }} disabled={capReached} onPress={() => accept(a.id)} />
            </Card>
          ))}
        </>
      )}

      {earnings && earnings.totalDeliveries > 0 && (
        <>
          <SectionTitle>Mes gains · 30 derniers jours</SectionTitle>
          <Card>
            <RowBetween>
              <Text style={{ fontWeight: '700' }}>{earnings.totalDeliveries} livraisons</Text>
              <Text style={{ fontWeight: '800', color: C.greenDark, fontSize: 18 }}>{formatFCFA(earnings.totalEarnings)}</Text>
            </RowBetween>
          </Card>
        </>
      )}

      <BioToggle />
      <Btn title="Se déconnecter" variant="ghost" onPress={async () => { await logout(); router.replace('/') }} />
      <DeleteAccount />
    </ScrollView>
  )
}

function ActiveDelivery({ d, onChanged }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const order = d.order
  const stores = order.stores || []

  async function pickup(storeId) {
    setBusy(true)
    try {
      await api.pickupStore(order.id, storeId)
      await onChanged()
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  async function complete() {
    setBusy(true)
    try {
      await api.completeDelivery(order.id, code.trim())
      setCode('')
      await onChanged()
      Alert.alert('Bravo 🎉', 'Commande livrée !')
    } catch (e) {
      Alert.alert('Code refusé', e.message)
    } finally {
      setBusy(false)
    }
  }

  // Livraison impossible : choix du motif, puis retour des produits aux enseignes.
  function reportFailure() {
    const send = async (reason) => {
      setBusy(true)
      try {
        await api.failDelivery(order.id, reason)
        await onChanged()
        Alert.alert('Échec signalé', 'Ramenez les produits aux enseignes — elles confirmeront le retour.')
      } catch (e) {
        Alert.alert('Erreur', e.message)
      } finally {
        setBusy(false)
      }
    }
    Alert.alert('Livraison impossible ?', 'Vous ramènerez les produits aux enseignes. Quel est le problème ?', [
      { text: 'Client absent / injoignable', onPress: () => send('Client absent / injoignable') },
      { text: 'Client refuse de payer', onPress: () => send('Client refuse de payer') },
      { text: 'Adresse introuvable', onPress: () => send('Adresse introuvable') },
      { text: 'Annuler', style: 'cancel' },
    ])
  }

  return (
    <Card>
      <RowBetween>
        <Text style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
          {stores.length > 1 ? `Tournée · ${stores.length} enseignes` : stores[0]?.store?.name}
        </Text>
        {order.paymentMethod === 'CASH' ? (
          <Badge tone="yellow">💵 Encaisser {formatFCFA(order.total)}</Badge>
        ) : (
          <Badge tone="yellow">Gain {formatFCFA(order.deliveryFee)}</Badge>
        )}
      </RowBetween>
      <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>📍 {order.destAddress || 'Position GPS du client'}</Text>
      {order.recipientName && (
        <View style={{ marginTop: 6, backgroundColor: C.greenSoft, borderRadius: 8, padding: 8 }}>
          <Text style={{ fontSize: 13 }}>
            📦 Pour <Text style={{ fontWeight: '700' }}>{order.recipientName}</Text>
          </Text>
          {order.recipientPhone && (
            <Text style={{ fontSize: 13, color: C.greenDark }} onPress={() => Linking.openURL(`tel:${order.recipientPhone}`)}>
              📞 Appeler {order.recipientPhone}
            </Text>
          )}
        </View>
      )}

      {order.status === 'AWAITING_PICKUP' &&
        stores.map((os) => (
          <View key={os.storeId} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 8, marginTop: 8 }}>
            <RowBetween>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600' }}>
                  {os.store?.emoji} {os.store?.name} {os.readyAt && !os.pickedUpAt ? '📦' : ''}
                </Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{os.store?.address}</Text>
              </View>
              {os.pickedUpAt ? (
                <Badge>✓ Récupéré</Badge>
              ) : (
                <Btn title="Récupéré" style={{ paddingHorizontal: 14, paddingVertical: 9 }} disabled={busy} onPress={() => pickup(os.storeId)} />
              )}
            </RowBetween>
          </View>
        ))}

      {order.status === 'IN_DELIVERY' && (
        <View style={{ marginTop: 10 }}>
          <Field label="Code de réception (demandez au client)" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} placeholder="0000" />
          <Btn title="✅ Valider la livraison" disabled={busy || !code} onPress={complete} />
          <Btn title="Livraison impossible ?" variant="outline" style={{ marginTop: 8 }} disabled={busy} onPress={reportFailure} />
        </View>
      )}

      {order.status === 'RETURNING' && (
        <View style={{ marginTop: 10, borderLeftWidth: 4, borderLeftColor: '#e6a700', paddingLeft: 10 }}>
          <Text style={{ fontWeight: '700' }}>Retour en cours</Text>
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>
            Ramenez les produits à chaque enseigne — elle confirmera le retour.
          </Text>
          {stores.map((os) => (
            <RowBetween key={os.storeId} style={{ marginTop: 6 }}>
              <Text style={{ flex: 1 }} numberOfLines={1}>{os.store?.emoji} {os.store?.name}</Text>
              {os.returnedAt ? <Badge>✓ Retour confirmé</Badge> : <Badge tone="yellow">En attente</Badge>}
            </RowBetween>
          ))}
        </View>
      )}

      {/* Discussion avec le client et l'enseigne */}
      <View style={{ marginTop: 10 }}>
        <ChatBox orderId={order.id} />
      </View>
    </Card>
  )
}
