import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { DriverStatus, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { GeoService } from '../common/geo.service'
import { SettingsService } from '../common/settings.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { NotificationsService } from '../notifications/notifications.service'
import { MailService } from '../mail/mail.service'
import { haversine } from '../common/distance'

const AVG_SPEED_KMH = 22 // vitesse moyenne d'un zémidjan en ville
const MAX_CODE_ATTEMPTS = 5 // anti force brute sur le code de réception

@Injectable()
export class DeliveriesService {
  constructor(
    private prisma: PrismaService,
    private geo: GeoService,
    private settings: SettingsService,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  private startOfToday() {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }

  // Seuls les livreurs vérifiés par le super-admin peuvent voir/accepter des courses.
  private async assertVerified(driverId: string) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId: driverId } })
    if (!profile || profile.status !== DriverStatus.VERIFIED) {
      throw new ForbiddenException(
        "Votre compte livreur n'est pas encore vérifié. Complétez votre profil et attendez la validation de l'équipe BjDrive.",
      )
    }
    return profile
  }

  // Commandes en attente de prise en charge, proches du livreur.
  async available(driverId: string, lat: number, lng: number, radius = 30000) {
    await this.assertVerified(driverId)
    const near = await this.geo.awaitingOrdersNear(lat, lng, radius)
    const ids = near.map((n) => n.id)
    if (ids.length === 0) return []
    const orders = await this.prisma.order.findMany({
      where: { id: { in: ids }, status: OrderStatus.AWAITING_DRIVER },
      include: { items: true, stores: { include: { store: true } } },
    })
    const distById = new Map(near.map((n) => [n.id, Number(n.distance)]))
    return orders
      .map((o: any) => ({
        id: o.id,
        stores: o.stores.map((os: any) => ({
          id: os.store.id,
          name: os.store.name,
          address: os.store.address,
          lat: os.store.lat,
          lng: os.store.lng,
          readyAt: os.readyAt,
        })),
        destLat: o.destLat,
        destLng: o.destLng,
        destAddress: o.destAddress,
        itemCount: o.items.reduce((s: number, i: any) => s + i.qty, 0),
        storeCount: o.stores.length,
        earnings: o.deliveryFee,
        paymentMethod: o.paymentMethod, // CASH → le livreur collecte le total
        cashToCollect: o.paymentMethod === PaymentMethod.CASH ? o.total : 0,
        distanceToStore: Math.round(distById.get(o.id) ?? 0),
      }))
      .sort((a, b) => a.distanceToStore - b.distanceToStore)
  }

  async accept(driverId: string, orderId: string) {
    const cfg = await this.settings.get()
    const profile = await this.assertVerified(driverId)
    const maxPerDay = profile.maxPerDay ?? cfg.maxDeliveriesPerDay

    const todayCount = await this.prisma.delivery.count({ where: { driverId, acceptedAt: { gte: this.startOfToday() } } })
    if (todayCount >= maxPerDay) throw new ForbiddenException(`Plafond atteint : ${maxPerDay} livraisons maximum par jour.`)

    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Commande introuvable.')
    if (order.status !== OrderStatus.AWAITING_DRIVER) throw new BadRequestException('Cette commande a déjà été prise en charge.')

    const result = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.AWAITING_DRIVER },
        data: { status: OrderStatus.AWAITING_PICKUP },
      })
      if (upd.count === 0) throw new BadRequestException('Commande déjà prise par un autre livreur.')
      const delivery = await tx.delivery.create({ data: { orderId, driverId, earnings: order.deliveryFee } })
      await tx.orderStatusHistory.create({ data: { orderId, status: OrderStatus.AWAITING_PICKUP, byUserId: driverId } })
      return delivery
    })
    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, status: OrderStatus.AWAITING_PICKUP, driverId })
    this.notifications.sendToUser(order.clientId, {
      title: 'Livreur trouvé 🛵',
      body: 'Un livreur a pris en charge votre commande.',
      url: `/client/track/${orderId}`,
      tag: `order-${orderId}`,
    })
    return result
  }

  async mine(driverId: string) {
    const deliveries = await this.prisma.delivery.findMany({
      where: { driverId, acceptedAt: { gte: this.startOfToday() } },
      include: { order: { include: { items: true, stores: { include: { store: true } } } } },
      orderBy: { acceptedAt: 'desc' },
    })
    const cfg = await this.settings.get()
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId: driverId } })
    const maxPerDay = profile?.maxPerDay ?? cfg.maxDeliveriesPerDay
    const potentialEarnings = deliveries.reduce((s, d) => s + d.earnings, 0)
    const confirmedEarnings = deliveries.filter((d) => d.deliveredAt).reduce((s, d) => s + d.earnings, 0)
    // Note moyenne laissée par les clients.
    const ratingAgg = await this.prisma.review.aggregate({
      where: { targetType: 'DRIVER', targetId: driverId },
      _avg: { rating: true },
      _count: true,
    })
    // Le code de réception n'est jamais exposé au livreur.
    const safe = deliveries.map((d: any) => {
      if (d.order) {
        const { receptionCode, ...order } = d.order
        return { ...d, order }
      }
      return d
    })
    return {
      count: deliveries.length,
      maxPerDay,
      remaining: Math.max(0, maxPerDay - deliveries.length),
      potentialEarnings,
      confirmedEarnings,
      verificationStatus: profile?.status ?? DriverStatus.PENDING,
      rating: ratingAgg._avg.rating,
      ratingCount: ratingAgg._count,
      deliveries: safe,
    }
  }

  // Historique des gains (par jour) sur `days` jours — fidélisation des livreurs.
  async earningsHistory(driverId: string, days = 30) {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - Math.min(Math.max(days, 1), 90) + 1)
    const deliveries = await this.prisma.delivery.findMany({
      where: { driverId, deliveredAt: { gte: from } },
      select: { earnings: true, deliveredAt: true },
      orderBy: { deliveredAt: 'asc' },
    })
    const byDay = new Map<string, { date: string; count: number; earnings: number }>()
    for (const d of deliveries) {
      const key = d.deliveredAt!.toISOString().slice(0, 10)
      const row = byDay.get(key) || { date: key, count: 0, earnings: 0 }
      row.count += 1
      row.earnings += d.earnings
      byDay.set(key, row)
    }
    const daysList = [...byDay.values()]
    return {
      from: from.toISOString().slice(0, 10),
      totalEarnings: daysList.reduce((s, r) => s + r.earnings, 0),
      totalDeliveries: daysList.reduce((s, r) => s + r.count, 0),
      days: daysList,
    }
  }

  private async assertDriverDelivery(driverId: string, orderId: string) {
    const delivery = await this.prisma.delivery.findUnique({ where: { orderId }, include: { order: true } })
    if (!delivery) throw new NotFoundException('Livraison introuvable.')
    if (delivery.driverId !== driverId) throw new ForbiddenException('Cette livraison ne vous est pas assignée.')
    return delivery
  }

  // Retrait dans UNE enseigne. Quand toutes les enseignes sont récupérées → en cours de livraison.
  async pickupStore(driverId: string, orderId: string, storeId: string) {
    const delivery = await this.assertDriverDelivery(driverId, orderId)
    if (delivery.order.status !== OrderStatus.AWAITING_PICKUP) {
      throw new BadRequestException('Statut invalide pour la récupération.')
    }
    const os = await this.prisma.orderStore.findUnique({ where: { orderId_storeId: { orderId, storeId } } })
    if (!os) throw new NotFoundException('Enseigne non liée à cette commande.')
    if (!os.pickedUpAt) {
      await this.prisma.orderStore.update({ where: { id: os.id }, data: { pickedUpAt: new Date() } })
    }

    const remaining = await this.prisma.orderStore.count({ where: { orderId, pickedUpAt: null } })
    if (remaining === 0) {
      const order = delivery.order
      const origin = order.originLat != null ? { lat: order.originLat, lng: order.originLng! } : null
      const meters = origin ? haversine(origin, { lat: order.destLat, lng: order.destLng }) : 0
      const seconds = (meters / 1000 / AVG_SPEED_KMH) * 3600 * 1.25
      const scheduledDeliveryAt = new Date(Date.now() + seconds * 1000)
      await this.prisma.$transaction([
        this.prisma.delivery.update({ where: { orderId }, data: { pickedUpAt: new Date() } }),
        this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.IN_DELIVERY, scheduledDeliveryAt } }),
        this.prisma.orderStatusHistory.create({ data: { orderId, status: OrderStatus.IN_DELIVERY, byUserId: driverId } }),
      ])
      this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, status: OrderStatus.IN_DELIVERY, scheduledDeliveryAt })
      this.notifications.sendToUser(order.clientId, {
        title: 'Commande en route 🚀',
        body: 'Votre commande a été récupérée, le livreur arrive.',
        url: `/client/track/${orderId}`,
        tag: `order-${orderId}`,
      })
      return { ok: true, allPickedUp: true, scheduledDeliveryAt }
    }
    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, pickedUpStore: storeId, remainingPickups: remaining })
    return { ok: true, allPickedUp: false, remaining }
  }

  async complete(driverId: string, orderId: string, code: string) {
    const delivery = await this.assertDriverDelivery(driverId, orderId)
    const order = delivery.order
    if (order.status !== OrderStatus.IN_DELIVERY) throw new BadRequestException('La commande doit être en cours de livraison.')
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
      this.prisma.delivery.update({ where: { orderId }, data: { deliveredAt: new Date() } }),
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.DELIVERED,
          // Une commande cash est payée au moment de la remise (espèces au livreur).
          ...(order.paymentMethod === PaymentMethod.CASH ? { paymentStatus: PaymentStatus.PAID } : {}),
        },
      }),
      this.prisma.orderStatusHistory.create({ data: { orderId, status: OrderStatus.DELIVERED, byUserId: driverId } }),
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
            driverAmount: order.deliveryFee,
            platformAmount: order.commission,
          },
        }),
      )
    }
    await this.prisma.$transaction(ops)
    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, status: OrderStatus.DELIVERED })
    this.notifications.sendToUser(order.clientId, {
      title: 'Commande livrée ✅',
      body: 'Bon appétit ! Vous pouvez noter votre livreur et vos enseignes.',
      url: `/client/track/${orderId}`,
      tag: `order-${orderId}`,
    })
    // Commande cash : la facture part maintenant que le paiement est encaissé.
    if (order.paymentMethod === PaymentMethod.CASH) this.mail.sendInvoice(orderId)
    return { ok: true }
  }

  async updateLocation(driverId: string, lat: number, lng: number) {
    await this.prisma.driverProfile.upsert({
      where: { userId: driverId },
      update: { currentLat: lat, currentLng: lng, lastLocationAt: new Date() },
      create: { userId: driverId, currentLat: lat, currentLng: lng, lastLocationAt: new Date() },
    })
    const active = await this.prisma.delivery.findMany({
      where: { driverId, order: { status: { in: [OrderStatus.AWAITING_PICKUP, OrderStatus.IN_DELIVERY] } } },
      select: { orderId: true },
    })
    for (const d of active) {
      this.realtime.emitOrder(d.orderId, 'driverLocation', { orderId: d.orderId, lat, lng, at: Date.now() })
    }
    return { ok: true, notified: active.length }
  }

  setAvailability(driverId: string, isAvailable: boolean) {
    return this.prisma.driverProfile.upsert({
      where: { userId: driverId },
      update: { isAvailable },
      create: { userId: driverId, isAvailable },
    })
  }
}
