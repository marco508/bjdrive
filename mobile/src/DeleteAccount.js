// Suppression de compte (mot de passe exigé) — parité avec le web.
import { useState } from 'react'
import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { api } from './api'
import { useApp } from './store'
import { C } from './theme'

export default function DeleteAccount() {
  const router = useRouter()
  const { logout } = useApp()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function confirm() {
    if (!password) return
    setBusy(true)
    try {
      await api.deleteMe(password)
      setOpen(false)
      await logout()
      Alert.alert('Compte supprimé', 'Vos données personnelles ont été supprimées.')
      router.replace('/')
    } catch (e) {
      Alert.alert('Erreur', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={{ alignItems: 'center', paddingVertical: 12 }}>
        <Text style={{ color: C.red, fontSize: 13, textDecorationLine: 'underline' }}>
          Supprimer définitivement mon compte
        </Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'center', padding: 26 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 22 }}>
            <Text style={{ fontWeight: '800', fontSize: 17 }}>Supprimer mon compte ?</Text>
            <Text style={{ color: C.red, fontSize: 13, marginTop: 8, lineHeight: 19 }}>
              Action irréversible : vos données personnelles seront supprimées et vous ne pourrez plus vous connecter.
            </Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 10, marginBottom: 4 }}>Confirmez avec votre mot de passe</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoFocus
              placeholder="Mot de passe"
              placeholderTextColor={C.muted}
              style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: C.ink }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => { setOpen(false); setPassword('') }} style={{ flex: 1, backgroundColor: C.greenSoft, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: C.greenDark, fontWeight: '700' }}>Annuler</Text>
              </Pressable>
              <Pressable onPress={confirm} disabled={busy || !password} style={{ flex: 1, backgroundColor: password ? C.red : '#e9b5bd', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? '…' : 'Supprimer'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}
