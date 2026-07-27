# BjDrive 🛒🛵

Marketplace de livraison à domicile au **Bénin** : les clients commandent auprès d'enseignes vérifiées (supermarché, hypermarché, kiosque, pharmacie…) et se font livrer, avec **suivi du livreur en temps réel**, **paiement KkiaPay** (Mobile Money / Moov Money / carte) et **commission plateforme de 10 %**.

## Organisation du dépôt (monorepo)

```
BjDrive/
  backend/            API NestJS + Prisma + PostgreSQL/PostGIS  (voir backend/README.md)
  frontend/           Application web PWA (React) — à rebrancher sur l'API
  docker-compose.yml  Base de données + API + Web, en une commande
```

## Démarrage

```bash
docker compose up --build
```
- API : http://localhost:3007/api
- Web : http://localhost:8080
- Base : PostgreSQL/PostGIS sur le port 5432

Le super-admin est créé au démarrage (identifiants dans les variables d'environnement, voir `backend/.env.example`).

## Parcours couverts par le backend

**Client** — se connecte, choisit une enseigne vérifiée, remplit son panier, paie en une fois (produits + livraison + 10 % de commission), suit son livreur en temps réel, valide la réception par un **code**.

**Livreur** — voit les commandes payées **proches de lui**, en choisit jusqu'à **5 par jour** (plafond configurable), récupère au magasin (un créneau de livraison est alors proposé au client), partage sa position GPS, clôture avec le code de réception. Il voit ses **gains estimés du jour**.

**Manager d'enseigne** — crée sa boutique (en attente de **vérification**), la positionne sur la carte, gère ses produits et stocks (manuellement ou par **import**), renseigne ses coordonnées de versement.

**Super-admin (propriétaire)** — **vérifie les enseignes** (visite sur place / appel vidéo) avant publication, paramètre les **tarifs de livraison, la commission et le plafond de livraisons/jour**, gère les comptes, et suit les **KPIs** (volume, commission encaissée).

## État d'avancement

- ✅ **Backend complet** : modèle de données, 4 rôles, cycle de commande, commission & répartition, proximité PostGIS, plafond livreur, vérification des enseignes **et des livreurs**, paiement KkiaPay **+ paiement à la livraison (espèces)**, **remboursements**, **versements (soldes enseignes/livreurs)**, **avis/notes**, **photos produits & enseignes**, temps réel, **notifications Web Push**, super-admin. Dockerisé, **migrations Prisma versionnées**, testé (Jest).
- ✅ **Frontend branché sur l'API** : parcours client (dont cash et notation), livreur (vérification, gains 30 j, push), manager (commande « prête », photos), super-admin (livreurs, finances : remboursements & versements).

## Sécurité intégrée

Refresh tokens avec rotation (access token 1 h) · rate limiting (strict sur l'auth) · helmet ·
code de réception limité à 5 essais · webhook KkiaPay protégé par secret + re-vérification ·
paiement simulé interdit en production (`NODE_ENV=production`) · healthchecks Docker sur les 3 services.

## Déploiement sur le VPS (Traefik mutualisé, comme familyfe)

```bash
git clone <repo> bjdrive && cd bjdrive
cp backend/.env.example .env            # puis renseignez les valeurs de production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

- DNS : ajoutez un enregistrement **A `bjdrive.dkpsolution.tech`** vers l'IP du VPS
  (Traefik obtient le certificat Let's Encrypt automatiquement).
- La surcouche [docker-compose.prod.yml](docker-compose.prod.yml) rattache l'API
  (`/api`, `/socket.io`, `/uploads`) et la PWA (racine) au réseau `traefik-proxy`
  existant ; la base n'est accessible qu'en local (`127.0.0.1:5433`).
- Nécessite Docker Compose ≥ 2.24 (tag `!override` sur les ports).
- Mise à jour : `git pull` puis la même commande `up -d --build`.

## Checklist avant mise en production

1. Dans `.env` (racine) : `NODE_ENV=production`, `JWT_SECRET` fort, `SUPERADMIN_PASSWORD` fort.
2. Renseigner les clés **KkiaPay** + `KKIAPAY_WEBHOOK_SECRET` (URL du webhook : `/api/payments/webhook?token=<secret>`).
3. Régénérer les clés **VAPID** (`npx web-push generate-vapid-keys`) — celles du `.env` local sont de dev.
4. Servir l'API et le web en **HTTPS** (reverse proxy) — requis pour le GPS et les notifications push.
5. Adapter `CORS_ORIGIN` et les variables `VITE_*` au domaine réel.

Voir **`backend/README.md`** pour la liste des endpoints et les détails techniques.
