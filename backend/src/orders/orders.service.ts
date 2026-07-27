import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Fulfillment, OrderStatus, PaymentMethod, PaymentStatus, ReviewTarget, Role, StoreStatus } from '@prisma/client'
import { randomInt } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../common/settings.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { NotificationsService } from '../notifications/notifications.service'
import { PaymentsService } from '../payments/payments.service'
import { MailService } from '../mail/mail.service'
import { tourDistance, Point } from '../common/distance'
import { computeOrderAmounts } from '../common/pricing'
import { CreateOrderDto, ReviewDto, ScheduleDto } from './dto'

const MAX_CODE_ATTEMPTS = 5

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
    private payments: PaymentsService,
    private mail: MailService,
  ) {}

  // Gérant OU employé de l'enseigne (commandes, préparation, retraits).
  private async assertStoreAccess(storeId: string, userId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new NotFoundException('Boutique introuvable.')
    if (store.ownerId === userId) return store
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { staffStoreId: true } })
    if (user?.staffStoreId === storeId) return store
    throw new ForbiddenException('Accès refusé.')
  }

  // Gérant + employés à notifier pour une enseigne.
  private async storeTeamIds(storeIds: string[]): Promise<string[]> {
    const [stores, staff] = await Promise.all([
      this.prisma.store.findMany({ where: { id: { in: storeIds } }, select: { ownerId: true } }),
      this.prisma.user.findMany({ where: { staffStoreId: { in: storeIds }, role: Role.STAFF }, select: { id: true } }),
    ])
    return [...stores.map((s) => s.ownerId), ...staff.map((s) => s.id)]
  }

  private genReceptionCode() {
    return String(randomInt(1000, 10000)) // 4 chiffres, aléa cryptographique
  }

  // Commande combinée pouvant porter sur plusieurs enseignes.
  async create(clientId: string, dto: CreateOrderDto) {
    const cfg = await this.settings.get()
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.KKIAPAY
    if (paymentMethod === PaymentMethod.CASH && !cfg.allowCashOnDelivery) {
      throw new BadRequestException("Le paiement à la livraison n'est pas disponible actuellement.")
    }

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

    // Retrait sur place : une seule enseigne, pas de frais de livraison,
    // la « destination » est l'enseigne elle-même.
    const fulfillment = dto.fulfillment ?? Fulfillment.DELIVERY
    if (fulfillment === Fulfillment.PICKUP && perStore.size > 1) {
      throw new BadRequestException('Le retrait sur place se fait auprès d’UNE seule enseigne à la fois.')
    }
    const firstStore = [...perStore.values()][0]
    if (fulfillment === Fulfillment.DELIVERY && (dto.destLat == null || dto.destLng == null)) {
      throw new BadRequestException('Position de livraison requise.')
    }
    const dest: Point =
      fulfillment === Fulfillment.PICKUP
        ? firstStore.points
        : { lat: dto.destLat!, lng: dto.destLng! }
    const { meters, origin } = tourDistance([...perStore.values()].map((g) => g.points), dest)
    const amounts = computeOrderAmounts(subtotal, meters, cfg)
    const deliveryFee = fulfillment === Fulfillment.PICKUP ? 0 : amounts.deliveryFee
    const commission = amounts.commission
    const total = subtotal + deliveryFee + commission

    // Cash : la commande part directement en préparation (payée à la remise).
    const initialStatus =
      paymentMethod === PaymentMethod.CASH
        ? fulfillment === Fulfillment.PICKUP
          ? OrderStatus.AWAITING_PICKUP
          : OrderStatus.AWAITING_DRIVER
        : OrderStatus.PENDING_PAYMENT

    const order = await this.prisma.$transaction(async (tx) => {
      for (const it of dto.items) {
        await tx.product.update({ where: { id: it.productId }, data: { stock: { decrement: it.qty } } })
      }
      const created = await tx.order.create({
        data: {
          clientId,
          status: initialStatus,
          paymentStatus: PaymentStatus.PENDING,
          paymentMethod,
          fulfillment,
          subtotal,
          deliveryFee,
          commission,
          total,
          destLat: dest.lat,
          destLng: dest.lng,
          destAddress: fulfillment === Fulfillment.PICKUP ? firstStore.store.address : dto.destAddress,
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
          history: { create: { status: initialStatus } },
        },
        include: { items: true, stores: { include: { store: true } } },
      })
      return created
    })

    if (paymentMethod === PaymentMethod.CASH) {
      const team = await this.storeTeamIds([...perStore.keys()])
      this.notifications.sendToUsers(team, {
        title: 'Nouvelle commande 🛒',
        body: fulfillment === Fulfillment.PICKUP
          ? 'Un client passera retirer sa commande (paiement sur place).'
          : 'Une commande (paiement à la livraison) attend sa préparation.',
        url: '/manager/orders',
      })
      if (fulfillment === Fulfillment.DELIVERY) {
        this.realtime.emitDrivers('newOrderAvailable', { orderId: order.id })
        if (origin) {
          this.notifications.notifyNearbyDrivers(origin, {
            title: 'Course disponible 🛵',
            body: `Livraison à ${deliveryFee} FCFA près de vous (paiement espèces).`,
            url: '/driver',
          })
        }
      }
    }
    return order
  }

  listMine(clientId: string) {
    return this.prisma.order.findMany({
      where: { clientId },
      include: { items: true, stores: { include: { store: true } }, delivery: true, reviews: true },
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
        reviews: true,
      },
    })
    if (!order) throw new NotFoundException('Commande introuvable.')
    const involved =
      role === 'SUPERADMIN' ||
      order.clientId === userId ||
      order.stores.some((os: any) => os.store.ownerId === userId) ||
      order.delivery?.driverId === userId
    if (!involved) throw new ForbiddenException('Accès refusé.')
    // Le code de réception n'est montré qu'au client (et au super-admin).
    if (role !== 'SUPERADMIN' && order.clientId !== userId) {
      const { receptionCode, ...safe } = order as any
      return safe
    }
    return order
  }

  // Commandes reçues par une enseigne (gérant OU employé) — part de cette enseigne.
  async listForStore(userId: string, storeId: string) {
    await this.assertStoreAccess(storeId, userId)
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

  // Le gérant ou un employé confirme que la part de son enseigne est prête.
  async markStoreReady(userId: string, orderId: string, storeId: string) {
    const store = await this.assertStoreAccess(storeId, userId)
    const os = await this.prisma.orderStore.findUnique({
      where: { orderId_storeId: { orderId, storeId } },
      include: { order: { include: { delivery: true } } },
    })
    if (!os) throw new NotFoundException('Commande introuvable pour cette enseigne.')
    const okStatuses: OrderStatus[] = [OrderStatus.AWAITING_DRIVER, OrderStatus.AWAITING_PICKUP]
    if (!okStatuses.includes(os.order.status)) {
      throw new BadRequestException('Cette commande ne peut plus être marquée prête.')
    }
    if (os.readyAt) return { ok: true, readyAt: os.readyAt }
    const updated = await this.prisma.orderStore.update({ where: { id: os.id }, data: { readyAt: new Date() } })
    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, storeReady: storeId, readyAt: updated.readyAt })
    if (os.order.delivery) {
      this.notifications.sendToUser(os.order.delivery.driverId, {
        title: 'Commande prête 📦',
        body: `${store.name} a préparé la commande, vous pouvez passer la récupérer.`,
        url: '/driver',
      })
    }
    return { ok: true, readyAt: updated.readyAt }
  }

  // RETRAIT SUR PLACE : l'enseigne valide la remise avec le code de réception
  // du client (même sécurité que la livraison : 5 essais max).
  async completePickup(userId: string, orderId: string, storeId: string, code: string) {
    await this.assertStoreAccess(storeId, userId)
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { stores: true } })
    if (!order || !order.stores.some((os) => os.storeId === storeId)) throw new NotFoundException('Commande introuvable.')
    if (order.fulfillment !== Fulfillment.PICKUP) throw new BadRequestException('Cette commande est une livraison, pas un retrait.')
    if (order.status !== OrderStatus.AWAITING_PICKUP) throw new BadRequestException('Commande non prête ou déjà remise.')
    if (order.codeAttempts >= MAX_CODE_ATTEMPTS) {
      throw new ForbiddenException('Trop de tentatives : contactez le support BjDrive pour débloquer la commande.')
    }
    if (order.receptionCode !== code) {
      const upd = await this.prisma.order.update({
        where: { id: orderId },
        data: { codeAttempts: { increment: 1 } },
        select: { codeAttempts: true },
      })
      const left = Math.max(0, MAX_CODE_ATTEMPTS - upd.codeAttempts)
      throw new BadRequestException(`Code de réception incorrect (${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''}).`)
    }
    const ops: any[] = [
      this.prisma.orderStore.updateMany({ where: { orderId, storeId }, data: { pickedUpAt: new Date() } }),
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.DELIVERED,
          ...(order.paymentMethod === PaymentMethod.CASH ? { paymentStatus: PaymentStatus.PAID } : {}),
        },
      }),
      this.prisma.orderStatusHistory.create({ data: { orderId, status: OrderStatus.DELIVERED, byUserId: userId } }),
    ]
    if (order.paymentMethod === PaymentMethod.CASH) {
      ops.push(
        this.prisma.payment.upsert({
          where: { orderId },
          update: { status: PaymentStatus.PAID },
          create: {
            orderId,
            provider: 'CASH',
            amount: order.total,
            status: PaymentStatus.PAID,
            storeAmount: order.subtotal,
            driverAmount: 0, // pas de livreur sur un retrait
            platformAmount: order.commission,
          },
        }),
      )
    }
    await this.prisma.$transaction(ops)
    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, status: OrderStatus.DELIVERED })
    this.notifications.sendToUser(order.clientId, {
      title: 'Commande remise ✅',
      body: 'Merci pour votre retrait ! Vous pouvez noter l’enseigne.',
      url: `/client/track/${orderId}`,
      tag: `order-${orderId}`,
    })
    this.mail.sendInvoice(orderId) // facture par e-mail (nom client + enseigne)
    return { ok: true }
  }

  // Habitudes d'achat du client : totaux, produits et enseignes favoris.
  async statsMine(clientId: string) {
    const orders = await this.prisma.order.findMany({
      where: { clientId, status: OrderStatus.DELIVERED },
      include: { items: true, stores: { include: { store: { select: { id: true, name: true, emoji: true } } } } },
    })
    const products = new Map<string, { name: string; emoji: string | null; qty: number; spent: number; count: number }>()
    const stores = new Map<string, { id: string; name: string; emoji: string | null; orders: number; spent: number }>()
    let totalSpent = 0
    for (const o of orders) {
      totalSpent += o.total
      for (const it of o.items) {
        const key = it.name.toLowerCase()
        const p = products.get(key) || { name: it.name, emoji: it.emoji, qty: 0, spent: 0, count: 0 }
        p.qty += it.qty
        p.spent += it.price * it.qty
        p.count += 1
        products.set(key, p)
      }
      for (const os of o.stores) {
        const s = stores.get(os.store.id) || { id: os.store.id, name: os.store.name, emoji: os.store.emoji, orders: 0, spent: 0 }
        s.orders += 1
        s.spent += os.subtotal
        stores.set(os.store.id, s)
      }
    }
    return {
      totalOrders: orders.length,
      totalSpent,
      avgBasket: orders.length ? Math.round(totalSpent / orders.length) : 0,
      topProducts: [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
      topStores: [...stores.values()].sort((a, b) => b.orders - a.orders || b.spent - a.spent).slice(0, 5),
    }
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
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true, delivery: true } })
    if (!order || order.clientId !== clientId) throw new NotFoundException('Commande introuvable.')
    const cancellable: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_DRIVER, OrderStatus.AWAITING_PICKUP]
    if (!cancellable.includes(order.status)) {
      throw new BadRequestException('Cette commande ne peut plus être annulée.')
    }
    await this.prisma.$transaction(async (tx) => {
      for (const it of order.items) {
        await tx.product.update({ where: { id: it.productId }, data: { stock: { increment: it.qty } } }).catch(() => {})
      }
      // Libère le livreur éventuellement assigné (son quota du jour aussi).
      if (order.delivery) await tx.delivery.delete({ where: { orderId: id } })
      await tx.order.update({ where: { id }, data: { status: OrderStatus.CANCELLED } })
      await tx.orderStatusHistory.create({ data: { orderId: id, status: OrderStatus.CANCELLED, byUserId: clientId } })
    })
    this.realtime.emitOrder(id, 'orderUpdate', { id, status: OrderStatus.CANCELLED })
    if (order.delivery) {
      this.notifications.sendToUser(order.delivery.driverId, {
        title: 'Course annulée ❌',
        body: 'Le client a annulé la commande que vous aviez acceptée.',
        url: '/driver',
      })
    }
    // Commande déjà payée → remboursement (auto si possible, sinon file admin).
    let refund: { refunded: boolean } | null = null
    if (order.paymentStatus === PaymentStatus.PAID) {
      refund = await this.payments.requestRefund(id)
    }
    return { ok: true, refund }
  }

  // Avis du client après livraison (livreur et/ou enseignes de la commande).
  async review(clientId: string, orderId: string, dto: ReviewDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true, stores: true },
    })
    if (!order || order.clientId !== clientId) throw new NotFoundException('Commande introuvable.')
    if (order.status !== OrderStatus.DELIVERED) throw new BadRequestException('Vous pourrez noter après la livraison.')

    const ops: any[] = []
    if (dto.driverRating && order.delivery) {
      ops.push(
        this.prisma.review.upsert({
          where: { orderId_targetType_targetId: { orderId, targetType: ReviewTarget.DRIVER, targetId: order.delivery.driverId } },
          update: { rating: dto.driverRating, comment: dto.driverComment },
          create: {
            orderId,
            authorId: clientId,
            targetType: ReviewTarget.DRIVER,
            targetId: order.delivery.driverId,
            rating: dto.driverRating,
            comment: dto.driverComment,
          },
        }),
      )
    }
    const validStoreIds = new Set(order.stores.map((os) => os.storeId))
    for (const s of dto.stores || []) {
      if (!validStoreIds.has(s.storeId)) throw new BadRequestException('Enseigne étrangère à cette commande.')
      ops.push(
        this.prisma.review.upsert({
          where: { orderId_targetType_targetId: { orderId, targetType: ReviewTarget.STORE, targetId: s.storeId } },
          update: { rating: s.rating, comment: s.comment },
          create: { orderId, authorId: clientId, targetType: ReviewTarget.STORE, targetId: s.storeId, rating: s.rating, comment: s.comment },
        }),
      )
    }
    if (ops.length === 0) throw new BadRequestException('Aucune note fournie.')
    await this.prisma.$transaction(ops)
    return { ok: true }
  }
}
