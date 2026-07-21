import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { OrderStatus, PaymentStatus, Prisma, StoreStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { GeoService } from '../common/geo.service'
import { SettingsService } from '../common/settings.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { CreateOrderDto, ScheduleDto } from './dto'

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private geo: GeoService,
    private settings: SettingsService,
    private realtime: RealtimeGateway,
  ) {}

  private genReceptionCode() {
    return String(Math.floor(1000 + Math.random() * 9000)) // 4 chiffres
  }

  // Calcul des frais de livraison : forfait boutique, sinon base + distance*perKm.
  private async computeDeliveryFee(store: { deliveryFee: number | null; lat: number; lng: number }, destLat: number, destLng: number) {
    const cfg = await this.settings.get()
    if (store.deliveryFee != null) return store.deliveryFee
    const meters = await this.geo.distance(store.lat, store.lng, destLat, destLng)
    const km = meters / 1000
    return Math.round(cfg.baseDeliveryFee + km * cfg.perKmFee)
  }

  async create(clientId: string, dto: CreateOrderDto) {
    const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } })
    if (!store || store.status !== StoreStatus.VERIFIED || !store.active) {
      throw new BadRequestException('Boutique indisponible.')
    }

    const productIds = dto.items.map((i) => i.productId)
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, storeId: store.id } })
    const byId = new Map(products.map((p) => [p.id, p]))

    let subtotal = 0
    const itemsData: Prisma.OrderItemCreateManyOrderInput[] = []
    for (const it of dto.items) {
      const p = byId.get(it.productId)
      if (!p || !p.active) throw new BadRequestException(`Produit indisponible: ${it.productId}`)
      if (p.stock < it.qty) throw new BadRequestException(`Stock insuffisant pour ${p.name} (reste ${p.stock}).`)
      subtotal += p.price * it.qty
      itemsData.push({ productId: p.id, name: p.name, emoji: p.emoji, price: p.price, qty: it.qty })
    }

    const cfg = await this.settings.get()
    const deliveryFee = await this.computeDeliveryFee(store, dto.destLat, dto.destLng)
    const commission = Math.round(subtotal * cfg.commissionRate) // 10% ajouté EN PLUS
    const total = subtotal + deliveryFee + commission

    // Transaction : réserve le stock + crée la commande.
    const order = await this.prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        await tx.product.update({ where: { id: it.productId }, data: { stock: { decrement: it.qty } } })
      }
      return tx.order.create({
        data: {
          clientId,
          storeId: store.id,
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.PENDING,
          subtotal,
          deliveryFee,
          commission,
          total,
          destLat: dto.destLat,
          destLng: dto.destLng,
          destAddress: dto.destAddress,
          destNote: dto.destNote,
          receptionCode: this.genReceptionCode(),
          items: { createMany: { data: itemsData } },
          history: { create: { status: OrderStatus.PENDING_PAYMENT } },
        },
        include: { items: true, store: { include: { category: true } } },
      })
    })
    return order
  }

  async listMine(clientId: string) {
    return this.prisma.order.findMany({
      where: { clientId },
      include: { items: true, store: true, delivery: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getOne(userId: string, role: string, id: string) {
    const order = await this.prisma.order.findUnique({
      include: { items: true, store: true, delivery: { include: { driver: { select: { id: true, name: true, phone: true, driverProfile: true } } } }, payment: true },
      where: { id },
    })
    if (!order) throw new NotFoundException('Commande introuvable.')
    const involved =
      role === 'SUPERADMIN' ||
      order.clientId === userId ||
      order.store.ownerId === userId ||
      order.delivery?.driverId === userId
    if (!involved) throw new ForbiddenException('Accès refusé.')
    return order
  }

  // Commandes reçues par une boutique (manager).
  async listForStore(ownerId: string, storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new NotFoundException('Boutique introuvable.')
    if (store.ownerId !== ownerId) throw new ForbiddenException('Accès refusé.')
    const orders = await this.prisma.order.findMany({
      where: { storeId, status: { not: OrderStatus.PENDING_PAYMENT } },
      include: { items: true, delivery: true },
      orderBy: { createdAt: 'desc' },
    })
    // Le code de réception n'est pas exposé au manager.
    return orders.map(({ receptionCode, ...o }) => o)
  }

  // Le client modifie le créneau de livraison — une seule fois.
  async reschedule(clientId: string, id: string, dto: ScheduleDto) {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order || order.clientId !== clientId) throw new NotFoundException('Commande introuvable.')
    if (order.status !== OrderStatus.IN_DELIVERY) throw new BadRequestException("Le créneau n'est modifiable qu'en cours de livraison.")
    if (order.scheduleModified) throw new BadRequestException('Vous avez déjà modifié le créneau une fois.')
    const updated = await this.prisma.order.update({
      where: { id },
      data: { scheduledDeliveryAt: new Date(dto.scheduledDeliveryAt), scheduleModified: true },
    })
    this.realtime.emitOrder(id, 'orderUpdate', { id, scheduledDeliveryAt: updated.scheduledDeliveryAt, scheduleModified: true })
    return updated
  }

  // Annulation par le client avant récupération.
  async cancel(clientId: string, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } })
    if (!order || order.clientId !== clientId) throw new NotFoundException('Commande introuvable.')
    const cancellable: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_DRIVER, OrderStatus.AWAITING_PICKUP]
    if (!cancellable.includes(order.status)) {
      throw new BadRequestException('Cette commande ne peut plus être annulée.')
    }
    await this.prisma.$transaction(async (tx) => {
      // restaure le stock réservé
      for (const it of order.items) {
        await tx.product.update({ where: { id: it.productId }, data: { stock: { increment: it.qty } } }).catch(() => {})
      }
      await tx.order.update({ where: { id }, data: { status: OrderStatus.CANCELLED } })
      await tx.orderStatusHistory.create({ data: { orderId: id, status: OrderStatus.CANCELLED, byUserId: clientId } })
    })
    this.realtime.emitOrder(id, 'orderUpdate', { id, status: OrderStatus.CANCELLED })
    return { ok: true }
  }
}
