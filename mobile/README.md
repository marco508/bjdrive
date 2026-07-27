# BjDrive Mobile 🛒🛵

Application mobile **React Native (Expo + expo-router)** de la marketplace BjDrive, connectée à la même API que le web. Même socle technique que `famylife_mobile`.

## Ce que couvre l'app

- **Client** — parcourir les enseignes vérifiées (triées par distance GPS), remplir le panier multi-enseignes, commander (💵 espèces à la livraison en natif ; 💳 KkiaPay finalisé dans le navigateur), suivre la livraison en temps réel (Socket.IO), code de réception, noter livreur et enseignes.
- **Livreur** — vérification du compte, courses proches en temps réel, acceptation (plafond/jour), retraits par enseigne (badge « prête »), partage GPS continu (position envoyée toutes les ~12 s), validation par code, gains du jour et sur 30 jours.
- **Manager** — commandes reçues, bouton « marquer comme prête », ajustement rapide des stocks. (Création d'enseigne, imports et photos : sur le web.)
- **Super-admin** — vue synthétique (KPIs + actions en attente) avec renvoi vers le dashboard web complet.

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

(IP LAN de votre machine, ex. `192.168.1.20` — `ipconfig` pour la trouver, et le téléphone doit être sur le même Wi-Fi.)

Par défaut, l'app pointe sur la production : `https://bjdrive.dkpsolution.tech`.

## Build de production

```bash
npx eas build --platform android    # nécessite un compte Expo (EAS)
```

## Structure

```
app/                écrans (expo-router, routage par fichiers)
  index.js          accueil / choix du rôle
  login.js, register.js
  client/           onglets client (enseignes, commandes, compte)
  store/[id].js     fiche enseigne + panier
  cart.js, checkout.js
  track/[id].js     suivi temps réel + avis
  driver/           dashboard livreur (GPS, courses, code)
  manager/          commandes, stocks
  admin/            vue synthétique
src/
  api.js            client HTTP (refresh token automatique, AsyncStorage)
  realtime.js       Socket.IO (suivi commande, nouvelles courses)
  store.js          contexte auth + panier
  ui.js, theme.js   composants et charte BjDrive
  config.js         URLs API/socket/web (app.json > extra)
```

## Pistes suivantes

- Notifications push natives (expo-notifications + FCM) en complément du web-push.
- SDK KkiaPay React Native pour payer sans quitter l'app.
- react-native-maps pour la carte de suivi en natif.
