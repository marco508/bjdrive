import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { AppProvider } from '../src/store'
import { BioGate } from '../src/biolock'
import HeaderLogout from '../src/HeaderLogout'
import { C } from '../src/theme'

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.green },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: C.bg },
          // Déconnexion toujours accessible, sur tous les écrans connectés.
          headerRight: () => <HeaderLogout />,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Connexion' }} />
        <Stack.Screen name="register" options={{ title: 'Créer un compte' }} />
        <Stack.Screen name="client" options={{ headerShown: false }} />
        <Stack.Screen name="driver/index" options={{ title: 'Espace livreur' }} />
        <Stack.Screen name="staff/index" options={{ title: 'Espace employé' }} />
        <Stack.Screen name="manager" options={{ headerShown: false }} />
        <Stack.Screen name="admin/index" options={{ title: 'Administration' }} />
        <Stack.Screen name="store/[id]" options={{ title: 'Enseigne' }} />
        <Stack.Screen name="cart" options={{ title: 'Mon panier' }} />
        <Stack.Screen name="checkout" options={{ title: 'Livraison' }} />
        <Stack.Screen name="track/[id]" options={{ title: 'Suivi de commande' }} />
        <Stack.Screen name="forgot" options={{ title: 'Mot de passe oublié' }} />
      </Stack>
      {/* Verrou biométrique par-dessus toute l'app (si activé dans le compte) */}
      <BioGate />
    </AppProvider>
  )
}
