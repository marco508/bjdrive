import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Fulfillment, OrderStatus, PaymentMethod, PaymentStatus, Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { NotificationsService } from '../notifications/notifications.service'
import { MailService } from '../mail/mail.service'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments')

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
    private mail: MailService,
  ) {}

  private get sandbox() {
    return String(this.config.get('KKIAPAY_SANDBOX') ?? 'true') === 'true'
  }
  private get hasKeys() {
    return Boolean(this.config.get('KKIAPAY_PRIVATE_KEY'))
  }
  private get isProduction() {
    // Par prudence, tout environnement qui ne se déclare PAS explicitement en
    // développement est traité comme la production (NODE_ENV absent inclus).
    const env = this.config.get('NODE_ENV')
    return env !== 'development' && env !== 'test'
  }
  private kkiapayHeaders() {
    return {
      'content-type': 'application/json',
      'x-api-key': (this.config.get('KKIAPAY_PUBLIC_KEY') as string) || '',
      'x-private-key': (this.config.get('KKIAPAY_PRIVATE_KEY') as string) || '',
      'x-secret-key': (this.config.get('KKIAPAY_SECRET') as string) || '',
    }
  }

  // Renvoie les infos nécessaires au widget KkiaPay côté client.
  async initiate(clientId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order || order.clientId !== clientId) throw new NotFoundException('Commande introuvable.')
    if (order.paymentMethod === PaymentMethod.CASH) {
      throw new BadRequestException('Commande en paiement à la livraison : rien à payer en ligne.')
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) throw new BadRequestException('Commande déjà payée ou annulée.')
    return {
      orderId: order.id,
      amount: order.total, // FCFA — inclut produits + livraison + commission 10%
      currency: 'XOF',
      publicKey: this.config.get('KKIAPAY_PUBLIC_KEY') || '',
      sandbox: this.sandbox,
      // répartition (à titre indicatif pour le client)
      breakdown: { subtotal: order.subtotal, deliveryFee: order.deliveryFee, commission: order.commission },
    }
  }

  // Vérifie la transaction KkiaPay puis marque la commande payée.
  async confirm(clientId: string, orderId: string, transactionId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order || order.clientId !== clientId) throw new NotFoundException('Commande introuvable.')
    if (order.paymentMethod === PaymentMethod.CASH) {
      throw new BadRequestException('Commande en paiement à la livraison : rien à confirmer.')
    }
    if (order.paymentStatus === PaymentStatus.PAID) return { ok: true, alreadyPaid: true }
    await this.assertTransactionUnused(orderId, transactionId)

    // Une commande annulée/expirée ne peut pas être « ressuscitée » par un
    // paiement tardif : si l'argent a réellement été débité, on le rembourse.
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      await this.handleLatePayment(order, transactionId)
      throw new BadRequestException(
        'Cette commande a été annulée ou a expiré. Si vous avez été débité, le remboursement est en cours.',
      )
    }

    const verified = await this.verifyWithKkiapay(transactionId, order.total)
    if (!verified.success) throw new BadRequestException('Paiement non confirmé par KkiaPay.')

    const applied = await this.markPaid(orderId, transactionId)
    if (!applied) {
      // La commande a changé d'état entre-temps (annulée pendant le paiement) :
      // l'argent encaissé est remboursé, jamais perdu.
      const fresh = await this.prisma.order.findUnique({ where: { id: orderId } })
      if (fresh && fresh.paymentStatus !== PaymentStatus.PAID) {
        await this.handleLatePayment(fresh, transactionId)
        throw new BadRequestException('Cette commande a été annulée pendant le paiement — remboursement en cours.')
      }
    }
    return { ok: true }
  }

  // Webhook KkiaPay (paiement confirmé côté serveur).
  // Si KKIAPAY_WEBHOOK_SECRET est défini, le webhook doit présenter ce secret
  // (header x-webhook-secret ou ?token=). La transaction est de toute façon
  // re-vérifiée auprès de KkiaPay avant d'être prise en compte.
  async webhook(payload: any, providedSecret?: string) {
    const expected = this.config.get<string>('KKIAPAY_WEBHOOK_SECRET')
    if (expected && providedSecret !== expected) {
      this.logger.warn('Webhook KkiaPay refusé : secret invalide.')
      throw new ForbiddenException('Webhook non autorisé.')
    }
    const transactionId = payload?.transactionId || payload?.id
    const orderId = payload?.data?.orderId || payload?.state?.orderId
    if (!orderId) {
      this.logger.warn('Webhook KkiaPay sans orderId')
      return { ok: false }
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order || order.paymentStatus === PaymentStatus.PAID) return { ok: true }
    if (order.paymentMethod === PaymentMethod.CASH) return { ok: true }
    await this.assertTransactionUnused(orderId, transactionId)
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      // Paiement arrivé après annulation/expiration → remboursement, pas de résurrection.
      await this.handleLatePayment(order, transactionId)
      return { ok: true, late: true }
    }
    const verified = await this.verifyWithKkiapay(transactionId, order.total)
    if (verified.success) await this.markPaid(orderId, transactionId)
    return { ok: verified.success }
  }

  // Une même transaction KkiaPay ne peut servir qu'à UNE commande (rejeu interdit).
  private async assertTransactionUnused(orderId: string, transactionId?: string) {
    if (!transactionId) return
    const existing = await this.prisma.payment.findUnique({ where: { providerRef: transactionId }, select: { orderId: true } })
    if (existing && existing.orderId !== orderId) {
      this.logger.warn(`Transaction ${transactionId} déjà consommée par ${existing.orderId} — tentative de réutilisation refusée.`)
      throw new BadRequestException('Cette transaction a déjà servi à payer une autre commande.')
    }
  }

  // Paiement réel encaissé sur une commande qui n'attend plus de paiement :
  // on vérifie auprès de KkiaPay puis on rembourse (auto si possible, sinon
  // file admin). La commande garde son statut (CANCELLED/FAILED...).
  private async handleLatePayment(order: { id: string; total: number; subtotal: number; deliveryFee: number; commission: number; clientId: string }, transactionId?: string) {
    if (!transactionId) return
    const verified = await this.verifyWithKkiapay(transactionId, order.total)
    if (!verified.success) return
    await this.prisma.$transaction([
      this.prisma.payment.upsert({
        where: { orderId: order.id },
        update: { status: PaymentStatus.REFUND_PENDING, providerRef: transactionId },
        create: {
          orderId: order.id,
          provider: 'KKIAPAY',
          providerRef: transactionId,
          amount: order.total,
          status: PaymentStatus.REFUND_PENDING,
          storeAmount: order.subtotal,
          driverAmount: order.deliveryFee,
          platformAmount: order.commission,
        },
      }),
      this.prisma.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.REFUND_PENDING } }),
    ])
    const done = await this.tryKkiapayRefund(transactionId)
    if (done) {
      await this.markRefunded(order.id, `kkiapay:${transactionId}`)
    } else {
      this.logger.warn(`Paiement tardif sur commande ${order.id} → remboursement en file admin.`)
      const admins = await this.prisma.user.findMany({ where: { role: Role.SUPERADMIN }, select: { id: true } })
      this.notifications.sendToUsers(admins.map((a) => a.id), {
        title: 'Remboursement à traiter',
        body: 'Un paiement a été encaissé sur une commande annulée — remboursement manuel requis.',
        url: '/admin/orders',
      })
    }
  }

  // Appel réel à l'API KkiaPay si les clés sont configurées.
  // La simulation (dev sans clés) est INTERDITE en production : jamais de
  // commande marquée payée sans vérification réelle.
  private async verifyWithKkiapay(transactionId: string | undefined, expectedAmount: number): Promise<{ success: boolean }> {
    if (!this.hasKeys) {
      if (this.isProduction) {
        this.logger.error('KkiaPay non configuré en production → paiement refusé.')
        return { success: false }
      }
      this.logger.warn('KkiaPay non configuré → paiement simulé (dev).')
      return { success: true }
    }
    if (!transactionId) return { success: false }
    try {
      const res = await fetch('https://api.kkiapay.me/api/v1/transactions/status', {
        method: 'POST',
        headers: this.kkiapayHeaders(),
        body: JSON.stringify({ transactionId }),
      })
      const data: any = await res.json()
      const ok = data?.status === 'SUCCESS' && Number(data?.amount) >= expectedAmount
      return { success: ok }
    } catch (e) {
      this.logger.error('Erreur vérification KkiaPay', e as any)
      return { success: false }
    }
  }

  // Marque payée + crée l'enregistrement de paiement avec la répartition,
  // puis prévient le client, les enseignes concernées et les livreurs proches.
  private async markPaid(orderId: string, transactionId?: string): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { stores: { include: { store: { select: { ownerId: true, name: true } } } } },
    })
    if (!order) return false
    // Retrait sur place : pas de livreur, la commande passe en préparation.
    const nextStatus = order.fulfillment === Fulfillment.PICKUP ? OrderStatus.AWAITING_PICKUP : OrderStatus.AWAITING_DRIVER
    let applied = false
    try {
      applied = await this.prisma.$transaction(async (tx) => {
        // Verrou : seul le PREMIER passage bascule la commande (deux confirmations
        // simultanées ne créent qu'un historique, une facture, une vague de push).
        const upd = await tx.order.updateMany({
          where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
          data: { paymentStatus: PaymentStatus.PAID, status: nextStatus },
        })
        if (upd.count === 0) return false
        await tx.orderStatusHistory.create({ data: { orderId, status: nextStatus } })
        await tx.payment.upsert({
          where: { orderId },
          update: { status: PaymentStatus.PAID, providerRef: transactionId },
          create: {
            orderId,
            provider: 'KKIAPAY',
            providerRef: transactionId,
            amount: order.total,
            status: PaymentStatus.PAID,
            storeAmount: order.subtotal, // → enseigne
            driverAmount: order.deliveryFee, // → livreur (0 pour un retrait)
            platformAmount: order.commission, // → plateforme (10%)
          },
        })
        return true
      })
    } catch (e: any) {
      // Contrainte unique sur providerRef : la transaction a été consommée entre-temps.
      if (e?.code === 'P2002') throw new BadRequestException('Cette transaction a déjà servi à payer une autre commande.')
      throw e
    }
    if (!applied) return false
    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, status: nextStatus, paid: true })
    // Push : client + toute l'équipe (gérant + employés) des enseignes concernées.
    this.notifications.sendToUser(order.clientId, {
      title: 'Paiement confirmé ✅',
      body:
        order.fulfillment === Fulfillment.PICKUP
          ? 'Votre commande est payée — vous serez prévenu quand elle sera prête à retirer.'
          : 'Votre commande est payée, recherche d’un livreur en cours…',
      url: `/client/track/${orderId}`,
      tag: `order-${orderId}`,
    })
    const storeIds = order.stores.map((os: any) => os.storeId)
    const staff = await this.prisma.user.findMany({
      where: { staffStoreId: { in: storeIds }, role: Role.STAFF },
      select: { id: true },
    })
    this.notifications.sendToUsers(
      [...order.stores.map((os) => os.store.ownerId), ...staff.map((s) => s.id)],
      { title: 'Nouvelle commande 🛒', body: 'Une commande payée attend sa préparation.', url: '/manager/orders' },
    )
    if (order.fulfillment === Fulfillment.DELIVERY) {
      this.realtime.emitDrivers('newOrderAvailable', { orderId })
      if (order.originLat != null && order.originLng != null) {
        this.notifications.notifyNearbyDrivers(
          { lat: order.originLat, lng: order.originLng },
          { title: 'Course disponible 🛵', body: `Livraison à ${order.deliveryFee} FCFA près de vous.`, url: '/driver' },
        )
      }
    }
    // Facture nominative envoyée par e-mail au client.
    this.mail.sendInvoice(orderId)
    return true
  }

  // ---- Remboursements (commande payée puis annulée) ----

  // Tente le remboursement automatique via KkiaPay ; sinon laisse en file
  // REFUND_PENDING pour traitement manuel par le super-admin.
  async requestRefund(orderId: string): Promise<{ refunded: boolean }> {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } })
    if (!payment || payment.status !== PaymentStatus.PAID) return { refunded: false }

    // Verrou : un seul appel bascule PAID → REFUND_PENDING ; les suivants
    // s'arrêtent là (jamais deux « revert » KkiaPay pour la même commande).
    const locked = await this.prisma.payment.updateMany({
      where: { orderId, status: PaymentStatus.PAID },
      data: { status: PaymentStatus.REFUND_PENDING },
    })
    if (locked.count === 0) return { refunded: false }
    await this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.REFUND_PENDING } })

    const done = await this.tryKkiapayRefund(payment.providerRef)
    if (done) {
      await this.markRefunded(orderId, `kkiapay:${payment.providerRef}`)
      return { refunded: true }
    }
    this.logger.warn(`Remboursement automatique impossible pour ${orderId} → file admin.`)
    return { refunded: false }
  }

  // Marque remboursé (après remboursement KkiaPay réussi ou versement manuel).
  async markRefunded(orderId: string, reference?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } })
    if (!order?.payment) throw new NotFoundException('Paiement introuvable.')
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { orderId },
        data: { status: PaymentStatus.REFUNDED, refundRef: reference, refundedAt: new Date() },
      }),
      this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.REFUNDED } }),
    ])
    this.notifications.sendToUser(order.clientId, {
      title: 'Remboursement effectué 💸',
      body: `Votre commande annulée a été remboursée (${order.total} FCFA).`,
      url: '/client/orders',
    })
    return { ok: true }
  }

  // Nouvelle tentative de remboursement automatique (depuis la file admin).
  async retryRefund(orderId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } })
    if (!payment || payment.status !== PaymentStatus.REFUND_PENDING) {
      throw new BadRequestException('Aucun remboursement en attente pour cette commande.')
    }
    const done = await this.tryKkiapayRefund(payment.providerRef)
    if (done) return this.markRefunded(orderId, `kkiapay:${payment.providerRef}`)
    throw new BadRequestException('KkiaPay a refusé le remboursement automatique — traitez-le manuellement.')
  }

  private async tryKkiapayRefund(transactionId?: string | null): Promise<boolean> {
    if (!this.hasKeys) {
      if (this.isProduction) return false
      this.logger.warn('KkiaPay non configuré → remboursement simulé (dev).')
      return true
    }
    if (!transactionId) return false
    try {
      const res = await fetch('https://api.kkiapay.me/api/v1/transactions/revert', {
        method: 'POST',
        headers: this.kkiapayHeaders(),
        body: JSON.stringify({ transactionId }),
      })
      if (!res.ok) return false
      const data: any = await res.json().catch(() => null)
      // Prudence : sans confirmation EXPLICITE de KkiaPay, on ne marque jamais
      // « remboursé » — le dossier part en file admin plutôt que de perdre l'argent du client.
      const status = String(data?.status || '').toUpperCase()
      return ['SUCCESS', 'REVERTED', 'OK', 'PERFORMED'].includes(status)
    } catch (e) {
      this.logger.error('Erreur remboursement KkiaPay', e as any)
      return false
    }
  }
}
