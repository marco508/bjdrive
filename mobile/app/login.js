import { useState } from 'react'
import { Alert, ScrollView, Text, Pressable } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useApp } from '../src/store'
import { Btn, Card, Field } from '../src/ui'
import { C } from '../src/theme'

function homeFor(role) {
  if (role === 'MANAGER') return '/manager'
  if (role === 'DRIVER') return '/driver'
  if (role === 'SUPERADMIN') return '/admin'
  return '/client'
}

export default function Login() {
  const router = useRouter()
  const { role } = useLocalSearchParams()
  const { login } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!email || !password) return
    setBusy(true)
    try {
      const me = await login({ email: email.trim(), password })
      router.replace(homeFor(me.role))
    } catch (e) {
      Alert.alert('Connexion impossible', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="vous@exemple.com" />
        <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        <Btn title={busy ? 'Connexion…' : 'Se connecter'} onPress={submit} disabled={busy} />
      </Card>
      {role !== 'SUPERADMIN' && (
        <Pressable onPress={() => router.push({ pathname: '/register', params: { role } })}>
          <Text style={{ textAlign: 'center', color: C.greenDark, fontWeight: '600' }}>Pas encore de compte ? Créez-en un</Text>
        </Pressable>
      )}
    </ScrollView>
  )
}
