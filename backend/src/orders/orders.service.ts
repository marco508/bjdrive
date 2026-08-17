import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
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
import { MAX_CODE_ATTEMPTS } from '../common/constants'
import { CreateOrderDto, ReviewDto, ScheduleDto } from './dto'

// Un client ne peut pas accumuler les commandes en espèces non soldées :
// chaque commande cash fait préparer l'enseigne à ses frais.
const MAX_ACTIVE_CASH_ORDERS = 3

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders')
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
    if (paymentMethod === PaymentMethod.CASH) {
      const activeCash = await this.prisma.order.count({
        where: {
          clientId,
          paymentMethod: PaymentMethod.CASH,
          status: { in: [OrderStatus.AWAITING_DRIVER, OrderStatus.AWAITING_PICKUP, OrderStatus.IN_DELIVERY, OrderStatus.RETURNING] },
        },
      })
      if (activeCash >= MAX_ACTIVE_CASH_ORDERS) {
        throw new BadRequestException(
          `Vous avez déjà ${activeCash} commandes en espèces en cours — terminez-les avant d'en passer une nouvelle.`,
        )
      }
    }

    // Quantités AGRÉGÉES par produit : le même article présent deux fois dans le
    // panier doit être contrôlé (et décrémenté) sur son TOTAL, pas ligne par ligne.
    const qtyByProduct = new Map<string, number>()
    for (const it of dto.items) qtyByProduct.set(it.productId, (qtyByProduct.get(it.productId) || 0) + it.qty)

    const productIds = [...qtyByProduct.keys()]
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { store: true },
    })
    const byId = new Map(products.map((p) => [p.id, p]))

    // Regroupe les articles par enseigne + valide (une ligne par produit, quantité totale).
    const perStore = new Map<string, { store: any; subtotal: number; points: Point }>()
    const itemsData: any[] = []
    let subtotal = 0
    for (const [productId, qty] of qtyByProduct) {
      const p = byId.get(productId)
      if (!p || !p.active) throw new BadRequestException(`Produit indisponible: ${productId}`)
      if (p.store.status !== StoreStatus.VERIFIED || !p.store.active) {
        throw new BadRequestException(`Enseigne indisponible: ${p.store.name}`)
      }
      if (p.stock < qty) throw new BadRequestException(`Stock insuffisant pour ${p.name} (reste ${p.stock}).`)
      const line = p.price * qty
      subtotal += line
      itemsData.push({ storeId: p.storeId, storeName: p.store.name, productId: p.id, name: p.name, emoji: p.emoji, price: p.price, qty })
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
      // Décrément CONDITIONNEL : si un autre client a pris la dernière unité
      // entre la validation et cette transaction, la commande est refusée —
      // le stock ne passe jamais en négatif.
      for (const [productId, qty] of qtyByProduct) {
        const upd = await tx.product.updateMany({
          where: { id: productId, stock: { gte: qty } },
          data: { stock: { decrement: qty } },
        })
        if (upd.count === 0) {
          const p = byId.get(productId)
          throw new BadRequestException(`Stock insuffisant pour ${p?.name || 'un produit'} — il vient d'être acheté.`)
        }
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
    // Un employé (STAFF) accède aux commandes de SON enseigne, comme le gérant.
    let staffStoreId: string | null = null
    if (role === 'STAFF') {
      const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { staffStoreId: true } })
      staffStoreId = u?.staffStoreId ?? null
    }
    const involved =
      role === 'SUPERADMIN' ||
      order.clientId === userId ||
      order.stores.some((os: any) => os.store.ownerId === userId || (staffStoreId && os.storeId === staffStoreId)) ||
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
    } else if (os.order.fulfillment === Fulfillment.PICKUP) {
      // Retrait sur place : c'est le CLIENT qu'on prévient (promis à la confirmation du paiement).
      this.notifications.sendToUser(os.order.clientId, {
        title: 'Commande prête à retirer 🛍️',
        body: `${store.name} a préparé votre commande — passez la retirer avec votre code de réception.`,
        url: `/client/track/${orderId}`,
        tag: `order-${orderId}`,
      })
    }
    return { ok: true, readyAt: updated.readyAt }
  }

  // Chaîne de responsabilité : l'enseigne confirme AVOIR REMIS les produits au
  // livreur assigné (horodaté — preuve de transfert de garde en cas de litige).
  async confirmHandover(userId: string, orderId: string, storeId: string) {
    await this.assertStoreAccess(storeId, userId)
    const os = await this.prisma.orderStore.findUnique({
      where: { orderId_storeId: { orderId, storeId } },
      include: { order: { include: { delivery: { include: { driver: { select: { id: true, name: true } } } } } } },
    })
    if (!os) throw new NotFoundException('Commande introuvable pour cette enseigne.')
    if (!os.order.delivery) throw new BadRequestException("Aucun livreur n'est encore assigné à cette commande.")
    if (os.handedOverAt) return { ok: true, handedOverAt: os.handedOverAt, driver: os.order.delivery.driver.name }
    const updated = await this.prisma.orderStore.update({ where: { id: os.id }, data: { handedOverAt: new Date() } })
    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, handedOverStore: storeId })
    return { ok: true, handedOverAt: updated.handedOverAt, driver: os.order.delivery.driver.name }
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
    const when = new Date(dto.scheduledDeliveryAt).getTime()
    if (Number.isNaN(when) || when < Date.now() - 5 * 60 * 1000 || when > Date.now() + 7 * 24 * 3600 * 1000) {
      throw new BadRequestException('Le créneau doit être entre maintenant et 7 jours.')
    }
    const updated = await this.prisma.order.update({
      where: { id },
      data: { scheduledDeliveryAt: new Date(dto.scheduledDeliveryAt), scheduleModified: true },
    })
    this.realtime.emitOrder(id, 'orderUpdate', { id, scheduledDeliveryAt: updated.scheduledDeliveryAt, scheduleModified: true })
    return updated
  }

  async cancel(clientId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, delivery: true, stores: true },
    })
    if (!order || order.clientId !== clientId) throw new NotFoundException('Commande introuvable.')
    const cancellable: OrderStatus[] = [OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_DRIVER, OrderStatus.AWAITING_PICKUP]
    if (!cancellable.includes(order.status)) {
      throw new BadRequestException('Cette commande ne peut plus être annulée.')
    }
    await this.prisma.$transaction(async (tx) => {
      // Marchandise déjà entre les mains du livreur → plus d'annulation possible
      // (re-vérifié DANS la transaction pour couvrir une récupération simultanée).
      const del = await tx.delivery.findUnique({ where: { orderId: id }, select: { pickedUpAt: true } })
      const parts = await tx.orderStore.findMany({ where: { orderId: id }, select: { pickedUpAt: true, handedOverAt: true } })
      if (del?.pickedUpAt || parts.some((p) => p.pickedUpAt || p.handedOverAt)) {
        throw new BadRequestException('Le livreur a déjà récupéré des produits — contactez le support pour annuler.')
      }
      // Verrou : un seul appel bascule la commande (deux annulations simultanées
      // ne restituent le stock et ne remboursent qu'UNE fois).
      const locked = await tx.order.updateMany({
        where: { id, status: { in: cancellable } },
        data: { status: OrderStatus.CANCELLED },
      })
      if (locked.count === 0) throw new BadRequestException('Cette commande ne peut plus être annulée.')
      for (const it of order.items) {
        // updateMany : ne casse pas la transaction si le produit a été supprimé.
        await tx.product.updateMany({ where: { id: it.productId }, data: { stock: { increment: it.qty } } })
      }
      // Libère le livreur éventuellement assigné (son quota du jour aussi).
      if (order.delivery) await tx.delivery.deleteMany({ where: { orderId: id } })
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

  // ---- Livraison échouée : l'enseigne confirme le RETOUR de sa part ----
  // (le livreur a signalé l'échec → statut RETURNING → il ramène les produits).
  // Quand toutes les enseignes ont confirmé : stock restitué, commande FAILED,
  // remboursement si elle était prépayée. La livraison n'est PAS comptée réussie.
  async confirmReturn(userId: string, orderId: string, storeId: string) {
    await this.assertStoreAccess(storeId, userId)
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, stores: true, delivery: true },
    })
    if (!order || !order.stores.some((os) => os.storeId === storeId)) throw new NotFoundException('Commande introuvable.')
    if (order.status !== OrderStatus.RETURNING) throw new BadRequestException("Aucun retour n'est attendu sur cette commande.")

    const finalized = await this.prisma.$transaction(async (tx) => {
      // Verrou par enseigne : une seule confirmation restitue le stock de sa part.
      const locked = await tx.orderStore.updateMany({
        where: { orderId, storeId, returnedAt: null },
        data: { returnedAt: new Date() },
      })
      if (locked.count === 0) return null // déjà confirmé par cette enseigne
      for (const it of order.items.filter((i) => i.storeId === storeId)) {
        await tx.product.updateMany({ where: { id: it.productId }, data: { stock: { increment: it.qty } } })
      }
      const remaining = await tx.orderStore.count({ where: { orderId, returnedAt: null } })
      if (remaining > 0) return false
      // Toutes les enseignes ont récupéré leur marchandise → clôture.
      const done = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.RETURNING },
        data: { status: OrderStatus.FAILED },
      })
      if (done.count === 0) return false
      await tx.orderStatusHistory.create({ data: { orderId, status: OrderStatus.FAILED, byUserId: userId } })
      return true
    })

    if (finalized === null) return { ok: true, alreadyConfirmed: true }
    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, returnedStore: storeId, ...(finalized ? { status: OrderStatus.FAILED } : {}) })
    if (finalized) {
      // Prépayée → remboursement du client (auto si possible, sinon file admin).
      let refund: { refunded: boolean } | null = null
      if (order.paymentStatus === PaymentStatus.PAID) refund = await this.payments.requestRefund(orderId)
      this.notifications.sendToUser(order.clientId, {
        title: 'Commande non livrée',
        body:
          order.paymentStatus === PaymentStatus.PAID || refund
            ? 'Votre commande n’a pas pu être livrée — son remboursement est en cours.'
            : 'Votre commande n’a pas pu être livrée. N’hésitez pas à recommander.',
        url: `/client/track/${orderId}`,
        tag: `order-${orderId}`,
      })
      return { ok: true, finalized: true, refund }
    }
    return { ok: true, finalized: false }
  }

  // ---- Expiration des commandes en ligne jamais payées ----
  // Le stock est réservé à la création : sans ce filet, un panier jamais payé
  // séquestrerait les produits indéfiniment (et priverait l'enseigne de ventes).
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireStalePendingOrders() {
    const cfg = await this.settings.get()
    const ttlMin = (cfg as any).pendingPaymentTtlMin ?? 45
    const cutoff = new Date(Date.now() - ttlMin * 60 * 1000)
    const stale = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_PAYMENT, createdAt: { lt: cutoff } },
      include: { items: true },
      take: 100,
    })
    for (const order of stale) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const locked = await tx.order.updateMany({
            where: { id: order.id, status: OrderStatus.PENDING_PAYMENT },
            data: { status: OrderStatus.CANCELLED },
          })
          if (locked.count === 0) return
          for (const it of order.items) {
            await tx.product.updateMany({ where: { id: it.productId }, data: { stock: { increment: it.qty } } })
          }
          await tx.orderStatusHistory.create({ data: { orderId: order.id, status: OrderStatus.CANCELLED } })
        })
        this.realtime.emitOrder(order.id, 'orderUpdate', { id: order.id, status: OrderStatus.CANCELLED })
        this.notifications.sendToUser(order.clientId, {
          title: 'Commande expirée',
          body: 'Votre commande non payée a été annulée — vous pouvez recommander quand vous voulez.',
          url: '/client/orders',
        })
      } catch (e) {
        this.logger.error(`Expiration de la commande ${order.id} impossible`, e as any)
      }
    }
    if (stale.length > 0) this.logger.log(`${stale.length} commande(s) non payée(s) expirée(s) (> ${ttlMin} min).`)
    return { expired: stale.length }
  }
}
