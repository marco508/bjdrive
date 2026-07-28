// Guide de prise en main à la PREMIÈRE connexion (par rôle), version mobile.
import { useEffect, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { C } from './theme'

const GUIDES = {
  CLIENT: [
    { ic: '👋', title: 'Bienvenue sur BjDrive !', text: 'Faites vos courses dans des enseignes vérifiées près de chez vous et faites-vous livrer — ou passez les chercher. Voici comment ça marche.' },
    { ic: '💵', title: 'Payez quand c’est dans vos mains', text: 'Aucun risque : payez en espèces À LA RÉCEPTION, seulement quand vos courses sont devant vous. Mobile Money et carte disponibles si vous préférez payer d’avance.' },
    { ic: '🔐', title: 'Votre code de sécurité', text: 'Un code à 4 chiffres s’affiche dans votre suivi : personne ne peut prétendre vous avoir livré sans lui. Donnez-le au livreur (ou à l’enseigne pour un retrait) seulement à la remise.' },
    { ic: '📍', title: 'Trouvez vos enseignes', text: 'Autorisez la localisation : nous affichons les enseignes les plus proches, triées par distance.' },
    { ic: '🧺', title: 'Panier et suivi en direct', text: 'Plusieurs enseignes dans un panier, un seul livreur pour la tournée, sa position en temps réel — et un chat pour lui parler ou parler à l’enseigne.' },
  ],
  DRIVER: [
    { ic: '👋', title: 'Bienvenue, livreur !', text: 'Gagnez de l’argent en livrant les commandes proches de vous.' },
    { ic: '🛡️', title: 'Vérification du compte', text: 'L’équipe BjDrive valide votre profil avant votre première course. Renseignez votre téléphone pour être contacté.' },
    { ic: '📡', title: 'Partagez votre position', text: 'Activez le partage GPS pour voir les courses proches et permettre au client de vous suivre.' },
    { ic: '🔐', title: 'Livrez et validez', text: 'Récupérez dans chaque enseigne, puis saisissez le code de réception du client à la remise. Pour les commandes espèces, encaissez le montant affiché. Le chat de la commande vous relie au client et à l’enseigne.' },
  ],
  MANAGER: [
    { ic: '👋', title: 'Bienvenue !', text: 'Suivez vos commandes et vos stocks depuis votre téléphone.' },
    { ic: '🧾', title: 'Préparez les commandes', text: 'Marquez chaque commande « prête » quand elle est emballée — le livreur ou le client est prévenu. Répondez aux questions des clients dans le chat.' },
    { ic: '👥', title: 'Vos employés', text: 'Créez des comptes employés depuis l’application web : ils scannent les codes-barres avec la caméra pour renseigner produits et stocks.' },
  ],
  STAFF: [
    { ic: '👋', title: 'Bienvenue dans l’équipe !', text: 'Votre compte est rattaché à votre enseigne : produits, stocks et commandes.' },
    { ic: '📷', title: 'Scannez les codes-barres', text: 'Utilisez la caméra pour scanner un produit : s’il existe, ajustez son stock ; sinon, créez-le en quelques secondes. Chaque code est propre à votre enseigne.' },
    { ic: '🧾', title: 'Commandes & retraits', text: 'Marquez les commandes « prêtes », validez les retraits sur place avec le code du client, et répondez-lui dans le chat.' },
  ],
}

export default function OnboardingGate({ role }) {
  const steps = GUIDES[role]
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!steps) return
    AsyncStorage.getItem('bjdrive_onboard_' + role).then((seen) => {
      if (!seen) setVisible(true)
    })
  }, [role, steps])

  if (!steps || !visible) return null
  const s = steps[step]
  const last = step === steps.length - 1

  function close() {
    AsyncStorage.setItem('bjdrive_onboard_' + role, '1').catch(() => {})
    setVisible(false)
  }

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(6,32,17,0.65)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 22, padding: 26, alignItems: 'center' }}>
          <Text style={{ fontSize: 50 }}>{s.ic}</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', marginTop: 10, textAlign: 'center' }}>{s.title}</Text>
          <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: 'center', minHeight: 84 }}>{s.text}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginVertical: 14 }}>
            {steps.map((_, i) => (
              <View key={i} style={{ width: i === step ? 20 : 8, height: 8, borderRadius: 4, backgroundColor: i === step ? C.green : C.line }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
            {!last && (
              <Pressable onPress={close} style={{ paddingVertical: 13, paddingHorizontal: 16, borderRadius: 13, backgroundColor: C.greenSoft }}>
                <Text style={{ color: C.greenDark, fontWeight: '700' }}>Passer</Text>
              </Pressable>
            )}
            <Pressable onPress={() => (last ? close() : setStep(step + 1))} style={{ flex: 1, paddingVertical: 13, borderRadius: 13, backgroundColor: C.green, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{last ? "C'est parti 🚀" : 'Suivant ›'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}
