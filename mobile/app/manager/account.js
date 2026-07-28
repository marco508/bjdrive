import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { api } from '../../src/api'
import { useApp } from '../../src/store'
import { BioToggle } from '../../src/biolock'
import DeleteAccount from '../../src/DeleteAccount'
import { Btn, Card, RowBetween } from '../../src/ui'
import { C } from '../../src/theme'

export default function ManagerAccount() {
  const router = useRouter()
  const { user, logout } = useApp()
  const [store, setStore] = useState(null)
  const [staff, setStaff] = useState([])

  useEffect(() => {
    api.myStores()
      .then((stores) => {
        const s = stores?.[0]
        setStore(s || null)
        if (s) return api.listStaff(s.id).then(setStaff)
      })
      .catch(() => {})
  }, [])

  async function toggleApprover(member) {
    try {
      await api.setStaffApprover(store.id, member.id, !member.staffCanApprove)
      setStaff((l) => l.map((s) => (s.id === member.id ? { ...s, staffCanApprove: !member.staffCanApprove } : s)))
    } catch (e) {
      Alert.alert('Erreur', e.message)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Text style={{ fontWeight: '800', fontSize: 18 }}>{user?.name}</Text>
        <Text style={{ color: C.muted }}>{user?.email}</Text>
      </Card>
      {staff.length > 0 && (
        <Card>
          <Text style={{ fontWeight: '700', marginBottom: 4 }}>Mes employés — valideurs de stock</Text>
          <Text style={{ color: C.muted, fontSize: 12, marginBottom: 8 }}>
            Un valideur ajuste les stocks sans validation et approuve les demandes des autres employés.
          </Text>
          {staff.map((m) => (
            <Pressable key={m.id} onPress={() => toggleApprover(m)} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10 }}>
              <RowBetween>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', fontSize: 14 }}>{m.name}</Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>{m.email}</Text>
                </View>
                <Text style={{ fontSize: 20 }}>{m.staffCanApprove ? '✅' : '⬜'}</Text>
              </RowBetween>
            </Pressable>
          ))}
        </Card>
      )}

      <Card>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
          La création de l'enseigne, l'import de produits, les photos et la création des comptes employés se gèrent
          depuis l'application web BjDrive. L'application mobile sert au suivi quotidien : commandes, préparation et stocks.
        </Text>
      </Card>
      <BioToggle />
      <Btn title="Se déconnecter" variant="danger" onPress={async () => { await logout(); router.replace('/') }} />
      <DeleteAccount />
    </ScrollView>
  )
}
