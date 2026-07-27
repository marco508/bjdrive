// Livraison : position GPS, adresse, mode de paiement (KkiaPay ou espèces).
import { useEffect, useState } from 'react'
import { Alert, ScrollView, Text, Pressable, Linking } from 'react-native'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { api } from '../src/api'
import { WEB_URL } from '../src/config'
import { useApp } from '../src/store'
import { Btn, Card, Field, RowBetween, SectionTitle } from '../src/ui'
import { C, formatFCFA } from '../src/theme'

export default function Checkout() {
  const router = useRouter()
  const { cartItems, cartStores, cartSubtotal, clearCart } = useApp()
  const [pos, setPos] = useState(null)
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('KKIAPAY')
  const [allowCash, setAllowCash] = useState(false)
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  // Retrait sur place : possible seulement pour un panier mono-enseigne.
  const [fulfillment, setFulfillment] = useState('DELIVERY')
  const canPickup = cartStores.length === 1
  const isPickup = fulfillment === 'PICKUP' && canPickup

  useEffect(() => {
    api.publicConfig().then((c) => setAllowCash(!!c.allowCashOnDelivery)).catch(() => {})
  }, [])

  async function locate() {
    setLocating(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') throw new Error('permission')
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
      setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude })
    } catch {
      Alert.alert('Position indisponible', 'Autorisez la localisation pour être livré au bon endroit.')
    } finally {
      setLocating(false)
    }
  }

  async function confirm() {
    if ((!isPickup && !pos) || cartItems.length === 0) return
    setBusy(true)
    try {
      const order = await api.createOrder({
        items: cartItems.map(({ product, qty }) => ({ productId: product.id, qty })),
        ...(isPickup ? {} : { destLat: pos.lat, destLng: pos.lng, destAddress: address }),
        destNote: note,
        paymentMethod,
        fulfillment: isPickup ? 'PICKUP' : 'DELIVERY',
      })
      clearCart()
      if (paymentMethod === 'CASH') {
        router.replace(`/track/${order.id}`)
      } else {
        // Paiement KkiaPay : finalisé dans le navigateur (widget web sécurisé),
        // le suivi mobile prend le relais dès que le paiement est confirmé.
        await Linking.openURL(`${WEB_URL}/client/pay/${order.id}`)
        router.replace(`/track/${order.id}`)
      }
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <SectionTitle>Comment récupérer votre commande ?</SectionTitle>
      <Card>
        {[
          { key: 'DELIVERY', label: '🛵 Me faire livrer à domicile', enabled: true },
          { key: 'PICKUP', label: `🏪 Passer chercher sur place (sans frais de livraison)${canPickup ? '' : ' — panier mono-enseigne uniquement'}`, enabled: canPickup },
        ].map((opt) => (
          <Pressable key={opt.key} disabled={!opt.enabled} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: opt.enabled ? 1 : 0.45 }} onPress={() => setFulfillment(opt.key)}>
            <Text style={{ fontSize: 18 }}>{fulfillment === opt.key && opt.enabled ? '🔘' : '⚪'}</Text>
            <Text style={{ fontSize: 14, flex: 1 }}>{opt.label}</Text>
          </Pressable>
        ))}
      </Card>

      {isPickup ? (
        <Card style={{ backgroundColor: C.greenSoft }}>
          <Text style={{ fontSize: 14 }}>
            🏪 Vous retirerez votre commande chez <Text style={{ fontWeight: '700' }}>{cartStores[0]?.name}</Text> — {cartStores[0]?.address}.
            Présentez votre code de réception à l'enseigne.
          </Text>
        </Card>
      ) : (
        <>
      <SectionTitle>Votre position de livraison</SectionTitle>
      <Card>
        {pos ? (
          <Text style={{ color: C.greenDark, fontWeight: '600' }}>📍 Position enregistrée ({pos.lat.toFixed(4)}, {pos.lng.toFixed(4)})</Text>
        ) : (
          <Text style={{ color: C.muted }}>Nous avons besoin de votre position réelle pour calculer le tarif et vous livrer.</Text>
        )}
        <Btn title={locating ? 'Localisation…' : pos ? 'Actualiser ma position' : '📍 Utiliser ma position'} variant={pos ? 'outline' : 'primary'} style={{ marginTop: 10 }} onPress={locate} disabled={locating} />
      </Card>

      <Card>
        <Field label="Adresse / repère (quartier, rue…)" value={address} onChangeText={setAddress} placeholder="Ex : quartier, rue, point de repère" />
        <Field label="Instructions au livreur (optionnel)" value={note} onChangeText={setNote} placeholder="Ex : portail bleu, appeler en arrivant" />
      </Card>
        </>
      )}

      {allowCash && (
        <Card>
          <SectionTitle>Mode de paiement</SectionTitle>
          {[
            { key: 'KKIAPAY', label: '💳 Payer maintenant (Mobile Money / carte)' },
            { key: 'CASH', label: '💵 Payer en espèces à la livraison' },
          ].map((opt) => (
            <Pressable key={opt.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }} onPress={() => setPaymentMethod(opt.key)}>
              <Text style={{ fontSize: 18 }}>{paymentMethod === opt.key ? '🔘' : '⚪'}</Text>
              <Text style={{ fontSize: 14 }}>{opt.key === 'CASH' && isPickup ? '💵 Payer en espèces sur place au retrait' : opt.label}</Text>
            </Pressable>
          ))}
        </Card>
      )}

      <Card>
        {cartStores.length > 1 && (
          <Text style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
            🛵 Tournée dans {cartStores.length} enseignes — le tarif dépend de la distance totale.
          </Text>
        )}
        <RowBetween>
          <Text style={{ fontWeight: '700' }}>Sous-total produits</Text>
          <Text style={{ fontWeight: '800', fontSize: 18, color: C.greenDark }}>{formatFCFA(cartSubtotal)}</Text>
        </RowBetween>
        <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
          {isPickup
            ? 'Retrait sur place : aucun frais de livraison, seuls les frais de service sont ajoutés.'
            : 'Frais de livraison et de service (selon la distance) ajoutés au total.'}
        </Text>
      </Card>

      <Btn title={busy ? 'Envoi…' : 'Commander'} onPress={confirm} disabled={busy || (!isPickup && !pos)} />
    </ScrollView>
  )
}
