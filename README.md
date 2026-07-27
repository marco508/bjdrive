# BjDrive 🛒🛵

Marketplace de livraison au **Bénin** : les clients commandent auprès d'**enseignes vérifiées** (supermarché, kiosque, pharmacie…) et se font **livrer** — ou passent **retirer sur place** — avec suivi du livreur en temps réel, **paiement KkiaPay** (Mobile Money / Moov / carte) ou **espèces**, facture par e-mail et **commission plateforme de 10 %** incluse dans le total client.

## Organisation du dépôt (monorepo)

```
BjDrive/
  backend/                 API NestJS + Prisma + PostgreSQL/PostGIS   (voir backend/README.md)
  frontend/                Application web PWA React (responsive : mobile + desktop avec sidebar)
  mobile/                  Application mobile React Native / Expo      (voir mobile/README.md)
  docker-compose.yml       Base + API + Web en une commande (dev)
  docker-compose.prod.yml  Surcouche production (Traefik + HTTPS)
```

## Démarrage (développement)

```bash
docker compose up --build
```

- Web : http://localhost:8080 · API : http://localhost:3007/api · Base : `localhost:5433`
- Le super-admin est **synchronisé au démarrage** depuis `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`
  (fichier `.env` à la racine, jamais dans le code — voir `backend/.env.example`).
- Sans clés KkiaPay ni SMTP, les paiements sont **simulés** et les e-mails **loggués** (dev uniquement).

## Les 5 rôles et leurs parcours

**Client** — enseignes proches (GPS), recherche d'un produit multi-enseignes, panier combiné, choix **livraison ou retrait sur place**, paiement en ligne ou en espèces (facture nominative par e-mail), suivi temps réel + **discussion privée** avec l'enseigne et le livreur, code de réception, notation ⭐, tableau de bord de ses habitudes d'achat.

**Livreur** — compte **vérifié par l'admin** avant la première course ; **période de confiance** (pas d'espèces ni de gros paniers avant N livraisons réussies) ; courses proches en temps réel, retraits par enseigne (badge « prête », remise tracée), partage GPS continu (persisté comme preuve), validation par code (5 essais max), gains du jour et sur 30 jours, note moyenne.

**Manager d'enseigne** — boutique **vérifiée avant publication** (visite / appel vidéo), produits & stocks (saisie, import, **code-barres propre à l'enseigne**, photos), **comptes employés**, préparation des commandes, validation des retraits, chat client, coordonnées de versement.

**Employé (staff)** — créé par son gérant, rattaché à **une seule enseigne** : produits et stocks via **scanner de code-barres** (caméra sur mobile, douchette sur web), commandes, retraits, chat.

**Super-admin** — dashboard d'actions contextuelles (vérifications enseignes **et livreurs**, remboursements, codes bloqués, **livraisons figées**), supervision des commandes, finances (soldes avec **délai de litige**, versements sur compte Mobile Money vérifié), blocage définitif / suppression d'enseigne, réglages (tarifs, commission, cash, seuils anti-fraude).

## Sécurité intégrée

- **Auth** : refresh tokens avec rotation (access 1 h), mot de passe oublié par e-mail (jeton 30 min à usage unique), suppression de compte (anonymisation si historique), rate limiting strict sur l'auth, helmet, déverrouillage **biométrique** sur mobile.
- **Paiements** : webhook KkiaPay protégé par secret + re-vérification de chaque transaction, paiement simulé **interdit en production**, remboursements automatiques + file admin.
- **Anti-fraude** : période de confiance des livreurs (plafond de valeur, cash restreint), suspension automatique sur livraison figée > 3 h + alerte admin, trace GPS persistée 30 j, remise enseigne→livreur horodatée, délai de versement configurable (fenêtre de litige), code de réception limité à 5 essais.
- **Infra** : migrations Prisma versionnées (baseline auto), healthchecks Docker sur les 3 services, `/api/health`, Sentry optionnel.

## Déploiement sur le VPS (Traefik mutualisé)

```bash
git clone <repo> bjdrive && cd bjdrive
cp backend/.env.example .env            # puis renseignez les valeurs de production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

- DNS : enregistrement **A `bjdrive.dkpsolution.tech`** → IP du VPS (certificat Let's Encrypt automatique).
- La surcouche [docker-compose.prod.yml](docker-compose.prod.yml) route l'API (`/api`, `/socket.io`, `/uploads`)
  et la PWA (racine) via le réseau `traefik-proxy` existant ; la base reste locale (`127.0.0.1:5433`).
- Nécessite Docker Compose ≥ 2.24. Mise à jour : `git pull` puis la même commande `up -d --build`
  (les migrations s'appliquent seules au démarrage).

## Checklist avant mise en production

1. `.env` : `NODE_ENV=production`, `JWT_SECRET` fort (`openssl rand -hex 48`), `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`.
2. Clés **KkiaPay** (sandbox puis live) + `KKIAPAY_WEBHOOK_SECRET` — URL du webhook dans le dashboard :
   `https://<domaine>/api/payments/webhook` (le « secret hash » du dashboard = votre `KKIAPAY_WEBHOOK_SECRET`).
3. **SMTP** (`SMTP_HOST/PORT/USER/PASS/FROM`) pour l'envoi réel des factures et des liens de réinitialisation.
4. Clés **VAPID** de production (`npx web-push generate-vapid-keys`) pour les notifications push.
5. HTTPS obligatoire (géré par Traefik) — requis pour le GPS, le push et la caméra du scanner.

Détails techniques et endpoints : **`backend/README.md`** · Application mobile : **`mobile/README.md`**.
