// Verrou biométrique (empreinte / Face ID) : si activé, l'application demande
// une authentification locale à chaque ouverture avant d'afficher le contenu.
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { C } from './theme'

const KEY = 'bjdrive_biolock'

export async function bioAvailable() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  const enrolled = await LocalAuthentication.isEnrolledAsync()
  return hasHardware && enrolled
}

export async function isBioEnabled() {
  return (await AsyncStorage.getItem(KEY)) === '1'
}

export async function setBioEnabled(on) {
  if (on) await AsyncStorage.setItem(KEY, '1')
  else await AsyncStorage.removeItem(KEY)
}

async function authenticate() {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Déverrouillez BjDrive',
    cancelLabel: 'Annuler',
  })
  return res.success
}

// Écran de verrouillage plein écran affiché tant que la biométrie n'a pas validé.
export function BioGate() {
  const [locked, setLocked] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    ;(async () => {
      const enabled = await isBioEnabled()
      const hasSession = !!(await AsyncStorage.getItem('bjdrive_token'))
      if (enabled && hasSession && (await bioAvailable())) {
        setLocked(true)
        setChecking(false)
        if (await authenticate()) setLocked(false)
      } else {
        setChecking(false)
      }
    })()
  }, [])

  if (checking || !locked) return null
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, backgroundColor: C.greenDark, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
      <Text style={{ fontSize: 54 }}>🔒</Text>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 12 }}>BjDrive verrouillé</Text>
      <Text style={{ color: 'rgba(255,255,255,.85)', fontSize: 14, textAlign: 'center', marginTop: 6 }}>
        Utilisez votre empreinte ou Face ID pour continuer.
      </Text>
      <Pressable
        onPress={async () => {
          if (await authenticate()) setLocked(false)
        }}
        style={{ marginTop: 24, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 }}
      >
        <Text style={{ color: C.greenDark, fontWeight: '700' }}>👆 Déverrouiller</Text>
      </Pressable>
    </View>
  )
}

// Interrupteur d'activation, à poser dans les écrans « compte ».
export function BioToggle() {
  const [supported, setSupported] = useState(false)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    bioAvailable().then(setSupported)
    isBioEnabled().then(setEnabled)
  }, [])

  if (!supported) return null

  async function toggle() {
    if (!enabled) {
      // On demande une authentification avant d'activer (preuve que ça marche).
      if (!(await authenticate())) return
      await setBioEnabled(true)
      setEnabled(true)
    } else {
      await setBioEnabled(false)
      setEnabled(false)
    }
  }

  return (
    <Pressable
      onPress={toggle}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, marginBottom: 12 }}
    >
      <Text style={{ fontSize: 22 }}>{enabled ? '🔒' : '🔓'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 14 }}>Déverrouillage biométrique</Text>
        <Text style={{ color: C.muted, fontSize: 12 }}>
          {enabled ? 'Empreinte / Face ID demandé à chaque ouverture.' : 'Protégez l’app avec votre empreinte ou Face ID.'}
        </Text>
      </View>
      <Text style={{ fontSize: 22 }}>{enabled ? '✅' : '⬜'}</Text>
    </Pressable>
  )
}
