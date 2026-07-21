import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { OrderStatus, PaymentStatus, Prisma, StoreStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../common/settings.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { tourDistance, Point } from '../common/distance'
import { CreateOrderDto, ScheduleDto } from './dto'

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private realtime: RealtimeGateway,
  ) {}

  private genReceptionCode() {
    return String(Math.floor(1000 + Math.random() * 9000)) // 4 chiffres
  }

  // Commande combinée pouvant porter sur plusieurs enseignes.
  async create(clientId: string, dto: CreateOrderDto) {
    const productIds = [...new Set(dto.items.map((i) => i.productId))]
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { store: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    // Regroupe les articles par enseigne + valide.
    const perStore = new Map<string, { store: any; subtotal: number; points: Point }>()
    const itemsData: any[] = []
    let subtotal = 0
    for (const it of dto.items) {
      const p = byId.get(it.productId)
      if (!p || !p.active) throw new BadRequestException(`Produit indisponible: ${it.productId}`)
      if (p.store.status !== StoreStatus.VERIFIED || !p.store.active) {
        throw new BadRequestException(`Enseigne indisponible: ${p.store.name}`)
      }
      if (p.stock < it.qty) throw new BadRequestException(`Stock insuffisant pour ${p.name} (reste ${p.stock}).`)
      const line = p.price * it.qty
      subtotal += line
      itemsData.push({ storeId: p.storeId, storeName: p.store.name, productId: p.id, name: p.name, emoji: p.emoji, price: p.price, qty: it.qty })
      const g = perStore.get(p.storeId) || { store: p.store, subtotal: 0, points: { lat: p.store.lat, lng: p.store.lng } }
      g.subtotal += line
      perStore.set(p.storeId, g)
    }
    if (perStore.size === 0) throw new BadRequestException('Panier vide.')

    const cfg = await this.settings.get()
    const dest: Point = { lat: dto.destLat, lng: dto.destLng }
    const { meters, origin } = tourDistance([...perStore.values()].map((g) => g.points), dest)
    const deliveryFee = Math.round(cfg.baseDeliveryFee + (meters / 1000) * cfg.perKmFee)
    const commission = Math.round(subtotal * cfg.commissionRate) // 10% ajouté EN PLUS
    const total = subtotal + deliveryFee + commission

    const order = await this.prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        await tx.product.update({ where: { id: it.productId }, data: { stock: { decrement: it.qty } } })
      }
      const created = await tx.order.create({
        data: {
          clientId,
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
          originLat: origin?.lat,
          originLng: origin?.lng,
          receptionCode: this.genReceptionCode(),
          items: { createMany: { data: itemsData } },
          stores: {
            createMany: {
              data: [...perStore.entries()].map(([storeId, g]) => ({ storeId, subtotal: g.subtotal, payoutAmount: g.subtotal })),
            },
          },
          history: { create: { status: OrderStatus.PENDING_PAYMENT } },
        },
        include: { items: true, stores: { include: { store: true } } },
      })
      return created
    })
    return order
  }

  listMine(clientId: string) {
    return this.prisma.order.findMany({
      where: { clientId },
      include: { items: true, stores: { include: { store: true } }, delivery: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getOne(userId: string, role: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        stores: { include: { store: true } },
        delivery: { include: { driver: { select: { id: true, name: true, phone: true, driverProfile: true } } } },
        payment: true,
      },
    })
    if (!order) throw new NotFoundException('Commande introuvable.')
    const involved =
      role === 'SUPERADMIN' ||
      order.clientId === userId ||
      order.stores.some((os: any) => os.store.ownerId === userId) ||
      order.delivery?.driverId === userId
    if (!involved) throw new ForbiddenException('Accès refusé.')
    return order
  }

  // Commandes reçues par une enseigne (manager) — limité à la part de cette enseigne.
  async listForStore(ownerId: string, storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new NotFoundException('Boutique introuvable.')
    if (store.ownerId !== ownerId) throw new ForbiddenException('Accès refusé.')
    const orders = await this.prisma.order.findMany({
      where: { status: { not: OrderStatus.PENDING_PAYMENT }, stores: { some: { storeId } } },
      include: { items: true, stores: true, delivery: true },
      orderBy: { createdAt: 'desc' },
    })
    // On n'expose que la part de cette enseigne (articles + reversement), pas le code de réception.
    return orders.map(({ receptionCode, items, stores, ...o }: any) => ({
      ...o,
      items: items.filter((it: any) => it.storeId === storeId),
      part: stores.find((s: any) => s.storeId === storeId) || null,
    }))
  }

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

  async cancel(clientId: string, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } })
    if (!order || order.clientId !== clientId) throw new NotFoundException('Commande introuvable.')
    const cancellable: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_DRIVER, OrderStatus.AWAITING_PICKUP]
    if (!cancellable.includes(order.status)) {
      throw new BadRequestException('Cette commande ne peut plus être annulée.')
    }
    await this.prisma.$transaction(async (tx) => {
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
