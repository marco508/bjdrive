import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { NotificationsService } from '../notifications/notifications.service'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments')

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
  ) {}

  private get sandbox() {
    return String(this.config.get('KKIAPAY_SANDBOX') ?? 'true') === 'true'
  }
  private get hasKeys() {
    return Boolean(this.config.get('KKIAPAY_PRIVATE_KEY'))
  }
  private get isProduction() {
    return this.config.get('NODE_ENV') === 'production'
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

    const verified = await this.verifyWithKkiapay(transactionId, order.total)
    if (!verified.success) throw new BadRequestException('Paiement non confirmé par KkiaPay.')

    await this.markPaid(orderId, transactionId)
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
    const verified = await this.verifyWithKkiapay(transactionId, order.total)
    if (verified.success) await this.markPaid(orderId, transactionId)
    return { ok: verified.success }
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
  private async markPaid(orderId: string, transactionId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { stores: { include: { store: { select: { ownerId: true, name: true } } } } },
    })
    if (!order) return
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.PAID, status: OrderStatus.AWAITING_DRIVER },
      }),
      this.prisma.orderStatusHistory.create({ data: { orderId, status: OrderStatus.AWAITING_DRIVER } }),
      this.prisma.payment.upsert({
        where: { orderId },
        update: { status: PaymentStatus.PAID, providerRef: transactionId },
        create: {
          orderId,
          provider: 'KKIAPAY',
          providerRef: transactionId,
          amount: order.total,
          status: PaymentStatus.PAID,
          storeAmount: order.subtotal, // → enseigne
          driverAmount: order.deliveryFee, // → livreur
          platformAmount: order.commission, // → plateforme (10%)
        },
      }),
    ])
    this.realtime.emitOrder(orderId, 'orderUpdate', { id: orderId, status: OrderStatus.AWAITING_DRIVER, paid: true })
    this.realtime.emitDrivers('newOrderAvailable', { orderId })
    // Push : client, managers des enseignes concernées, livreurs proches du départ.
    this.notifications.sendToUser(order.clientId, {
      title: 'Paiement confirmé ✅',
      body: 'Votre commande est payée, recherche d’un livreur en cours…',
      url: `/client/track/${orderId}`,
      tag: `order-${orderId}`,
    })
    this.notifications.sendToUsers(
      order.stores.map((os) => os.store.ownerId),
      { title: 'Nouvelle commande 🛒', body: 'Une commande payée attend sa préparation.', url: '/manager/orders' },
    )
    if (order.originLat != null && order.originLng != null) {
      this.notifications.notifyNearbyDrivers(
        { lat: order.originLat, lng: order.originLng },
        { title: 'Course disponible 🛵', body: `Livraison à ${order.deliveryFee} FCFA près de vous.`, url: '/driver' },
      )
    }
  }

  // ---- Remboursements (commande payée puis annulée) ----

  // Tente le remboursement automatique via KkiaPay ; sinon laisse en file
  // REFUND_PENDING pour traitement manuel par le super-admin.
  async requestRefund(orderId: string): Promise<{ refunded: boolean }> {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } })
    if (!payment || payment.status !== PaymentStatus.PAID) return { refunded: false }

    await this.prisma.$transaction([
      this.prisma.payment.update({ where: { orderId }, data: { status: PaymentStatus.REFUND_PENDING } }),
      this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: PaymentStatus.REFUND_PENDING } }),
    ])

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
      return data?.status ? String(data.status).toUpperCase() !== 'FAILED' : true
    } catch (e) {
      this.logger.error('Erreur remboursement KkiaPay', e as any)
      return false
    }
  }
}
