# BjDrive Mobile 🛒🛵

Application mobile **React Native (Expo + expo-router)** de la marketplace BjDrive, connectée à la même API que le web. Même socle technique que `famylife_mobile`.

## Ce que couvre l'app

- **Client** — enseignes vérifiées triées par distance GPS, panier multi-enseignes, **livraison ou retrait sur place**, paiement espèces en natif (KkiaPay finalisé dans le navigateur), suivi temps réel avec **chat** (enseigne + livreur), code de réception, notation, **tableau de bord d'habitudes d'achat**.
- **Livreur** — vérification du compte + **période de confiance** (bannière de progression), courses proches en temps réel, retraits par enseigne (badge « prête »), partage GPS continu, validation par code, chat, gains du jour et sur 30 jours.
- **Manager** — commandes reçues (« marquer prête », **remise au livreur tracée**, validation des retraits par code), chat client, ajustement rapide des stocks. (Création d'enseigne, imports, photos et employés : sur le web.)
- **Employé (staff)** — **scanner de code-barres par caméra** (produit connu → stock en un geste ; inconnu → création préremplie), commandes, retraits, chat.
- **Super-admin** — vue synthétique (KPIs + actions en attente) avec renvoi vers le dashboard web.

**Transverse** : guide de prise en main à la première connexion (par rôle), **mot de passe oublié** (lien e-mail), **déverrouillage biométrique** (empreinte / Face ID, activable dans chaque écran compte), suppression de compte (mot de passe requis), icônes Material.

## Démarrer (développement)

```bash
cd mobile
npm install
npx expo start --tunnel     # scannez le QR code avec Expo Go (Android/iOS)
```

⚠️ **API en développement local** : le téléphone ne connaît pas `localhost`. Éditez `app.json` → `extra` :

```json
"extra": {
  "apiUrl": "http://IP_DE_VOTRE_PC:3007/api",
  "socketUrl": "http://IP_DE_VOTRE_PC:3007",
  "webUrl": "http://IP_DE_VOTRE_PC:8080"
}
```

(IP LAN de votre machine, ex. `192.168.1.20` — `ipconfig` pour la trouver, téléphone sur le même Wi-Fi.)
Par défaut, l'app pointe sur la production : `https://bjdrive.dkpsolution.tech`.

ℹ️ La **biométrie** et la **caméra** nécessitent un vrai téléphone (pas un émulateur basique).

## Build de production

```bash
npx eas build --platform android    # nécessite un compte Expo (EAS)
```

## Structure

```
app/                écrans (expo-router, routage par fichiers)
  index.js          accueil / choix du rôle · login.js · register.js · forgot.js
  client/           onglets client (enseignes, commandes, compte + stats)
  store/[id].js     fiche enseigne + panier · cart.js · checkout.js (livraison/retrait, cash)
  track/[id].js     suivi temps réel + chat + avis + détail des frais
  driver/           dashboard livreur (confiance, GPS, courses, code, chat, gains)
  staff/            espace employé (scanner caméra, stocks, retraits, chat)
  manager/          commandes (prête, remise, retraits), stocks, compte
  admin/            vue synthétique
src/
  api.js            client HTTP (refresh token automatique, AsyncStorage)
  realtime.js       Socket.IO (suivi, chat, nouvelles courses)
  store.js          contexte auth + panier
  biolock.js        verrou biométrique (BioGate + BioToggle)
  DeleteAccount.js  suppression de compte · ChatBox.js · OnboardingGate.js
  ui.js, theme.js   composants et charte BjDrive · config.js (URLs)
```

## Pistes suivantes

- Notifications push natives (expo-notifications + FCM) en complément du web-push.
- SDK KkiaPay React Native pour payer sans quitter l'app.
- react-native-maps pour la carte de suivi en natif.
