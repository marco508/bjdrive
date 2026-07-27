// Produits & stocks de l'enseigne (ajustement rapide depuis le téléphone).
import { useCallback, useEffect, useState } from 'react'
import { Alert, FlatList, RefreshControl, Text, View } from 'react-native'
import { api } from '../../src/api'
import { Btn, Card, Empty, ErrorBox, Loader, RowBetween } from '../../src/ui'
import { C, formatFCFA } from '../../src/theme'

export default function ManagerProducts() {
  const [store, setStore] = useState(null)
  const [products, setProducts] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const stores = await api.myStores()
      const s = stores?.[0] || null
      setStore(s)
      if (s) {
        const full = await api.myStore(s.id)
        setProducts(full?.products || [])
      } else {
        setProducts([])
      }
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function changeStock(p, delta) {
    const next = Math.max(0, (p.stock || 0) + delta)
    try {
      await api.updateProduct(p.id, { stock: next })
      setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, stock: next } : x)))
    } catch (e) {
      Alert.alert('Erreur', e.message)
    }
  }

  return (
    <FlatList
      data={products || []}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      ListHeaderComponent={
        <>
          {error ? <ErrorBox error={error} onRetry={load} /> : null}
          {!products && !error ? <Loader /> : null}
          {products && !store ? (
            <Empty icon="🏪" title="Aucune enseigne" text="Créez votre enseigne depuis l'application web." />
          ) : null}
          {store && products?.length === 0 ? (
            <Empty icon="🏷️" title="Aucun produit" text="Ajoutez vos produits depuis l'application web — gérez les stocks ici." />
          ) : null}
        </>
      }
      renderItem={({ item: p }) => (
        <Card>
          <RowBetween>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600' }}>{p.emoji} {p.name}</Text>
              <Text style={{ color: C.greenDark, fontWeight: '700', fontSize: 13 }}>
                {formatFCFA(p.price)} <Text style={{ color: C.muted, fontWeight: '400' }}>/ {p.unit}</Text>
              </Text>
              <Text style={{ color: p.stock <= 5 ? C.red : C.muted, fontSize: 12 }}>Stock : {p.stock}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Btn title="−" variant="ghost" style={{ paddingVertical: 6, paddingHorizontal: 14 }} onPress={() => changeStock(p, -1)} />
              <Text style={{ fontWeight: '700', minWidth: 22, textAlign: 'center' }}>{p.stock}</Text>
              <Btn title="+" variant="ghost" style={{ paddingVertical: 6, paddingHorizontal: 14 }} onPress={() => changeStock(p, 1)} />
            </View>
          </RowBetween>
        </Card>
      )}
    />
  )
}
