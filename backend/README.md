# API BjDrive

Backend de la marketplace de livraison **BjDrive** (Bénin). Construit pour **passer à l'échelle** et évoluer dans le temps.

**Stack :** NestJS (TypeScript) · PostgreSQL + **PostGIS** (requêtes géographiques) · Prisma (ORM + **migrations versionnées**) · Socket.IO (temps réel) · JWT + refresh tokens (rotation) · **KkiaPay** (Mobile Money / carte) · nodemailer (factures, réinitialisation) · web-push (notifications) · Jest (29 tests d'invariants).

## Rôles

`CLIENT` · `MANAGER` (gérant d'enseigne) · `STAFF` (employé, créé par son gérant, lié à UNE enseigne) · `DRIVER` (livreur) · `SUPERADMIN` (propriétaire de l'application).

## Cycle de vie d'une commande

```
                       LIVRAISON                            RETRAIT SUR PLACE
PENDING_PAYMENT  → paiement KkiaPay (ou cash direct)   → idem (mono-enseigne, 0 frais livraison)
AWAITING_DRIVER  → proposée aux livreurs proches       —
AWAITING_PICKUP  → livreur accepté, enseigne prépare   → enseigne prépare (« prête »)
IN_DELIVERY      → récupérée (remise tracée), ETA      —
DELIVERED        → CODE DE RÉCEPTION validé (5 essais max) — par le livreur, ou l'enseigne pour un retrait
```

À chaque étape : position GPS diffusée en temps réel (et **persistée** comme preuve), **discussion privée** de la commande (client + équipe enseigne + livreur), notifications push, et **facture nominative par e-mail** à l'encaissement.

## Répartition des paiements

Sur chaque commande payée : l'**enseigne** reçoit le montant des produits, le **livreur** les frais de livraison, la **plateforme** la commission (ajoutée au total client — affichée fusionnée dans « Livraison & service », détail sur demande). Montants ventilés dans `Payment` ; soldes calculés en continu avec **délai de litige configurable** avant éligibilité au versement ; versements manuels tracés (`Payout`) vers le compte Mobile Money vérifié. Commandes **cash** : le livreur encaisse, sa dette (total − ses frais) apparaît dans les soldes.

## Vérifications & anti-fraude

- **Enseignes** : créées en `PENDING`, publiées seulement après vérification admin (visite/appel vidéo). Suspension réversible, **blocage définitif** (`BANNED`), suppression (refusée si historique de commandes).
- **Livreurs** : `PENDING` → vérification admin obligatoire ; puis **période de confiance** — avant N livraisons réussies (config), pas de commandes cash ni au-dessus du plafond de valeur.
- **Livraison figée** > 3 h : suspension automatique du livreur + alerte push admin (cron).
- Code de réception : 5 essais, déblocage admin. Webhook KkiaPay : secret partagé + re-vérification de la transaction. Paiement simulé **interdit en production**.

## Démarrer

### Avec Docker (recommandé) — depuis la racine du monorepo
```bash
docker compose up --build     # db (postgis) + api + web
```
L'entrypoint applique les **migrations** (`prisma migrate deploy`, baseline automatique), la colonne PostGIS et le seed (config, catégories, super-admin synchronisé depuis l'env).

### En local
```bash
cp .env.example .env          # DATABASE_URL, JWT_SECRET, KkiaPay, SMTP, VAPID...
npm install
npx prisma generate && npx prisma migrate deploy
npm run db:postgis && npm run db:seed
npm run start:dev             # http://localhost:3007/api
npm test                      # 29 tests Jest (montants, transitions, garde-fous)
```

## Points d'API principaux

| Domaine | Endpoints clés |
|---|---|
| Santé / config | `GET /health` · `GET /config/public` |
| Auth | `POST /auth/register` `/login` `/refresh` `/logout` `/forgot` `/reset` |
| Utilisateur | `GET/PATCH /users/me` · `DELETE /users/me` (mot de passe requis, anonymisation si historique) · comptes de versement |
| Catalogue (public) | `GET /categories` · `GET /stores?lat&lng&radius&categoryId` · `GET /stores/:id` (+ note moyenne) · `GET /products/search?q=` |
| Enseigne (manager) | `POST/PATCH /stores` · produits CRUD + `/import` + photos · `GET/POST/DELETE /stores/:id/staff` |
| Employé (staff) | `GET /staff/my-store` · `GET /stores/:id/products/barcode/:code` (code propre à l'enseigne) |
| Commandes (client) | `POST /orders` (livraison/retrait, KkiaPay/cash) · `GET /orders/mine` · `GET /orders/stats/mine` · `/cancel` (remboursement auto) · `/review` · `PATCH /:id/schedule` |
| Commandes (enseigne) | `GET /orders/store/:storeId` · `POST /:id/store/:storeId/ready` `/handover` (remise au livreur) `/complete-pickup` (retrait, code) |
| Chat | `GET/POST /orders/:id/messages` (participants uniquement, temps réel + push) |
| Paiements | `POST /payments/:orderId/initiate` `/confirm` · `POST /payments/webhook` (secret) |
| Livreur | `GET /deliveries/available` (filtré selon confiance) · `/mine` · `/earnings?days=` · `accept` · `pickup` · `complete` · `location` · `availability` |
| Notifications | `GET /notifications/vapid-public-key` · `POST/DELETE /notifications/subscribe` |
| Admin | enseignes (verify/suspend/**ban**/delete) · livreurs (verify/suspend) · commandes (+`reset-code`) · remboursements (retry/mark) · `balances` (délai de litige, compte de versement) · `payouts` · `config` · `overview` (alertes contextuelles) · utilisateurs |

## Temps réel (Socket.IO)

`subscribeOrder { orderId }` → `orderUpdate`, `driverLocation`, `chatMessage`.
`subscribeDrivers` → `newOrderAvailable` (dashboards livreurs).

## Configuration super-admin (table `AppConfig`)

Frais de base · tarif/km · commission · plafond livraisons/jour · autorisation du cash ·
**seuil de confiance livreur** · **plafond nouveau livreur** · **délai de versement (litiges)** — via `PATCH /admin/config`.

## Structure

```
src/
  auth/           inscription, connexion, refresh (rotation), mot de passe oublié
  users/          profil, comptes de versement, suppression/anonymisation
  stores/         catégories, enseignes (vérif), produits (CRUD, import, code-barres, photos), employés
  orders/         commande (livraison/retrait), montants, avis, remise tracée, stats client
  deliveries/     proximité PostGIS, confiance, plafond/j, code, GPS persisté, cron livraisons figées
  payments/       KkiaPay (init/confirm/webhook), répartition, remboursements
  chat/           messagerie par commande (accès contrôlé)
  notifications/  web-push (VAPID)
  mail/           factures nominatives + réinitialisation (nodemailer)
  admin/          vérifications, finances, modération, réglages, KPIs
  common/         guards, géo (PostGIS), tarifs (pricing testé), paramètres, upload
  realtime/       passerelle Socket.IO
prisma/           schéma, migrations versionnées, seed, PostGIS
```
