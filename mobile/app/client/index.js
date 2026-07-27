// Accueil client : enseignes vérifiées, triées par distance si position dispo.
import { useEffect, useState, useCallback } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { api } from '../../src/api'
import { useApp } from '../../src/store'
import { Badge, Empty, ErrorBox, Loader } from '../../src/ui'
import { C } from '../../src/theme'

export default function ClientHome() {
  const router = useRouter()
  const { cartCount } = useApp()
  const [pos, setPos] = useState(null)
  const [stores, setStores] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null)
        if (loc) setPos({ lat: loc.coords.latitude, lng: loc.coords.longitude })
      }
    })()
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStores(await api.stores({ lat: pos?.lat, lng: pos?.lng }))
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [pos])

  useEffect(() => {
    load()
  }, [load])

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={stores || []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListHeaderComponent={
          <>
            {error ? <ErrorBox error={error} onRetry={load} /> : null}
            {loading && !stores ? <Loader label="Recherche des enseignes…" /> : null}
            {!loading && (stores || []).length === 0 && !error ? (
              <Empty icon="🏪" title="Aucune enseigne" text="Aucune enseigne vérifiée disponible pour l'instant." />
            ) : null}
          </>
        }
        renderItem={({ item: s }) => (
          <Pressable style={st.card} onPress={() => router.push(`/store/${s.id}`)}>
            <View style={[st.logo, { backgroundColor: s.color || C.green }]}>
              <Text style={{ fontSize: 26 }}>{s.emoji || '🛒'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 16 }}>{s.name}</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                {s.category?.emoji} {s.category?.name} · 📍 {s.address}
              </Text>
              {s.distance != null && (
                <View style={{ marginTop: 6 }}>
                  <Badge>à {(s.distance / 1000).toFixed(1)} km</Badge>
                </View>
              )}
            </View>
            <Text style={{ color: C.muted, fontSize: 22 }}>›</Text>
          </Pressable>
        )}
      />
      {cartCount > 0 && (
        <Pressable style={st.fab} onPress={() => router.push('/cart')}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>🧺 Voir mon panier ({cartCount})</Text>
        </Pressable>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  logo: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
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
