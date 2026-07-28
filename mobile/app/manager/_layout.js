import { Tabs } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { C } from '../../src/theme'
import OnboardingGate from '../../src/OnboardingGate'
import HeaderLogout from '../../src/HeaderLogout'

const icon = (name) => ({ color }) => <MaterialIcons name={name} size={24} color={color} />

export default function ManagerLayout() {
  return (
    <>
    <OnboardingGate role="MANAGER" />
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.green },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: C.green,
        tabBarInactiveTintColor: C.muted,
        sceneStyle: { backgroundColor: C.bg },
        headerRight: () => <HeaderLogout />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Commandes', tabBarIcon: icon('receipt-long') }} />
      <Tabs.Screen name="products" options={{ title: 'Produits', tabBarIcon: icon('qr-code-scanner') }} />
      <Tabs.Screen name="account" options={{ title: 'Compte', tabBarIcon: icon('person') }} />
    </Tabs>
    </>
  )
}
