import './load-env'
import { PrismaClient } from '@prisma/client'

// Ajoute la colonne géographique PostGIS + index sur les boutiques.
// À exécuter après les migrations Prisma.
const prisma = new PrismaClient()

async function main() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS postgis;`)
  await prisma.$executeRawUnsafe(`ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS geo geography(Point,4326);`)
  await prisma.$executeRawUnsafe(
    `UPDATE "Store" SET geo = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography WHERE geo IS NULL;`,
  )
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS store_geo_idx ON "Store" USING GIST (geo);`)
  console.log('✅ PostGIS : colonne geo + index prêts.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
