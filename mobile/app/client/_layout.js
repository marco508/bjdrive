import { Tabs } from 'expo-router'
import { MaterialIcons } from '@expo/vector-icons'
import { C } from '../../src/theme'
import OnboardingGate from '../../src/OnboardingGate'
import HeaderLogout from '../../src/HeaderLogout'

const icon = (name) => ({ color }) => <MaterialIcons name={name} size={24} color={color} />

export default function ClientLayout() {
  return (
    <>
    <OnboardingGate role="CLIENT" />
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
      <Tabs.Screen name="index" options={{ title: 'Enseignes', tabBarIcon: icon('storefront') }} />
      <Tabs.Screen name="orders" options={{ title: 'Commandes', tabBarIcon: icon('receipt-long') }} />
      <Tabs.Screen name="account" options={{ title: 'Compte', tabBarIcon: icon('person') }} />
    </Tabs>
    </>
  )
}
