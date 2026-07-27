import { Text, View, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { useApp } from '../../src/store'
import { Btn, Card } from '../../src/ui'
import { C } from '../../src/theme'

export default function Account() {
  const router = useRouter()
  const { user, logout } = useApp()

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

      <Card>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
          BjDrive — vos courses livrées à domicile partout au Bénin, avec suivi du livreur en temps réel et code de
          réception sécurisé.
        </Text>
      </Card>

      <Btn title="Se déconnecter" variant="danger" onPress={handleLogout} />
    </ScrollView>
  )
}
