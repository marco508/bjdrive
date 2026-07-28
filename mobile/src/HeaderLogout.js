// Bouton de déconnexion intégré aux en-têtes natifs (visible sur tous les écrans).
import { Pressable } from 'react-native'
import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useApp } from './store'

export default function HeaderLogout() {
  const { user, logout } = useApp()
  const router = useRouter()
  if (!user) return null
  return (
    <Pressable
      onPress={async () => {
        await logout()
        router.replace('/')
      }}
      hitSlop={10}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: 4 })}
      accessibilityLabel="Se déconnecter"
    >
      <MaterialIcons name="logout" size={22} color="#fff" />
    </Pressable>
  )
}
