#!/bin/sh
set -e

# Applique les migrations Prisma (versionnées, sans perte de données).
# Cas particulier : une base créée autrefois avec `prisma db push` n'a pas
# d'historique de migrations (erreur P3005) → on la "baseline" en marquant
# la migration initiale comme déjà appliquée (la base doit alors correspondre
# au schéma de 0_init).
echo "⏳ Attente de la base + application des migrations..."
tries=0
while true; do
  if out=$(npx prisma migrate deploy 2>&1); then
    echo "$out"
    break
  fi
  if echo "$out" | grep -q "P3005"; then
    echo "📌 Base existante sans historique de migrations → baseline 0_init."
    npx prisma migrate resolve --applied 0_init
    continue
  fi
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "❌ Base de données injoignable après 30 tentatives."
    echo "$out"
    exit 1
  fi
  echo "   base pas encore prête, nouvelle tentative dans 2s ($tries/30)..."
  sleep 2
done

echo "🌍 Application PostGIS (colonne géo + index)..."
npx ts-node prisma/apply-postgis.ts || true

echo "🌱 Seed (config, catégories, super-admin)..."
npx ts-node prisma/seed.ts || true

echo "🚀 Démarrage de l'API BjDrive..."
node dist/main.js
