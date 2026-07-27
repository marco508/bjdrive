// Panier multi-enseignes.
import { FlatList, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useApp } from '../src/store'
import { Btn, Card, Empty, RowBetween } from '../src/ui'
import { C, formatFCFA } from '../src/theme'

export default function Cart() {
  const router = useRouter()
  const { cartItems, cartStores, cartSubtotal, addToCart } = useApp()

  if (cartItems.length === 0) {
    return <Empty icon="🧺" title="Panier vide" text="Ajoutez des produits depuis une enseigne." />
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={cartItems}
        keyExtractor={(it) => it.product.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 140 }}
        renderItem={({ item: it }) => (
          <Card>
            <RowBetween>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600' }}>{it.product.emoji} {it.product.name}</Text>
                <Text style={{ color: C.muted, fontSize: 12 }}>{it.store.name} · {formatFCFA(it.product.price)} / {it.product.unit}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Btn title="−" variant="ghost" style={{ paddingVertical: 6, paddingHorizontal: 14 }} onPress={() => addToCart(it.store, it.product, -1)} />
                <Text style={{ fontWeight: '700' }}>{it.qty}</Text>
                <Btn title="+" variant="ghost" style={{ paddingVertical: 6, paddingHorizontal: 14 }} onPress={() => addToCart(it.store, it.product, 1)} />
              </View>
            </RowBetween>
          </Card>
        )}
      />
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
        <Card>
          <RowBetween style={{ marginBottom: 10 }}>
            <Text style={{ fontWeight: '700' }}>
              Sous-total {cartStores.length > 1 ? `(${cartStores.length} enseignes)` : ''}
            </Text>
            <Text style={{ fontWeight: '800', fontSize: 18, color: C.greenDark }}>{formatFCFA(cartSubtotal)}</Text>
          </RowBetween>
          <Btn title="Commander" onPress={() => router.push('/checkout')} />
        </Card>
      </View>
    </View>
  )
}
