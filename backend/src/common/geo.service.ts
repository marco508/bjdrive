import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

// Requêtes géographiques (PostGIS). Les colonnes `geo` (geography) sont ajoutées
// par prisma/apply-postgis.ts à partir de lat/lng et indexées en GiST.
@Injectable()
export class GeoService {
  constructor(private prisma: PrismaService) {}

  // Boutiques vérifiées à moins de `radius` mètres, triées par distance.
  async verifiedStoresNear(lat: number, lng: number, radius = 10000): Promise<Array<{ id: string; distance: number }>> {
    return this.prisma.$queryRawUnsafe(
      `SELECT id, ST_Distance(geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance
       FROM "Store"
       WHERE status = 'VERIFIED' AND active = true
         AND geo IS NOT NULL
         AND ST_DWithin(geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
       ORDER BY distance ASC`,
      lng,
      lat,
      radius,
    )
  }

  // Commandes en attente de prise en charge dont le point de RETRAIT (magasin)
  // est proche de la position du livreur.
  async awaitingOrdersNear(lat: number, lng: number, radius = 8000): Promise<Array<{ id: string; distance: number }>> {
    return this.prisma.$queryRawUnsafe(
      `SELECT o.id AS id,
              ST_Distance(s.geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance
       FROM "Order" o
       JOIN "Store" s ON s.id = o."storeId"
       WHERE o.status = 'AWAITING_DRIVER'
         AND s.geo IS NOT NULL
         AND ST_DWithin(s.geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
       ORDER BY distance ASC`,
      lng,
      lat,
      radius,
    )
  }

  // Distance à vol d'oiseau (mètres) entre deux points.
  async distance(aLat: number, aLng: number, bLat: number, bLng: number): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ d: number }>>(
      `SELECT ST_Distance(ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,
                          ST_SetSRID(ST_MakePoint($3,$4),4326)::geography) AS d`,
      aLng,
      aLat,
      bLng,
      bLat,
    )
    return Number(rows[0]?.d ?? 0)
  }
}
