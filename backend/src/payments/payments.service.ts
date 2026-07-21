import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OrderStatus, PaymentStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments')

  constructor(private prisma: PrismaService, private config: ConfigService, private realtime: RealtimeGateway) {}

  private get sandbox() {
    return String(this.config.get('KKIAPAY_SANDBOX') ?? 'true') === 'true'
  }
  private get hasKeys() {
    return Boolean(this.config.get('KKIAPAY_PRIVATE_KEY'))
  }

  // Renvoie les infos nécessaires au widget KkiaPay côté client.
  async initiate(clientId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order || order.clientId !== clientId) throw new NotFoundException('Commande introuvable.')
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
    if (order.paymentStatus === PaymentStatus.PAID) return { ok: true, alreadyPaid: true }

    const verified = await this.verifyWithKkiapay(transactionId, order.total)
    if (!verified.success) throw new BadRequestException('Paiement non confirmé par KkiaPay.')

    await this.markPaid(orderId, transactionId)
    return { ok: true }
  }

  // Webhook KkiaPay (paiement confirmé côté serveur).
  async webhook(payload: any) {
    const transactionId = payload?.transactionId || payload?.id
    const orderId = payload?.data?.orderId || payload?.state?.orderId
    if (!orderId) {
      this.logger.warn('Webhook KkiaPay sans orderId')
      return { ok: false }
    }
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order || order.paymentStatus === PaymentStatus.PAID) return { ok: true }
    const verified = await this.verifyWithKkiapay(transactionId, order.total)
    if (verified.success) await this.markPaid(orderId, transactionId)
    return { ok: verified.success }
  }

  // Appel réel à l'API KkiaPay si les clés sont configurées ; sinon simulation (dev).
  private async verifyWithKkiapay(transactionId: string | undefined, expectedAmount: number): Promise<{ success: boolean }> {
    if (!this.hasKeys) {
      // Mode développement : on considère le paiement validé (pas de vraie charge).
      this.logger.warn('KkiaPay non configuré → paiement simulé (dev).')
      return { success: true }
    }
    if (!transactionId) return { success: false }
    try {
      const res = await fetch('https://api.kkiapay.me/api/v1/transactions/status', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.get('KKIAPAY_PUBLIC_KEY') || '',
          'x-private-key': this.config.get('KKIAPAY_PRIVATE_KEY') || '',
          'x-secret-key': this.config.get('KKIAPAY_SECRET') || '',
        },
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

  // Marque payée + crée l'enregistrement de paiement avec la répartition.
  private async markPaid(orderId: string, transactionId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
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
  }
}
