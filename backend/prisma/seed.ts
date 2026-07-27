import './load-env'
import { PrismaClient, Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Catégories d'enseignes (données de référence, pas de données fictives de test).
const CATEGORIES = [
  { slug: 'supermarche', name: 'Supermarché', emoji: '🛒', order: 1 },
  { slug: 'hypermarche', name: 'Hypermarché', emoji: '🏬', order: 2 },
  { slug: 'epicerie', name: 'Épicerie', emoji: '🥫', order: 3 },
  { slug: 'kiosque', name: 'Kiosque', emoji: '🏪', order: 4 },
  { slug: 'boutique', name: 'Boutique / Magasin', emoji: '🛍️', order: 5 },
  { slug: 'pharmacie', name: 'Pharmacie', emoji: '💊', order: 6 },
  { slug: 'boulangerie', name: 'Boulangerie', emoji: '🥖', order: 7 },
  { slug: 'marche', name: 'Marché', emoji: '🧺', order: 8 },
]

async function main() {
  // Configuration par défaut
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      baseDeliveryFee: Number(process.env.DEFAULT_BASE_DELIVERY_FEE) || 500,
      perKmFee: Number(process.env.DEFAULT_PER_KM_FEE) || 100,
      commissionRate: Number(process.env.COMMISSION_RATE) || 0.1,
      maxDeliveriesPerDay: Number(process.env.MAX_DELIVERIES_PER_DAY) || 5,
      currency: 'XOF',
    },
  })
  console.log('⚙️  Configuration prête.')

  // Catégories
  for (const c of CATEGORIES) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: { name: c.name, emoji: c.emoji, order: c.order }, create: c })
  }
  console.log(`🏷️  ${CATEGORIES.length} catégories.`)

  // Super-admin (propriétaire de l'application).
  // Le compte est SYNCHRONISÉ avec SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD à
  // chaque démarrage : pour changer le mot de passe, modifiez le .env et
  // redémarrez. Les identifiants ne sont jamais écrits dans le code ni les logs.
  const email = process.env.SUPERADMIN_EMAIL || 'admin@bjdrive.bj'
  const password = process.env.SUPERADMIN_PASSWORD || 'changez-moi'
  if (process.env.NODE_ENV === 'production' && password === 'changez-moi') {
    console.warn('⚠️  SUPERADMIN_PASSWORD par défaut en production — définissez un mot de passe fort dans le .env !')
  }
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: Role.SUPERADMIN },
    create: { email, passwordHash, role: Role.SUPERADMIN, name: process.env.SUPERADMIN_NAME || 'Super Admin' },
  })
  console.log('👑 Super-admin synchronisé depuis les variables d’environnement.')

  console.log('✅ Seed terminé (données de référence uniquement — aucune donnée fictive).')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
