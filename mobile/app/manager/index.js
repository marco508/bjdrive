// Commandes reçues par l'enseigne : préparation et suivi des reversements.
import { useCallback, useEffect, useState } from 'react'
import { Alert, FlatList, RefreshControl, Text } from 'react-native'
import { api } from '../../src/api'
import { Badge, Btn, Card, Empty, ErrorBox, Loader, RowBetween } from '../../src/ui'
import { C, STATUS_ICON, STATUS_LABELS, formatFCFA } from '../../src/theme'

export default function ManagerOrders() {
  const [store, setStore] = useState(null)
  const [orders, setOrders] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const stores = await api.myStores()
      const s = stores?.[0] || null
      setStore(s)
      setOrders(s ? await api.storeOrders(s.id) : [])
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function markReady(orderId) {
    setBusyId(orderId)
    try {
      await api.markStoreReady(orderId, store.id)
      await load()
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusyId(null)
    }
  }

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
          {orders && !store ? (
            <Empty icon="🏪" title="Créez votre enseigne" text="Créez votre enseigne depuis l'application web pour recevoir des commandes." />
          ) : null}
          {store && orders?.length === 0 ? <Empty icon="🧾" title="Aucune commande" text="Les commandes clients s'afficheront ici." /> : null}
        </>
      }
      renderItem={({ item: o }) => (
        <Card>
          <RowBetween>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              {new Date(o.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
          <RowBetween style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
            <Text style={{ color: C.muted, fontSize: 13 }}>Votre reversement</Text>
            <Text style={{ fontWeight: '800', color: C.greenDark, fontSize: 16 }}>{formatFCFA(o.part?.payoutAmount ?? 0)}</Text>
          </RowBetween>
          {['AWAITING_DRIVER', 'AWAITING_PICKUP'].includes(o.status) && !o.part?.pickedUpAt &&
            (o.part?.readyAt ? (
              <Badge>📦 Prête — en attente du livreur</Badge>
            ) : (
              <Btn title="📦 Marquer comme prête" variant="outline" style={{ marginTop: 8 }} disabled={busyId === o.id} onPress={() => markReady(o.id)} />
            ))}
        </Card>
      )}
    />
  )
}
