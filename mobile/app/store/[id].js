// Fiche enseigne : rayons + ajout au panier.
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '../../src/api'
import { imageSrc } from '../../src/config'
import { useApp } from '../../src/store'
import { Empty, ErrorBox, Loader } from '../../src/ui'
import { C, formatFCFA } from '../../src/theme'

export default function StorePage() {
  const { id } = useLocalSearchParams()
  const router = useRouter()
  const { cart, addToCart, cartCount, cartSubtotal } = useApp()
  const [store, setStore] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setStore(await api.store(id))
    } catch (e) {
      setError(e)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <ErrorBox error={error} onRetry={load} />
  if (!store) return <Loader />

  const storeRef = { id: store.id, name: store.name, emoji: store.emoji, color: store.color, lat: store.lat, lng: store.lng, address: store.address }
  const qtyOf = (pid) => cart.items[pid]?.qty || 0

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={store.products || []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 96 }}
        ListHeaderComponent={
          <View style={st.head}>
            <Text style={{ fontWeight: '800', fontSize: 20 }}>{store.emoji} {store.name}</Text>
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>📍 {store.address}</Text>
            {store.rating != null && (
              <Text style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>⭐ {Number(store.rating).toFixed(1)}/5 ({store.ratingCount} avis)</Text>
            )}
          </View>
        }
        ListEmptyComponent={<Empty icon="📭" title="Rayons vides" text="Cette enseigne n'a pas encore ajouté de produits." />}
        renderItem={({ item: p }) => {
          const q = qtyOf(p.id)
          const out = p.stock <= 0
          return (
            <View style={st.product}>
              <View style={st.thumb}>
                {p.imageUrl ? (
                  <Image source={{ uri: imageSrc(p.imageUrl) }} style={{ width: 52, height: 52, borderRadius: 12 }} />
                ) : (
                  <Text style={{ fontSize: 24 }}>{p.emoji || '🛍️'}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', fontSize: 15 }}>{p.name}</Text>
                <Text style={{ color: C.greenDark, fontWeight: '700', fontSize: 14 }}>
                  {formatFCFA(p.price)} <Text style={{ color: C.muted, fontWeight: '400' }}>/ {p.unit}</Text>
                </Text>
                <Text style={{ color: out || p.stock <= 5 ? C.red : C.muted, fontSize: 11 }}>
                  {out ? 'Rupture de stock' : `Stock : ${p.stock}`}
                </Text>
              </View>
              {q === 0 ? (
                <Pressable style={[st.add, out && { opacity: 0.4 }]} onPress={out ? undefined : () => addToCart(storeRef, p, 1)}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>+</Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable style={st.step} onPress={() => addToCart(storeRef, p, -1)}>
                    <Text style={st.stepTxt}>−</Text>
                  </Pressable>
                  <Text style={{ fontWeight: '700', minWidth: 18, textAlign: 'center' }}>{q}</Text>
                  <Pressable style={st.step} onPress={() => addToCart(storeRef, p, 1)}>
                    <Text style={st.stepTxt}>+</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )
        }}
      />
      {cartCount > 0 && (
        <Pressable style={st.fab} onPress={() => router.push('/cart')}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>🧺 Panier · {cartCount} article{cartCount > 1 ? 's' : ''} · {formatFCFA(cartSubtotal)}</Text>
        </Pressable>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  head: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16, marginBottom: 12 },
  product: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' },
  add: { backgroundColor: C.green, width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  step: { borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: C.greenDark, fontSize: 18, lineHeight: 20 },
  fab: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: C.green,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    elevation: 4,
  },
})
