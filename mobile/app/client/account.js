import { useEffect, useState } from 'react'
import { Text, View, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { api } from '../../src/api'
import { useApp } from '../../src/store'
import { BioToggle } from '../../src/biolock'
import DeleteAccount from '../../src/DeleteAccount'
import { Btn, Card, RowBetween, SectionTitle } from '../../src/ui'
import { C, formatFCFA } from '../../src/theme'

export default function Account() {
  const router = useRouter()
  const { user, logout } = useApp()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.myStats().then(setStats).catch(() => {})
  }, [])

  async function handleLogout() {
    await logout()
    router.replace('/')
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card style={{ alignItems: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Text style={{ fontSize: 30 }}>👤</Text>
        </View>
        <Text style={{ fontWeight: '800', fontSize: 18 }}>{user?.name}</Text>
        <Text style={{ color: C.muted }}>{user?.email}</Text>
        {user?.phone ? <Text style={{ color: C.muted }}>{user.phone}</Text> : null}
      </Card>

      <BioToggle />

      {stats && stats.totalOrders > 0 && (
        <>
          <SectionTitle>📊 Mes habitudes</SectionTitle>
          <Card>
            <RowBetween>
              <Kpi n={stats.totalOrders} l="Commandes" />
              <Kpi n={formatFCFA(stats.totalSpent)} l="Dépensé" />
              <Kpi n={formatFCFA(stats.avgBasket)} l="Panier moyen" />
            </RowBetween>
          </Card>
          {stats.topProducts.length > 0 && (
            <Card>
              <Text style={{ fontWeight: '700', marginBottom: 6 }}>🏆 Produits les plus commandés</Text>
              {stats.topProducts.map((p, i) => (
                <RowBetween key={p.name} style={{ paddingVertical: 3 }}>
                  <Text style={{ flex: 1 }} numberOfLines={1}>{['🥇', '🥈', '🥉', '4.', '5.'][i]} {p.emoji} {p.name} ×{p.qty}</Text>
                  <Text style={{ color: C.muted }}>{formatFCFA(p.spent)}</Text>
                </RowBetween>
              ))}
            </Card>
          )}
          {stats.topStores.length > 0 && (
            <Card>
              <Text style={{ fontWeight: '700', marginBottom: 6 }}>🏪 Enseignes préférées</Text>
              {stats.topStores.map((s) => (
                <RowBetween key={s.id} style={{ paddingVertical: 3 }}>
                  <Text style={{ flex: 1 }} numberOfLines={1}>{s.emoji} {s.name} · {s.orders} cmd</Text>
                  <Text style={{ color: C.muted }}>{formatFCFA(s.spent)}</Text>
                </RowBetween>
              ))}
            </Card>
          )}
        </>
      )}

      <Card>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
          BjDrive — vos courses livrées à domicile partout au Bénin, avec suivi du livreur en temps réel et code de
          réception sécurisé.
        </Text>
      </Card>

      <Btn title="Se déconnecter" variant="danger" onPress={handleLogout} />
      <DeleteAccount />
    </ScrollView>
  )
}

function Kpi({ n, l }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontWeight: '800', fontSize: 16, color: C.greenDark }}>{n}</Text>
      <Text style={{ color: C.muted, fontSize: 11 }}>{l}</Text>
    </View>
  )
}
