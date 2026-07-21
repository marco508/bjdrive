import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

// Requêtes géographiques (PostGIS). Les colonnes `geo` (geography) sont ajoutées
// par prisma/apply-postgis.ts à partir de lat/lng et indexées en GiST.
@Injectable()
export class GeoService {
  constructor(private prisma: PrismaService) {}

  // Enseignes vérifiées triées de la plus proche à la plus éloignée (couverture nationale).
  async verifiedStoresNear(lat: number, lng: number, radius = 200000, limit = 60): Promise<Array<{ id: string; distance: number }>> {
    return this.prisma.$queryRawUnsafe(
      `SELECT id, ST_Distance(geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance
       FROM "Store"
       WHERE status = 'VERIFIED' AND active = true AND geo IS NOT NULL
         AND ST_DWithin(geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
       ORDER BY distance ASC
       LIMIT $4`,
      lng,
      lat,
      radius,
      limit,
    )
  }

  // Commandes en attente de prise en charge, proches du livreur (distance à l'enseigne la plus proche de la tournée).
  async awaitingOrdersNear(lat: number, lng: number, radius = 30000): Promise<Array<{ id: string; distance: number }>> {
    return this.prisma.$queryRawUnsafe(
      `SELECT o.id AS id, MIN(ST_Distance(s.geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)) AS distance
       FROM "Order" o
       JOIN "OrderStore" os ON os."orderId" = o.id
       JOIN "Store" s ON s.id = os."storeId"
       WHERE o.status = 'AWAITING_DRIVER' AND s.geo IS NOT NULL
         AND ST_DWithin(s.geo, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3)
       GROUP BY o.id
       ORDER BY distance ASC`,
      lng,
      lat,
      radius,
    )
  }

  // Recherche d'un produit dans toutes les enseignes vérifiées (comparaison de prix).
  // Trié par prix croissant ; distance renseignée si la position du client est fournie.
  async searchProducts(term: string, lat?: number, lng?: number, limit = 60) {
    const like = `%${term}%`
    if (lat != null && lng != null) {
      return this.prisma.$queryRawUnsafe(
        `SELECT p.id, p.name, p.price, p.unit, p.emoji, p.stock,
                s.id AS "storeId", s.name AS "storeName", s.emoji AS "storeEmoji", s.color AS "storeColor", s.address AS "storeAddress", s.lat AS "storeLat", s.lng AS "storeLng",
                ST_Distance(s.geo, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) AS distance
         FROM "Product" p JOIN "Store" s ON s.id = p."storeId"
         WHERE s.status = 'VERIFIED' AND s.active = true AND p.active = true AND p.stock > 0 AND p.name ILIKE $1
         ORDER BY p.price ASC
         LIMIT $4`,
        like,
        lng,
        lat,
        limit,
      )
    }
    return this.prisma.$queryRawUnsafe(
      `SELECT p.id, p.name, p.price, p.unit, p.emoji, p.stock,
              s.id AS "storeId", s.name AS "storeName", s.emoji AS "storeEmoji", s.color AS "storeColor", s.address AS "storeAddress", s.lat AS "storeLat", s.lng AS "storeLng",
              NULL::float AS distance
       FROM "Product" p JOIN "Store" s ON s.id = p."storeId"
       WHERE s.status = 'VERIFIED' AND s.active = true AND p.active = true AND p.stock > 0 AND p.name ILIKE $1
       ORDER BY p.price ASC
       LIMIT $2`,
      like,
      limit,
    )
  }
}
