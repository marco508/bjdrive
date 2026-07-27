// Accueil : redirige selon le rôle connecté, sinon écran de bienvenue.
import { useRouter, Redirect } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useApp } from '../src/store'
import { C } from '../src/theme'

const ROLES = [
  { role: 'CLIENT', ic: '🛒', title: 'Je commande', desc: 'Faites vos courses et livrez-vous à domicile' },
  { role: 'MANAGER', ic: '🏪', title: 'Je gère une enseigne', desc: 'Boutique, produits et stocks' },
  { role: 'DRIVER', ic: '🛵', title: 'Je livre', desc: 'Prenez des livraisons proches de vous' },
]

function homeFor(role) {
  if (role === 'MANAGER') return '/manager'
  if (role === 'DRIVER') return '/driver'
  if (role === 'SUPERADMIN') return '/admin'
  return '/client'
}

export default function Landing() {
  const router = useRouter()
  const { user, authReady } = useApp()

  if (authReady && user) return <Redirect href={homeFor(user.role)} />

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.greenDark }} contentContainerStyle={s.wrap}>
      <View>
        <Text style={{ fontSize: 48 }}>🛒🛵</Text>
        <Text style={s.h1}>BjDrive</Text>
        <Text style={s.tag}>
          Commandez auprès d'enseignes vérifiées au Bénin et faites-vous livrer — suivi du livreur en temps réel.
        </Text>
      </View>
      <View style={{ marginTop: 36 }}>
        {ROLES.map((r) => (
          <Pressable key={r.role} style={s.roleBtn} onPress={() => router.push({ pathname: '/login', params: { role: r.role } })}>
            <Text style={{ fontSize: 26 }}>{r.ic}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{r.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,.85)', fontSize: 12, marginTop: 2 }}>{r.desc}</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,.7)', fontSize: 22 }}>›</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => router.push({ pathname: '/login', params: { role: 'SUPERADMIN' } })}>
          <Text style={s.adminLink}>Espace administrateur</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  h1: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 10 },
  tag: { color: 'rgba(255,255,255,.9)', fontSize: 15, marginTop: 8, lineHeight: 22 },
  roleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.2)',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
  },
  adminLink: { color: 'rgba(255,255,255,.8)', fontSize: 12, textAlign: 'center', marginTop: 12, textDecorationLine: 'underline' },
})
