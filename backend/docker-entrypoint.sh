#!/bin/sh
set -e

echo "⏳ Attente de la base de données..."
# Réessaie jusqu'à ce que la base réponde (évite le crash au premier démarrage).
tries=0
until npx prisma db push --skip-generate --accept-data-loss; do
  tries=$((tries + 1))
  if [ "$tries" -ge 30 ]; then
    echo "❌ Base de données injoignable après 30 tentatives."
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
