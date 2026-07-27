import { useState } from 'react'
import { Alert, ScrollView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useApp } from '../src/store'
import { Btn, Card, Field } from '../src/ui'

function homeFor(role) {
  if (role === 'MANAGER') return '/manager'
  if (role === 'DRIVER') return '/driver'
  return '/client'
}

export default function Register() {
  const router = useRouter()
  const { role } = useLocalSearchParams()
  const { register } = useApp()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name || !email || password.length < 6) {
      Alert.alert('Champs requis', 'Nom, e-mail et mot de passe (6 caractères minimum).')
      return
    }
    setBusy(true)
    try {
      const me = await register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        password,
        role: role === 'MANAGER' || role === 'DRIVER' ? role : 'CLIENT',
      })
      router.replace(homeFor(me.role))
    } catch (e) {
      Alert.alert('Inscription impossible', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Field label="Nom complet" value={name} onChangeText={setName} placeholder="Votre nom" />
        <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="vous@exemple.com" />
        <Field label="Téléphone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+229 ..." />
        <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry placeholder="6 caractères minimum" />
        <Btn title={busy ? 'Création…' : 'Créer mon compte'} onPress={submit} disabled={busy} />
      </Card>
    </ScrollView>
  )
}
