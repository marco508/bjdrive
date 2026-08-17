import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, Role, StockRequestStatus, StoreStatus } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { GeoService } from '../common/geo.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CreateStaffDto, CreateStoreDto, UpdateStoreDto, ProductDto, ImportProductsDto, UpdateProductDto } from './dto'

@Injectable()
export class StoresService {
  constructor(private prisma: PrismaService, private geo: GeoService, private notifications: NotificationsService) {}

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

  // Gérant OU employé rattaché à l'enseigne (produits, commandes, retraits).
  private async assertStoreAccess(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new NotFoundException('Boutique introuvable.')
    if (store.ownerId === userId) return store
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { staffStoreId: true } })
    if (user?.staffStoreId === storeId) return store
    throw new ForbiddenException("Vous n'avez pas accès à cette boutique.")
  }

  // Autorité sur le STOCK : le gérant, ou un employé désigné valideur.
  // Les autres employés passent par une demande d'ajustement (validée avant application).
  private async canManageStock(storeId: string, userId: string): Promise<boolean> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } })
    if (store?.ownerId === userId) return true
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { staffStoreId: true, staffCanApprove: true },
    })
    return user?.staffStoreId === storeId && !!user.staffCanApprove
  }

  // Gérant + employés valideurs (destinataires des demandes à valider).
  private async stockApproverIds(storeId: string): Promise<string[]> {
    const [store, approvers] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } }),
      this.prisma.user.findMany({
        where: { staffStoreId: storeId, role: Role.STAFF, staffCanApprove: true },
        select: { id: true },
      }),
    ])
    return [...(store ? [store.ownerId] : []), ...approvers.map((a) => a.id)]
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

  // ---- Produits (gérant OU employé de l'enseigne) ----
  async addProduct(userId: string, storeId: string, dto: ProductDto) {
    await this.assertStoreAccess(storeId, userId)
    try {
      return await this.prisma.product.create({ data: { ...dto, barcode: dto.barcode?.trim() || null, storeId } })
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Ce code-barres est déjà utilisé par un autre produit de votre enseigne.')
      throw e
    }
  }

  async importProducts(userId: string, storeId: string, dto: ImportProductsDto) {
    await this.assertStoreAccess(storeId, userId)
    const data: Prisma.ProductCreateManyInput[] = dto.products.map((p) => ({ ...p, storeId }))
    try {
      const res = await this.prisma.product.createMany({ data })
      return { imported: res.count }
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Import refusé : un code-barres du fichier est déjà utilisé dans votre enseigne (ou en doublon dans le fichier).')
      throw e
    }
  }

  private async assertProductAccess(productId: string, userId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: { store: true } })
    if (!product) throw new NotFoundException('Produit introuvable.')
    await this.assertStoreAccess(product.storeId, userId)
    return product
  }

  async updateProduct(userId: string, productId: string, dto: UpdateProductDto) {
    const product = await this.assertProductAccess(productId, userId)
    // Le stock ne se modifie pas librement : gérant/valideur uniquement
    // (les employés passent par une demande d'ajustement).
    if (dto.stock !== undefined && dto.stock !== product.stock && !(await this.canManageStock(product.storeId, userId))) {
      throw new ForbiddenException(
        "La modification du stock doit être validée : utilisez « Demander un ajustement » (le gérant ou un valideur approuvera).",
      )
    }
    try {
      return await this.prisma.product.update({
        where: { id: productId },
        data: { ...dto, ...(dto.barcode !== undefined ? { barcode: dto.barcode?.trim() || null } : {}) },
      })
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('Ce code-barres est déjà utilisé par un autre produit de votre enseigne.')
      throw e
    }
  }

  // ---- Ajustements de stock (correction / réapprovisionnement) ----
  // Gérant ou valideur → appliqué immédiatement. Employé → demande en attente,
  // notifiée aux valideurs. Les VENTES restent automatiques (hors de ce flux).
  async adjustStock(userId: string, productId: string, delta: number, note?: string) {
    if (!Number.isInteger(delta) || delta === 0) throw new BadRequestException('Ajustement invalide.')
    const product = await this.assertProductAccess(productId, userId)
    const newStock = Math.max(0, product.stock + delta)

    if (await this.canManageStock(product.storeId, userId)) {
      const updated = await this.prisma.product.update({ where: { id: productId }, data: { stock: newStock } })
      return { applied: true, product: updated }
    }

    // Une seule demande en attente par produit et par demandeur (anti-spam).
    const existing = await this.prisma.stockRequest.findFirst({
      where: { productId, requestedById: userId, status: StockRequestStatus.PENDING },
    })
    if (existing) {
      throw new BadRequestException('Une demande est déjà en attente de validation pour ce produit.')
    }
    const request = await this.prisma.stockRequest.create({
      data: { productId, storeId: product.storeId, requestedById: userId, oldStock: product.stock, newStock },
      include: { requestedBy: { select: { name: true } }, product: { select: { name: true } } },
    })
    const approvers = await this.stockApproverIds(product.storeId)
    this.notifications.sendToUsers(approvers, {
      title: 'Ajustement de stock à valider',
      body: `${request.requestedBy.name} propose ${product.name} : ${product.stock} → ${newStock}${note ? ` (${note})` : ''}.`,
      url: '/manager/products',
    })
    return { applied: false, request }
  }

  // File des demandes (gérant / valideur). Un employé simple voit SES demandes.
  async listStockRequests(userId: string, storeId: string, status: StockRequestStatus = StockRequestStatus.PENDING) {
    if (!Object.values(StockRequestStatus).includes(status)) {
      throw new BadRequestException('Statut de demande invalide.')
    }
    await this.assertStoreAccess(storeId, userId)
    const isApprover = await this.canManageStock(storeId, userId)
    return this.prisma.stockRequest.findMany({
      where: { storeId, status, ...(isApprover ? {} : { requestedById: userId }) },
      include: {
        product: { select: { id: true, name: true, emoji: true, stock: true, unit: true, barcode: true } },
        requestedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    })
  }

  async decideStockRequest(userId: string, requestId: string, approved: boolean) {
    const request = await this.prisma.stockRequest.findUnique({
      where: { id: requestId },
      include: { product: true, requestedBy: { select: { id: true, name: true } } },
    })
    if (!request) throw new NotFoundException('Demande introuvable.')
    if (request.status !== StockRequestStatus.PENDING) throw new BadRequestException('Demande déjà traitée.')
    if (!(await this.canManageStock(request.storeId, userId))) {
      throw new ForbiddenException('Seul le gérant ou un valideur désigné peut trancher.')
    }
    if (approved) {
      // Appliqué en DELTA par rapport au stock du moment : les ventes survenues
      // entre la demande et la validation ne sont pas écrasées.
      const delta = request.newStock - request.oldStock
      const target = Math.max(0, request.product.stock + delta)
      await this.prisma.$transaction([
        this.prisma.product.update({ where: { id: request.productId }, data: { stock: target } }),
        this.prisma.stockRequest.update({
          where: { id: requestId },
          data: { status: StockRequestStatus.APPROVED, decidedById: userId, decidedAt: new Date() },
        }),
      ])
    } else {
      await this.prisma.stockRequest.update({
        where: { id: requestId },
        data: { status: StockRequestStatus.REJECTED, decidedById: userId, decidedAt: new Date() },
      })
    }
    this.notifications.sendToUser(request.requestedBy.id, {
      title: approved ? 'Ajustement de stock validé' : 'Ajustement de stock refusé',
      body: `${request.product.name} : ${request.oldStock} → ${request.newStock} — ${approved ? 'appliqué.' : 'refusé par un valideur.'}`,
      url: '/staff',
    })
    return { ok: true, approved }
  }

  // Le gérant désigne (ou retire) un employé valideur de stock.
  async setStaffApprover(ownerId: string, storeId: string, staffId: string, canApprove: boolean) {
    await this.assertOwner(storeId, ownerId)
    const staff = await this.prisma.user.findUnique({ where: { id: staffId } })
    if (!staff || staff.staffStoreId !== storeId || staff.role !== Role.STAFF) {
      throw new NotFoundException('Employé introuvable pour cette enseigne.')
    }
    await this.prisma.user.update({ where: { id: staffId }, data: { staffCanApprove: canApprove } })
    this.notifications.sendToUser(staffId, {
      title: canApprove ? 'Vous êtes valideur de stock' : 'Rôle de valideur retiré',
      body: canApprove
        ? 'Votre gérant vous a désigné pour valider les ajustements de stock.'
        : 'Vous ne validez plus les ajustements de stock.',
      url: '/staff',
    })
    return { ok: true, canApprove }
  }

  async removeProduct(userId: string, productId: string) {
    await this.assertProductAccess(productId, userId)
    await this.prisma.product.delete({ where: { id: productId } })
    return { ok: true }
  }

  // Recherche par code-barres (scanner employé). Le code est propre à l'enseigne.
  async findByBarcode(userId: string, storeId: string, code: string) {
    await this.assertStoreAccess(storeId, userId)
    const product = await this.prisma.product.findUnique({
      where: { storeId_barcode: { storeId, barcode: code.trim() } },
    })
    return { found: !!product, product }
  }

  // ---- Employés (créés par le gérant, rattachés à SON enseigne) ----
  async listStaff(ownerId: string, storeId: string) {
    await this.assertOwner(storeId, ownerId)
    return this.prisma.user.findMany({
      where: { staffStoreId: storeId, role: Role.STAFF },
      select: { id: true, name: true, email: true, phone: true, createdAt: true, staffCanApprove: true },
      orderBy: { createdAt: 'asc' },
    })
  }

  async addStaff(ownerId: string, storeId: string, dto: CreateStaffDto) {
    await this.assertOwner(storeId, ownerId)
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) throw new BadRequestException('Un compte existe déjà avec cet e-mail.')
    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, phone: dto.phone, passwordHash, role: Role.STAFF, staffStoreId: storeId },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
    })
    return user
  }

  async removeStaff(ownerId: string, storeId: string, staffId: string) {
    await this.assertOwner(storeId, ownerId)
    const staff = await this.prisma.user.findUnique({ where: { id: staffId } })
    if (!staff || staff.staffStoreId !== storeId || staff.role !== Role.STAFF) {
      throw new NotFoundException('Employé introuvable pour cette enseigne.')
    }
    // Détaché puis désactivé — PAS supprimé : ses messages dans les discussions
    // de commandes (preuves en cas de litige) doivent survivre à son départ.
    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId: staffId } }),
      this.prisma.pushSubscription.deleteMany({ where: { userId: staffId } }),
      this.prisma.user.update({
        where: { id: staffId },
        data: {
          staffStoreId: null,
          staffCanApprove: false,
          name: `${staff.name} (parti)`,
          email: `ex-staff-${staffId}@deleted.bjdrive`,
          passwordHash: randomBytes(32).toString('hex'), // plus aucune connexion
        },
      }),
    ])
    return { ok: true }
  }

  // L'enseigne d'un employé connecté (avec ses produits).
  async myStaffStore(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { staffStoreId: true } })
    if (!user?.staffStoreId) throw new NotFoundException("Aucune enseigne rattachée à ce compte employé.")
    return this.prisma.store.findUnique({
      where: { id: user.staffStoreId },
      include: { category: true, products: { orderBy: { createdAt: 'desc' } } },
    })
  }

  // ---- Photos (fichier déjà écrit sur disque par multer, on stocke l'URL) ----
  async setStoreImage(ownerId: string, storeId: string, imageUrl: string) {
    await this.assertOwner(storeId, ownerId)
    return this.prisma.store.update({ where: { id: storeId }, data: { imageUrl }, select: { id: true, imageUrl: true } })
  }

  async setProductImage(userId: string, productId: string, imageUrl: string) {
    await this.assertProductAccess(productId, userId)
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
