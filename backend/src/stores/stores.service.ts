import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, StoreStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { GeoService } from '../common/geo.service'
import { CreateStoreDto, UpdateStoreDto, ProductDto, ImportProductsDto, UpdateProductDto } from './dto'

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService, private geo: GeoService) {}

  // ---- Catalogue public : uniquement les boutiques vérifiées ----
  async listPublic(params: { categoryId?: string; lat?: number; lng?: number; radius?: number }) {
    if (params.lat != null && params.lng != null) {
      const near = await this.geo.verifiedStoresNear(params.lat, params.lng, params.radius ?? 10000)
      const ids = near.map((n) => n.id)
      if (ids.length === 0) return []
      const stores = await this.prisma.store.findMany({
        where: { id: { in: ids }, ...(params.categoryId ? { categoryId: params.categoryId } : {}) },
        include: { category: true },
      })
      const distById = new Map(near.map((n) => [n.id, Number(n.distance)]))
      return stores
        .map((s) => ({ ...s, distance: distById.get(s.id) ?? null }))
        .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    }
    return this.prisma.store.findMany({
      where: { status: StoreStatus.VERIFIED, active: true, ...(params.categoryId ? { categoryId: params.categoryId } : {}) },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getPublic(id: string) {
    const store = await this.prisma.store.findFirst({
      where: { id, status: StoreStatus.VERIFIED, active: true },
      include: { category: true, products: { where: { active: true }, orderBy: { category: 'asc' } } },
    })
    if (!store) throw new NotFoundException('Boutique introuvable ou non vérifiée.')
    // Note moyenne laissée par les clients après livraison.
    const agg = await this.prisma.review.aggregate({
      where: { targetType: 'STORE', targetId: id },
      _avg: { rating: true },
      _count: true,
    })
    return { ...store, rating: agg._avg.rating, ratingCount: agg._count }
  }

  categories() {
    return this.prisma.category.findMany({ orderBy: { order: 'asc' } })
  }

  // Recherche d'un produit dans toutes les enseignes vérifiées (comparaison de prix).
  searchProducts(term: string, lat?: number, lng?: number) {
    if (!term || term.trim().length < 2) return Promise.resolve([])
    return this.geo.searchProducts(term.trim(), lat, lng)
  }

  // ---- Espace manager ----
  listMine(ownerId: string) {
    return this.prisma.store.findMany({
      where: { ownerId },
      include: { category: true, _count: { select: { products: true, orderStores: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createStore(ownerId: string, dto: CreateStoreDto) {
    const store = await this.prisma.store.create({
      data: { ...dto, ownerId, status: StoreStatus.PENDING },
    })
    await this.refreshGeo(store.id)
    return store
  }

  private async assertOwner(storeId: string, ownerId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new NotFoundException('Boutique introuvable.')
    if (store.ownerId !== ownerId) throw new ForbiddenException("Cette boutique ne vous appartient pas.")
    return store
  }

  async updateStore(ownerId: string, id: string, dto: UpdateStoreDto) {
    await this.assertOwner(id, ownerId)
    const store = await this.prisma.store.update({ where: { id }, data: dto })
    if (dto.lat != null || dto.lng != null) await this.refreshGeo(id)
    return store
  }

  async getMine(ownerId: string, id: string) {
    await this.assertOwner(id, ownerId)
    return this.prisma.store.findUnique({
      where: { id },
      include: { category: true, products: { orderBy: { createdAt: 'desc' } } },
    })
  }

  // ---- Produits ----
  async addProduct(ownerId: string, storeId: string, dto: ProductDto) {
    await this.assertOwner(storeId, ownerId)
    return this.prisma.product.create({ data: { ...dto, storeId } })
  }

  async importProducts(ownerId: string, storeId: string, dto: ImportProductsDto) {
    await this.assertOwner(storeId, ownerId)
    const data: Prisma.ProductCreateManyInput[] = dto.products.map((p) => ({ ...p, storeId }))
    const res = await this.prisma.product.createMany({ data })
    return { imported: res.count }
  }

  private async assertProductOwner(productId: string, ownerId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: { store: true } })
    if (!product) throw new NotFoundException('Produit introuvable.')
    if (product.store.ownerId !== ownerId) throw new ForbiddenException('Action non autorisée.')
    return product
  }

  async updateProduct(ownerId: string, productId: string, dto: UpdateProductDto) {
    await this.assertProductOwner(productId, ownerId)
    return this.prisma.product.update({ where: { id: productId }, data: dto })
  }

  async removeProduct(ownerId: string, productId: string) {
    await this.assertProductOwner(productId, ownerId)
    await this.prisma.product.delete({ where: { id: productId } })
    return { ok: true }
  }

  // ---- Photos (fichier déjà écrit sur disque par multer, on stocke l'URL) ----
  async setStoreImage(ownerId: string, storeId: string, imageUrl: string) {
    await this.assertOwner(storeId, ownerId)
    return this.prisma.store.update({ where: { id: storeId }, data: { imageUrl }, select: { id: true, imageUrl: true } })
  }

  async setProductImage(ownerId: string, productId: string, imageUrl: string) {
    await this.assertProductOwner(productId, ownerId)
    return this.prisma.product.update({ where: { id: productId }, data: { imageUrl }, select: { id: true, imageUrl: true } })
  }

  // Met à jour la colonne géographique PostGIS d'une boutique.
  private async refreshGeo(storeId: string) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE "Store" SET geo = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography WHERE id = $1`,
      storeId,
    )
  }
}
