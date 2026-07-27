import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DriverStatus, OrderStatus, PaymentMethod, PaymentStatus, StoreStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../common/settings.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PaymentsService } from '../payments/payments.service'
import { CreatePayoutDto, MarkRefundedDto, UpdateConfigDto, VerifyDriverDto, VerifyStoreDto } from './dto'

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private notifications: NotificationsService,
    private payments: PaymentsService,
  ) {}

  // -------- Vérification des enseignes --------
  listStores(status?: StoreStatus) {
    return this.prisma.store.findMany({
      where: status ? { status } : {},
      include: { owner: { select: { id: true, name: true, email: true, phone: true } }, category: true, _count: { select: { products: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async verifyStore(adminId: string, storeId: string, dto: VerifyStoreDto) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new NotFoundException('Boutique introuvable.')
    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: {
        status: dto.approved ? StoreStatus.VERIFIED : StoreStatus.REJECTED,
        verificationMethod: dto.method,
        verificationNotes: dto.notes,
        verifiedById: adminId,
        verifiedAt: new Date(),
      },
    })
    this.notifications.sendToUser(store.ownerId, {
      title: dto.approved ? 'Enseigne vérifiée ✅' : 'Enseigne refusée',
      body: dto.approved
        ? `${store.name} est maintenant visible des clients.`
        : `${store.name} n'a pas été validée. ${dto.notes || ''}`.trim(),
      url: '/manager',
    })
    return updated
  }

  async suspendStore(storeId: string, suspended: boolean) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new NotFoundException('Boutique introuvable.')
    if (store.status === StoreStatus.BANNED) {
      throw new BadRequestException('Cette enseigne est bloquée définitivement.')
    }
    return this.prisma.store.update({
      where: { id: storeId },
      data: { status: suspended ? StoreStatus.SUSPENDED : StoreStatus.VERIFIED },
    })
  }

  // Blocage DÉFINITIF : l'enseigne disparaît des clients pour toujours
  // (aucune réactivation possible depuis l'interface). L'historique de
  // commandes et les reversements dus restent intacts.
  async banStore(storeId: string, reason?: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } })
    if (!store) throw new NotFoundException('Boutique introuvable.')
    const updated = await this.prisma.store.update({
      where: { id: storeId },
      data: {
        status: StoreStatus.BANNED,
        active: false,
        verificationNotes: reason ? `[BLOQUÉE] ${reason}` : store.verificationNotes,
      },
    })
    this.notifications.sendToUser(store.ownerId, {
      title: 'Enseigne bloquée ⛔',
      body: `${store.name} a été bloquée définitivement par BjDrive.${reason ? ' Motif : ' + reason : ''}`,
      url: '/manager',
    })
    return updated
  }

  // Suppression : uniquement si l'enseigne n'a AUCUN historique de commandes
  // (sinon on casserait la comptabilité — utilisez le blocage définitif).
  async deleteStore(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: { _count: { select: { orderStores: true } } },
    })
    if (!store) throw new NotFoundException('Boutique introuvable.')
    if (store._count.orderStores > 0) {
      throw new BadRequestException(
        `Impossible de supprimer : ${store._count.orderStores} commande(s) référencent cette enseigne. Bloquez-la définitivement à la place.`,
      )
    }
    await this.prisma.store.delete({ where: { id: storeId } }) // produits supprimés en cascade
    this.notifications.sendToUser(store.ownerId, {
      title: 'Enseigne supprimée',
      body: `${store.name} a été supprimée par l'équipe BjDrive.`,
      url: '/manager',
    })
    return { ok: true, deleted: store.name }
  }

  // -------- Vérification des livreurs --------
  listDrivers(status?: DriverStatus) {
    return this.prisma.driverProfile.findMany({
      where: status ? { status } : {},
      include: { user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async verifyDriver(adminId: string, userId: string, dto: VerifyDriverDto) {
    const profile = await this.prisma.driverProfile.findUnique({ where: { userId } })
    if (!profile) throw new NotFoundException('Profil livreur introuvable.')
    const updated = await this.prisma.driverProfile.update({
      where: { userId },
      data: {
        status: dto.approved ? DriverStatus.VERIFIED : DriverStatus.REJECTED,
        verificationNotes: dto.notes,
        verifiedById: adminId,
        verifiedAt: new Date(),
      },
    })
    this.notifications.sendToUser(userId, {
      title: dto.approved ? 'Compte livreur vérifié ✅' : 'Vérification refusée',
      body: dto.approved
        ? 'Vous pouvez maintenant accepter des livraisons. Bonne route !'
        : `Votre compte livreur n'a pas été validé. ${dto.notes || ''}`.trim(),
      url: '/driver',
    })
    return updated
  }

  suspendDriver(userId: string, suspended: boolean) {
    return this.prisma.driverProfile.update({
      where: { userId },
      data: { status: suspended ? DriverStatus.SUSPENDED : DriverStatus.VERIFIED },
    })
  }

  // Débloque le code de réception d'une commande (après trop de tentatives).
  async resetCodeAttempts(orderId: string) {
    await this.prisma.order.update({ where: { id: orderId }, data: { codeAttempts: 0 } })
    return { ok: true }
  }

  // Liste des commandes (supervision) : filtrable par statut.
  listOrders(status?: OrderStatus, take = 100) {
    return this.prisma.order.findMany({
      where: status ? { status } : {},
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        delivery: { include: { driver: { select: { id: true, name: true, phone: true } } } },
        stores: { include: { store: { select: { id: true, name: true, emoji: true } } } },
        payment: { select: { provider: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    })
  }

  // -------- Remboursements --------
  listRefunds() {
    return this.prisma.order.findMany({
      where: { paymentStatus: PaymentStatus.REFUND_PENDING },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true } },
        payment: true,
      },
      orderBy: { updatedAt: 'asc' },
    })
  }

  retryRefund(orderId: string) {
    return this.payments.retryRefund(orderId)
  }

  async markRefunded(orderId: string, dto: MarkRefundedDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Commande introuvable.')
    if (order.paymentStatus !== PaymentStatus.REFUND_PENDING) {
      throw new BadRequestException('Aucun remboursement en attente pour cette commande.')
    }
    return this.payments.markRefunded(orderId, dto.reference || 'manuel')
  }

  // -------- Versements (soldes dus aux enseignes et livreurs) --------
  //
  // Enseigne : + payoutAmount de chaque commande LIVRÉE et PAYÉE − versements reçus.
  // Livreur  : + frais de livraison des commandes livrées payées en ligne
  //            − espèces dues (total collecté − ses frais) sur les commandes cash
  //            − versements reçus (un versement négatif = dépôt d'espèces).
  // Un montant n'est « disponible » qu'après payoutDelayDays jours suivant la
  // livraison (fenêtre de litige) — le reste apparaît « en attente ».
  async balances() {
    const cfg = await this.settings.get()
    const holdCutoff = new Date(Date.now() - (cfg.payoutDelayDays || 0) * 24 * 3600 * 1000)
    const [storeParts, deliveries, payouts, accounts] = await Promise.all([
      this.prisma.orderStore.findMany({
        where: { order: { status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID } },
        select: {
          payoutAmount: true,
          order: { select: { updatedAt: true } },
          store: { select: { id: true, name: true, owner: { select: { id: true, name: true, email: true, phone: true } } } },
        },
      }),
      this.prisma.delivery.findMany({
        where: { deliveredAt: { not: null } },
        select: {
          earnings: true,
          deliveredAt: true,
          driver: { select: { id: true, name: true, email: true, phone: true } },
          order: { select: { paymentMethod: true, paymentStatus: true, total: true, deliveryFee: true } },
        },
      }),
      this.prisma.payout.groupBy({ by: ['userId'], _sum: { amount: true } }),
      this.prisma.paymentAccount.findMany({
        where: { isDefault: true },
        select: { userId: true, provider: true, accountRef: true, holderName: true },
      }),
    ])
    const paidByUser = new Map(payouts.map((p) => [p.userId, p._sum.amount || 0]))
    const accountByUser = new Map(accounts.map((a) => [a.userId, a]))

    const stores = new Map<string, any>()
    for (const part of storeParts) {
      const owner = part.store.owner
      const row = stores.get(owner.id) || { user: owner, storeNames: new Set<string>(), earned: 0, pending: 0 }
      row.earned += part.payoutAmount
      if (part.order.updatedAt > holdCutoff) row.pending += part.payoutAmount
      row.storeNames.add(part.store.name)
      stores.set(owner.id, row)
    }

    const drivers = new Map<string, any>()
    for (const d of deliveries) {
      const row = drivers.get(d.driver.id) || { user: d.driver, earningsOnline: 0, pending: 0, cashCollected: 0, cashOwed: 0 }
      if (d.order.paymentMethod === PaymentMethod.CASH) {
        row.cashCollected += d.order.total
        row.cashOwed += d.order.total - d.order.deliveryFee // il garde ses frais
      } else if (d.order.paymentStatus === PaymentStatus.PAID) {
        row.earningsOnline += d.earnings
        if (d.deliveredAt && d.deliveredAt > holdCutoff) row.pending += d.earnings
      }
      drivers.set(d.driver.id, row)
    }

    return {
      payoutDelayDays: cfg.payoutDelayDays,
      stores: [...stores.values()].map((r) => {
        const paidOut = paidByUser.get(r.user.id) || 0
        const balance = r.earned - paidOut
        return {
          ...r,
          storeNames: [...r.storeNames],
          paidOut,
          balance,
          // disponible = solde dû moins la part encore sous délai de litige
          available: Math.max(0, balance - r.pending),
          account: accountByUser.get(r.user.id) || null, // où verser (compte par défaut vérifié)
        }
      }),
      drivers: [...drivers.values()].map((r) => {
        const paidOut = paidByUser.get(r.user.id) || 0
        const balance = r.earningsOnline - r.cashOwed - paidOut
        return {
          ...r,
          paidOut,
          balance,
          available: Math.min(balance, Math.max(0, balance - r.pending)),
          account: accountByUser.get(r.user.id) || null,
        }
      }),
    }
  }

  async createPayout(adminId: string, dto: CreatePayoutDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } })
    if (!user) throw new NotFoundException('Bénéficiaire introuvable.')
    if (dto.amount === 0) throw new BadRequestException('Montant nul.')
    const payout = await this.prisma.payout.create({
      data: {
        userId: dto.userId,
        amount: dto.amount,
        provider: dto.provider,
        reference: dto.reference,
        note: dto.note,
        createdById: adminId,
      },
    })
    this.notifications.sendToUser(dto.userId, {
      title: dto.amount > 0 ? 'Versement effectué 💸' : 'Dépôt enregistré',
      body:
        dto.amount > 0
          ? `BjDrive vous a versé ${dto.amount} FCFA.`
          : `Votre dépôt de ${-dto.amount} FCFA a bien été enregistré.`,
      url: '/',
    })
    return payout
  }

  listPayouts(userId?: string) {
    return this.prisma.payout.findMany({
      where: userId ? { userId } : {},
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  }

  // -------- Configuration (tarifs, commission, plafond, cash) --------
  getConfig() {
    return this.settings.get()
  }
  updateConfig(dto: UpdateConfigDto) {
    return this.settings.update(dto)
  }

  // -------- Comptes --------
  listUsers(role?: string) {
    return this.prisma.user.findMany({
      where: role ? { role: role as any } : {},
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  setRole(userId: string, role: any) {
    return this.prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } })
  }

  async deleteUser(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } })
    return { ok: true }
  }

  // -------- Vue d'ensemble (KPIs + signaux d'action contextuels) --------
  async overview() {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const inProgress: OrderStatus[] = [OrderStatus.AWAITING_DRIVER, OrderStatus.AWAITING_PICKUP, OrderStatus.IN_DELIVERY]
    const stuckCutoff = new Date(Date.now() - 3 * 3600 * 1000)
    const [
      stores, pending, users, drivers, pendingDrivers, orders, delivered, payments, refundsPending,
      ordersInProgress, blockedCodes, todayOrders, todayPayments, stuckDeliveries,
    ] = await Promise.all([
      this.prisma.store.count({ where: { status: StoreStatus.VERIFIED } }),
      this.prisma.store.count({ where: { status: StoreStatus.PENDING } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'DRIVER' } }),
      this.prisma.driverProfile.count({ where: { status: DriverStatus.PENDING } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: OrderStatus.DELIVERED } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID },
        _sum: { amount: true, platformAmount: true, storeAmount: true, driverAmount: true },
      }),
      this.prisma.order.count({ where: { paymentStatus: PaymentStatus.REFUND_PENDING } }),
      this.prisma.order.count({ where: { status: { in: inProgress } } }),
      // Codes de réception bloqués après 5 essais → intervention admin
      this.prisma.order.count({ where: { codeAttempts: { gte: 5 }, status: { not: OrderStatus.DELIVERED } } }),
      this.prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID, updatedAt: { gte: startOfToday } },
        _sum: { amount: true, platformAmount: true },
      }),
      // Livraisons figées (récupérées il y a > 3 h, toujours pas livrées)
      this.prisma.delivery.count({
        where: { pickedUpAt: { lt: stuckCutoff }, deliveredAt: null, order: { status: OrderStatus.IN_DELIVERY } },
      }),
    ])
    return {
      verifiedStores: stores,
      pendingStores: pending,
      users,
      drivers,
      pendingDrivers,
      orders,
      deliveredOrders: delivered,
      refundsPending,
      ordersInProgress,
      blockedCodes,
      stuckDeliveries,
      todayOrders,
      todayVolume: todayPayments._sum.amount || 0,
      todayRevenue: todayPayments._sum.platformAmount || 0,
      grossVolume: payments._sum.amount || 0,
      platformRevenue: payments._sum.platformAmount || 0, // commission 10% encaissée
      storesPayout: payments._sum.storeAmount || 0,
      driversPayout: payments._sum.driverAmount || 0,
    }
  }
}
