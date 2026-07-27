import { ScrollView, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useApp } from '../../src/store'
import { BioToggle } from '../../src/biolock'
import DeleteAccount from '../../src/DeleteAccount'
import { Btn, Card } from '../../src/ui'
import { C } from '../../src/theme'

export default function ManagerAccount() {
  const router = useRouter()
  const { user, logout } = useApp()

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Card>
        <Text style={{ fontWeight: '800', fontSize: 18 }}>{user?.name}</Text>
        <Text style={{ color: C.muted }}>{user?.email}</Text>
      </Card>
      <Card>
        <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
          💡 La création de l'enseigne, l'import de produits, les photos et les coordonnées de versement se gèrent
          depuis l'application web BjDrive. L'application mobile sert au suivi quotidien : commandes, préparation et stocks.
        </Text>
      </Card>
      <BioToggle />
      <Btn title="Se déconnecter" variant="danger" onPress={async () => { await logout(); router.replace('/') }} />
      <DeleteAccount />
    </ScrollView>
  )
}
