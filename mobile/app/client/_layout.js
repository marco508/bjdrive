import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { C } from '../../src/theme'
import OnboardingGate from '../../src/OnboardingGate'

const icon = (glyph) => ({ focused }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{glyph}</Text>

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
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Enseignes', tabBarIcon: icon('🛒') }} />
      <Tabs.Screen name="orders" options={{ title: 'Commandes', tabBarIcon: icon('📦') }} />
      <Tabs.Screen name="account" options={{ title: 'Compte', tabBarIcon: icon('👤') }} />
    </Tabs>
    </>
  )
}
