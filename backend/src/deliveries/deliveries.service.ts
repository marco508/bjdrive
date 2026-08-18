import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { DriverStatus, OrderStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { GeoService } from '../common/geo.service'
import { SettingsService } from '../common/settings.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { NotificationsService } from '../notifications/notifications.service'
import { MailService } from '../mail/mail.service'
import { haversine } from '../common/distance'
import { MAX_CODE_ATTEMPTS } from '../common/constants'

const AVG_SPEED_KMH = 22 // vitesse moyenne d'un zémidjan en ville
const STUCK_AFTER_HOURS = 3 // livraison sans issue depuis N heures → alerte + suspension
const TRACK_MIN_INTERVAL_MS = 30_000 // un point GPS persisté toutes les 30 s max

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger('Deliveries')
  private lastTrackAt = new Map<string, number>() // orderId → dernier point persisté
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

  // Un livreur est « confirmé » après N livraisons réussies (config) :
  // avant cela, pas de commandes cash et valeur de commande plafonnée —
  // limite l'exposition financière face à un livreur inconnu.
  private async driverTrust(driverId: string) {
    const cfg = await this.settings.get()
    const delivered = await this.prisma.delivery.count({ where: { driverId, deliveredAt: { not: null } } })
    return {
      trusted: delivered >= cfg.trustedDriverDeliveries,
      delivered,
      threshold: cfg.trustedDriverDeliveries,
      maxOrderTotal: cfg.newDriverMaxOrderTotal,
    }
  }

  // Commandes en attente de prise en charge, proches du livreur.
  async available(driverId: string, lat: number, lng: number, radius = 30000) {
    await this.assertVerified(driverId)
    const trust = await this.driverTrust(driverId)
    const near = await this.geo.awaitingOrdersNear(lat, lng, radius)
    const ids = near.map((n) => n.id)
    if (ids.length === 0) return []
    const orders = await this.prisma.order.findMany({
      where: {
        id: { in: ids },
        status: OrderStatus.AWAITING_DRIVER,
        // Nouveau livreur : uniquement du prépayé, sous le plafond de valeur.
        ...(trust.trusted ? {} : { paymentMethod: PaymentMethod.KKIAPAY, total: { lte: trust.maxOrderTotal } }),
      },
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
        // Commande « pour un proche » : le livreur appelle CE contact, pas le client.
        recipientName: o.recipientName,
        recipientPhone: o.recipientPhone,
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

    // Garde-fous « nouveau livreur » (re-vérifiés à l'acceptation, pas seulement à l'affichage).
    const trust = await this.driverTrust(driverId)
    if (!trust.trusted) {
      if (order.paymentMethod === PaymentMethod.CASH) {
        throw new ForbiddenException(
          `Les commandes en espèces sont réservées aux livreurs confirmés (${trust.delivered}/${trust.threshold} livraisons réussies).`,
        )
      }
      if (order.total > trust.maxOrderTotal) {
        throw new ForbiddenException(
          `Commande au-dessus de votre plafond actuel (${trust.maxOrderTotal} FCFA). Il saute après ${trust.threshold} livraisons réussies.`,
        )
      }
    }

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
    // Note moyenne laissée par les clients + niveau de confiance.
    const ratingAgg = await this.prisma.review.aggregate({
      where: { targetType: 'DRIVER', targetId: driverId },
      _avg: { rating: true },
      _count: true,
    })
    const trust = await this.driverTrust(driverId)
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
      trust, // { trusted, delivered, threshold, maxOrderTotal }
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

  // ---- Livraison échouée (client absent, refus de payer, adresse introuvable) ----
  // Le livreur le SIGNALE au lieu de rester bloqué (et d'être suspendu à tort par
  // le filet anti-vol) : la commande passe en RETOUR, il ramène les produits aux
  // enseignes qui confirment chacune la restitution (stock rendu, remboursement
  // si prépayée). La livraison n'est pas comptée comme réussie pour sa confiance.
  async reportFailure(driverId: string, orderId: string, reason?: string) {
    const delivery = await this.assertDriverDelivery(driverId, orderId)
    const order = delivery.order
    if (order.status !== OrderStatus.IN_DELIVERY) {
      throw new BadRequestException("Vous ne pouvez signaler un échec qu'en cours de livraison.")
    }
    const cleanReason = (reason || '').slice(0, 300) || 'Non précisé'
    const applied = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.IN_DELIVERY },
        data: { status: OrderStatus.RETURNING },
      })
      if (locked.count === 0) return false
      await tx.delivery.update({ where: { orderId }, data: { failedAt: new Date(), failReason: cleanReason } })
      await tx.orderStatusHistory.create({ data: { orderId, status: OrderStatus.RETURNING, byUserId: driverId } })
      return true
    })
    if (!applied) throw new BadRequestException('Cette commande a déjà changé d’état.')

    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, status: OrderStatus.RETURNING })
    // Enseigne(s) : préparez-vous à récupérer les produits.
    const stores = await this.prisma.orderStore.findMany({
      where: { orderId },
      select: { storeId: true, store: { select: { ownerId: true } } },
    })
    const staff = await this.prisma.user.findMany({
      where: { staffStoreId: { in: stores.map((s) => s.storeId) }, role: Role.STAFF },
      select: { id: true },
    })
    this.notifications.sendToUsers([...stores.map((s) => s.store.ownerId), ...staff.map((s) => s.id)], {
      title: 'Retour de commande 📦',
      body: `Livraison impossible (${cleanReason}) — le livreur vous ramène les produits. Confirmez le retour à réception.`,
      url: '/manager/orders',
    })
    this.notifications.sendToUser(order.clientId, {
      title: 'Livraison impossible',
      body: 'Le livreur n’a pas pu vous remettre la commande — elle retourne à l’enseigne. Contactez-nous si besoin.',
      url: `/client/track/${orderId}`,
      tag: `order-${orderId}`,
    })
    const admins = await this.prisma.user.findMany({ where: { role: Role.SUPERADMIN }, select: { id: true } })
    this.notifications.sendToUsers(admins.map((a) => a.id), {
      title: 'Livraison échouée',
      body: `Commande ${orderId.slice(-6).toUpperCase()} : ${cleanReason}. Retour enseigne en cours.`,
      url: '/admin/orders',
    })
    return { ok: true, status: OrderStatus.RETURNING }
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
    const now = Date.now()
    for (const d of active) {
      this.realtime.emitOrder(d.orderId, 'driverLocation', { orderId: d.orderId, lat, lng, at: now })
      // Trace GPS persistée (preuve en cas de litige) — 1 point / 30 s max par commande.
      if ((this.lastTrackAt.get(d.orderId) || 0) + TRACK_MIN_INTERVAL_MS <= now) {
        this.lastTrackAt.set(d.orderId, now)
        this.prisma.deliveryTrack.create({ data: { orderId: d.orderId, lat, lng } }).catch(() => {})
      }
    }
    return { ok: true, notified: active.length }
  }

  // ---- Filet de sécurité : livraisons figées ----
  // Une commande EN LIVRAISON sans issue depuis 3 h = signal de vol ou d'accident :
  // le livreur est suspendu automatiquement (plus aucune nouvelle course), le
  // client et le super-admin sont alertés — l'admin tranche ensuite (Livreurs).
  @Cron(CronExpression.EVERY_10_MINUTES)
  async watchStuckDeliveries() {
    const cutoff = new Date(Date.now() - STUCK_AFTER_HOURS * 3600 * 1000)
    // Purge des traces GPS de plus de 30 jours — TOUJOURS exécutée (la rétention
    // annoncée ne dépend pas de l'existence de livraisons figées).
    await this.prisma.deliveryTrack.deleteMany({ where: { at: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) } } }).catch(() => {})
    // Nettoyage du throttle GPS en mémoire (évite une fuite lente).
    const staleTrack = Date.now() - 24 * 3600 * 1000
    for (const [orderId, ts] of this.lastTrackAt) if (ts < staleTrack) this.lastTrackAt.delete(orderId)

    // Cas 1 : course ACCEPTÉE mais jamais récupérée (livreur disparu SANS
    // marchandise) → on libère la commande pour les autres livreurs, pas de
    // suspension (il n'a rien entre les mains).
    const neverPicked = await this.prisma.delivery.findMany({
      where: {
        stuckNotifiedAt: null,
        failedAt: null,
        pickedUpAt: null,
        deliveredAt: null,
        acceptedAt: { lt: cutoff },
        order: { status: OrderStatus.AWAITING_PICKUP },
      },
      include: { order: { select: { id: true, clientId: true } }, driver: { select: { id: true, name: true } } },
    })
    for (const d of neverPicked) {
      // Si une enseigne a déjà remis/fait récupérer des produits, on traite
      // comme une livraison figée (marchandise en main) — pas une libération.
      const handled = await this.prisma.orderStore.count({
        where: { orderId: d.orderId, OR: [{ pickedUpAt: { not: null } }, { handedOverAt: { not: null } }] },
      })
      if (handled > 0) continue // le filtre « figée » ci-dessous le couvrira via pickedUpAt du Delivery ou l'admin
      await this.prisma.$transaction(async (tx) => {
        const del = await tx.delivery.deleteMany({ where: { orderId: d.orderId, pickedUpAt: null } })
        if (del.count === 0) return
        await tx.order.updateMany({
          where: { id: d.orderId, status: OrderStatus.AWAITING_PICKUP },
          data: { status: OrderStatus.AWAITING_DRIVER },
        })
        await tx.orderStatusHistory.create({ data: { orderId: d.orderId, status: OrderStatus.AWAITING_DRIVER } })
      })
      this.logger.warn(`Course ${d.orderId} jamais récupérée par ${d.driver.name} → commande libérée pour les autres livreurs.`)
      this.realtime.emitOrder(d.orderId, 'orderUpdate', { id: d.orderId, status: OrderStatus.AWAITING_DRIVER })
      this.realtime.emitDrivers('newOrderAvailable', { orderId: d.orderId })
      this.notifications.sendToUser(d.driverId, {
        title: 'Course retirée',
        body: `Vous n'avez pas récupéré la commande acceptée il y a plus de ${STUCK_AFTER_HOURS} h — elle a été proposée à d'autres livreurs.`,
        url: '/driver',
      })
      this.notifications.sendToUser(d.order.clientId, {
        title: 'Nouveau livreur recherché',
        body: 'Votre commande a été re-proposée aux livreurs disponibles.',
        url: `/client/track/${d.orderId}`,
      })
    }

    // Cas 2 : marchandise RÉCUPÉRÉE et livraison sans issue (hors échec signalé)
    // → suspicion de vol/accident : suspension + alerte admin.
    const stuck = await this.prisma.delivery.findMany({
      where: {
        stuckNotifiedAt: null,
        failedAt: null, // un échec signalé suit le parcours RETOUR, pas la suspension
        pickedUpAt: { lt: cutoff },
        deliveredAt: null,
        order: { status: OrderStatus.IN_DELIVERY },
      },
      include: { order: { select: { id: true, clientId: true, total: true } }, driver: { select: { id: true, name: true } } },
    })
    if (stuck.length === 0) return
    const admins = await this.prisma.user.findMany({ where: { role: Role.SUPERADMIN }, select: { id: true } })
    for (const d of stuck) {
      await this.prisma.$transaction([
        this.prisma.delivery.update({ where: { orderId: d.orderId }, data: { stuckNotifiedAt: new Date() } }),
        this.prisma.driverProfile.updateMany({
          where: { userId: d.driverId, status: DriverStatus.VERIFIED },
          data: { status: DriverStatus.SUSPENDED, verificationNotes: `[AUTO] Livraison ${d.orderId.slice(-6)} figée > ${STUCK_AFTER_HOURS} h` },
        }),
      ])
      this.logger.warn(`Livraison figée ${d.orderId} (livreur ${d.driver.name}) → livreur suspendu, admin alerté.`)
      this.notifications.sendToUsers(admins.map((a) => a.id), {
        title: '🚨 Livraison figée',
        body: `${d.driver.name} n'a pas terminé la commande ${d.orderId.slice(-6).toUpperCase()} (${d.order.total} FCFA) depuis ${STUCK_AFTER_HOURS} h. Livreur suspendu automatiquement.`,
        url: '/admin/orders',
      })
      this.notifications.sendToUser(d.driverId, {
        title: '⚠️ Livraison non terminée',
        body: 'Votre livraison en cours est bloquée depuis trop longtemps. Contactez le support BjDrive au plus vite.',
        url: '/driver',
      })
      this.notifications.sendToUser(d.order.clientId, {
        title: 'Nous suivons votre commande 🙏',
        body: 'Votre livraison prend plus de temps que prévu — notre équipe a été alertée et vous recontacte.',
        url: `/client/track/${d.orderId}`,
      })
    }
  }

  setAvailability(driverId: string, isAvailable: boolean) {
    return this.prisma.driverProfile.upsert({
      where: { userId: driverId },
      update: { isAvailable },
      create: { userId: driverId, isAvailable },
    })
  }
}
