// Mot de passe oublié : envoie un lien de réinitialisation par e-mail.
import { useState } from 'react'
import { Alert, ScrollView, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { api } from '../src/api'
import { Btn, Card, Field } from '../src/ui'
import { C } from '../src/theme'

export default function Forgot() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!email.trim()) return
    setBusy(true)
    try {
      await api.forgotPassword(email.trim())
      setSent(true)
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      {sent ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>📬</Text>
          <Text style={{ textAlign: 'center', marginTop: 8, fontSize: 14 }}>
            Si un compte existe avec <Text style={{ fontWeight: '700' }}>{email}</Text>, un lien de réinitialisation
            vient de lui être envoyé (valable 30 minutes). Ouvrez-le depuis votre boîte mail, puis reconnectez-vous ici.
          </Text>
          <Btn title="‹ Retour à la connexion" variant="ghost" style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={() => router.back()} />
        </Card>
      ) : (
        <Card>
          <Text style={{ color: C.muted, fontSize: 14, marginBottom: 12 }}>
            Saisissez l'e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.
          </Text>
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="vous@exemple.com" />
          <Btn title={busy ? 'Envoi…' : 'Envoyer le lien'} onPress={submit} disabled={busy || !email.trim()} />
        </Card>
      )}
    </ScrollView>
  )
}
