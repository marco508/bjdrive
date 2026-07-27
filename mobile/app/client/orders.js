// Historique des commandes du client.
import { useCallback, useEffect, useState } from 'react'
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { api } from '../../src/api'
import { Badge, Card, Empty, ErrorBox, Loader, RowBetween } from '../../src/ui'
import { C, STATUS_ICON, STATUS_LABELS, formatFCFA } from '../../src/theme'

export default function ClientOrders() {
  const router = useRouter()
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setOrders(await api.myOrders())
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <FlatList
      data={orders || []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
      ListHeaderComponent={
        <>
          {error ? <ErrorBox error={error} onRetry={load} /> : null}
          {!orders && !error ? <Loader /> : null}
          {orders && orders.length === 0 ? <Empty icon="📦" title="Aucune commande" text="Vos commandes apparaîtront ici." /> : null}
        </>
      }
      renderItem={({ item: o }) => (
        <Pressable onPress={() => router.push(`/track/${o.id}`)}>
          <Card>
            <RowBetween>
              <Text style={{ color: C.muted, fontSize: 12 }}>
                {new Date(o.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Badge tone={o.status === 'DELIVERED' ? 'green' : o.status === 'CANCELLED' ? 'red' : 'yellow'}>
                {STATUS_ICON[o.status]} {STATUS_LABELS[o.status]}
              </Badge>
            </RowBetween>
            <Text style={{ marginTop: 6 }} numberOfLines={1}>
              {(o.stores || []).map((s) => s.store?.name).join(', ')}
            </Text>
            <RowBetween style={{ marginTop: 6 }}>
              <Text style={{ color: C.muted, fontSize: 13 }}>
                {(o.items || []).reduce((s, i) => s + i.qty, 0)} article(s) · {o.paymentMethod === 'CASH' ? '💵 espèces' : '💳 KkiaPay'}
              </Text>
              <Text style={{ fontWeight: '800', color: C.greenDark }}>{formatFCFA(o.total)}</Text>
            </RowBetween>
          </Card>
        </Pressable>
      )}
    />
  )
}
