// Vue synthétique super-admin (la gestion complète se fait sur le web).
import { useCallback, useEffect, useState } from 'react'
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { api } from '../../src/api'
import { WEB_URL } from '../../src/config'
import { useApp } from '../../src/store'
import { Btn, Card, ErrorBox, Loader, RowBetween, SectionTitle } from '../../src/ui'
import { C, formatFCFA } from '../../src/theme'

export default function AdminOverview() {
  const router = useRouter()
  const { logout } = useApp()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api.adminOverview())
    } catch (e) {
      setError(e)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <ErrorBox error={error} onRetry={load} />
      {!data && !error && <Loader />}
      {data && (
        <>
          <SectionTitle>Aujourd'hui</SectionTitle>
          <Card>
            <RowBetween>
              <Kpi n={data.todayOrders} l="Commandes" />
              <Kpi n={data.ordersInProgress} l="En cours" />
              <Kpi n={formatFCFA(data.todayRevenue)} l="Commission" />
            </RowBetween>
          </Card>

          {(data.pendingStores > 0 || data.pendingDrivers > 0 || data.refundsPending > 0 || data.blockedCodes > 0) && (
            <Card style={{ backgroundColor: '#fff7d6' }}>
              <Text style={{ fontWeight: '700', marginBottom: 6 }}>⏳ Actions en attente</Text>
              {data.pendingStores > 0 && <Text style={{ fontSize: 13 }}>• {data.pendingStores} enseigne(s) à vérifier</Text>}
              {data.pendingDrivers > 0 && <Text style={{ fontSize: 13 }}>• {data.pendingDrivers} livreur(s) à vérifier</Text>}
              {data.refundsPending > 0 && <Text style={{ fontSize: 13 }}>• {data.refundsPending} remboursement(s) à traiter</Text>}
              {data.blockedCodes > 0 && <Text style={{ fontSize: 13 }}>• {data.blockedCodes} code(s) de réception bloqué(s)</Text>}
            </Card>
          )}

          <SectionTitle>Plateforme</SectionTitle>
          <Card>
            <RowBetween>
              <Kpi n={data.verifiedStores} l="Enseignes" />
              <Kpi n={data.drivers} l="Livreurs" />
              <Kpi n={data.deliveredOrders} l="Livrées" />
            </RowBetween>
            <RowBetween style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
              <Text style={{ color: C.muted }}>Commission encaissée</Text>
              <Text style={{ fontWeight: '800', color: C.greenDark, fontSize: 18 }}>{formatFCFA(data.platformRevenue)}</Text>
            </RowBetween>
          </Card>

          <Btn title="🖥️ Ouvrir le dashboard complet (web)" variant="outline" onPress={() => Linking.openURL(`${WEB_URL}/admin`)} />
          <Btn title="Se déconnecter" variant="ghost" style={{ marginTop: 10 }} onPress={async () => { await logout(); router.replace('/') }} />
        </>
      )}
    </ScrollView>
  )
}

function Kpi({ n, l }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontWeight: '800', fontSize: 18, color: C.greenDark }}>{n}</Text>
      <Text style={{ color: C.muted, fontSize: 11 }}>{l}</Text>
    </View>
  )
}
