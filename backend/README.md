# API BjDrive

Backend de la marketplace de livraison **BjDrive** (Bénin). Construit pour **passer à l'échelle** et évoluer dans le temps.

**Stack :** NestJS (TypeScript) · PostgreSQL + **PostGIS** (requêtes géographiques) · Prisma (ORM + migrations) · Socket.IO (suivi temps réel) · JWT (auth par rôle) · **KkiaPay** (Mobile Money / Moov Money / carte + répartition).

## Rôles

`CLIENT` · `MANAGER` (enseigne) · `DRIVER` (livreur) · `SUPERADMIN` (propriétaire de l'application).

## Cycle de vie d'une commande

```
PENDING_PAYMENT  → le client paie (KkiaPay : produits + livraison + 10% commission)
AWAITING_DRIVER  → payée, proposée aux livreurs proches (PostGIS)
AWAITING_PICKUP  → un livreur a accepté (plafond 5/jour)
IN_DELIVERY      → récupérée au magasin ; créneau de livraison proposé (modifiable 1× par le client)
DELIVERED        → validée par le CODE DE RÉCEPTION que le client communique au livreur
```
À chaque étape, la position GPS du livreur est diffusée en temps réel (WebSocket) aux clients qui suivent la commande.

## Répartition des paiements

Sur chaque commande payée : l'**enseigne** reçoit le montant des produits, le **livreur** reçoit les frais de livraison, la **plateforme** reçoit **10 %** (commission ajoutée au total payé par le client). Les montants sont enregistrés dans la table `Payment` (`storeAmount`, `driverAmount`, `platformAmount`). Chaque manager/livreur renseigne ses coordonnées de versement (`PaymentAccount`).

## Vérification des enseignes

N'importe qui peut créer une enseigne (`POST /stores`) : elle démarre en `PENDING`. Le super-admin la vérifie (visite sur place ou appel vidéo) via `POST /admin/stores/:id/verify`. **Seules les enseignes `VERIFIED` sont visibles des clients.**

## Démarrer

### Avec Docker (recommandé) — depuis la racine du monorepo
```bash
docker compose up --build     # db (postgis) + api + web
```

### En local
```bash
cp .env.example .env          # renseignez DATABASE_URL, JWT_SECRET, KkiaPay...
npm install
npx prisma generate
npx prisma db push            # crée les tables + l'extension PostGIS
npm run db:postgis            # colonne géographique + index GiST
npm run db:seed               # config + catégories + super-admin
npm run start:dev             # http://localhost:3007/api
```

## Points d'API principaux

| Méthode & route | Rôle | Description |
|---|---|---|
| `POST /api/auth/register` · `/login` | public | Inscription / connexion (JWT) |
| `GET /api/categories` | public | Catégories d'enseignes |
| `GET /api/stores?lat&lng&radius&categoryId` | public | Enseignes **vérifiées** proches |
| `GET /api/stores/:id` | public | Détail enseigne + produits |
| `POST /api/stores` · `PATCH /api/stores/:id` | manager | Créer / modifier son enseigne |
| `POST /api/stores/:id/products` · `/import` | manager | Ajouter / importer des produits |
| `POST /api/orders` | client | Passer commande (calcule livraison + commission) |
| `POST /api/payments/:orderId/initiate` · `/confirm` | client | Paiement KkiaPay |
| `GET /api/deliveries/available?lat&lng` | livreur | Commandes proches à livrer |
| `POST /api/deliveries/accept/:orderId` | livreur | Accepter (plafond 5/jour) |
| `POST /api/deliveries/:orderId/pickup` | livreur | Récupérer → créneau proposé |
| `POST /api/deliveries/:orderId/complete` | livreur | Valider par code de réception |
| `POST /api/deliveries/location` | livreur | Position GPS (diffusée en direct) |
| `PATCH /api/orders/:id/schedule` | client | Modifier le créneau (1 seule fois) |
| `GET /api/admin/stores?status=PENDING` | super-admin | Enseignes à vérifier |
| `POST /api/admin/stores/:id/verify` | super-admin | Vérifier / refuser |
| `GET/PATCH /api/admin/config` | super-admin | Tarifs, commission, plafond/jour |
| `GET /api/admin/overview` | super-admin | KPIs + commission encaissée |

## Temps réel (Socket.IO)

Le client émet `subscribeOrder { orderId }` puis reçoit `orderUpdate` (changements de statut) et `driverLocation` (position du livreur).

## Configuration modifiable par le super-admin

Frais de livraison de base, tarif par km, **taux de commission (10 %)**, **plafond de livraisons/jour (5)** — table `AppConfig`, éditable via `PATCH /api/admin/config`.

## Structure

```
src/
  auth/         inscription, connexion, JWT, stratégie
  users/        profil + comptes de paiement (versements)
  stores/       catégories, enseignes (vérif), produits (CRUD + import)
  orders/       commande, commission 10%, code réception, cycle de statuts
  deliveries/   proximité (PostGIS), plafond 5/j, pickup, code, géoloc
  payments/     KkiaPay (init/confirm/webhook) + répartition
  admin/        vérification enseignes, config, comptes, KPIs
  common/       guards rôles, géo (PostGIS), paramètres
  realtime/     passerelle Socket.IO
prisma/         schéma, seed (données de référence), PostGIS
```
