import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DriverStatus, Fulfillment, OrderStatus, PaymentMethod, PaymentStatus, Role, StoreStatus } from '@prisma/client'
import { MAX_CODE_ATTEMPTS } from '../common/constants'
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

  async suspendDriver(userId: string, suspended: boolean) {
    const upd = await this.prisma.driverProfile.updateMany({
      where: { userId },
      data: { status: suspended ? DriverStatus.SUSPENDED : DriverStatus.VERIFIED },
    })
    if (upd.count === 0) throw new NotFoundException('Profil livreur introuvable.')
    return { ok: true, suspended }
  }

  // Débloque le code de réception d'une commande (après trop de tentatives).
  async resetCodeAttempts(orderId: string) {
    const upd = await this.prisma.order.updateMany({ where: { id: orderId }, data: { codeAttempts: 0 } })
    if (upd.count === 0) throw new NotFoundException('Commande introuvable.')
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
          pickedUpAt: true, // horodatage de la remise (retrait sur place)
          order: {
            select: {
              updatedAt: true,
              paymentMethod: true,
              fulfillment: true,
              commission: true,
              delivery: { select: { deliveredAt: true } },
            },
          },
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
      // Ventilé par casquette : un gérant qui est AUSSI livreur ne doit pas voir
      // un même versement soustrait de ses deux soldes.
      this.prisma.payout.groupBy({ by: ['userId', 'role'], _sum: { amount: true } }),
      this.prisma.paymentAccount.findMany({
        where: { isDefault: true },
        select: { userId: true, provider: true, accountRef: true, holderName: true },
      }),
    ])
    // role null (versements historiques) : compté sur les deux casquettes, comme avant.
    const paidFor = (userId: string, role: 'STORE' | 'DRIVER') =>
      payouts
        .filter((p) => p.userId === userId && (p.role === role || p.role == null))
        .reduce((s, p) => s + (p._sum.amount || 0), 0)
    const accountByUser = new Map(accounts.map((a) => [a.userId, a]))

    const stores = new Map<string, any>()
    for (const part of storeParts) {
      const owner = part.store.owner
      const row =
        stores.get(owner.id) || { user: owner, storeNames: new Set<string>(), earned: 0, pending: 0, cashOwed: 0 }
      // Fenêtre de litige : basée sur la date de REMISE réelle (livraison ou
      // retrait), pas sur updatedAt qui bouge à chaque écriture sur la commande.
      const settledAt = part.order.delivery?.deliveredAt ?? part.pickedUpAt ?? part.order.updatedAt
      if (part.order.paymentMethod === PaymentMethod.CASH && part.order.fulfillment === Fulfillment.PICKUP) {
        // Retrait payé en espèces : l'ENSEIGNE a encaissé produits + frais de
        // service — BjDrive ne lui doit rien, elle doit la commission à BjDrive.
        row.cashOwed += part.order.commission
      } else {
        row.earned += part.payoutAmount
        if (settledAt > holdCutoff) row.pending += part.payoutAmount
      }
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
        const paidOut = paidFor(r.user.id, 'STORE')
        const balance = r.earned - r.cashOwed - paidOut
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
        const paidOut = paidFor(r.user.id, 'DRIVER')
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
    // Un versement POSITIF est plafonné au solde disponible du bénéficiaire
    // (un dépôt d'espèces — montant négatif — est toujours accepté).
    if (dto.amount > 0) {
      const b = await this.balances()
      const row =
        dto.role === 'DRIVER'
          ? b.drivers.find((r: any) => r.user.id === dto.userId)
          : dto.role === 'STORE'
            ? b.stores.find((r: any) => r.user.id === dto.userId)
            : b.stores.find((r: any) => r.user.id === dto.userId) || b.drivers.find((r: any) => r.user.id === dto.userId)
      const available = row?.available ?? 0
      if (dto.amount > available) {
        throw new BadRequestException(
          `Versement supérieur au solde disponible (${available} FCFA — le reste est sous délai de litige ou déjà versé).`,
        )
      }
    }
    const payout = await this.prisma.payout.create({
      data: {
        userId: dto.userId,
        amount: dto.amount,
        role: dto.role,
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

  async setRole(userId: string, role: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!user) throw new NotFoundException('Utilisateur introuvable.')
    // Ne jamais rétrograder le DERNIER super-admin (perte du contrôle de la plateforme).
    if (user.role === Role.SUPERADMIN && role !== Role.SUPERADMIN) {
      const admins = await this.prisma.user.count({ where: { role: Role.SUPERADMIN } })
      if (admins <= 1) throw new BadRequestException('Impossible : c’est le dernier compte super-admin.')
    }
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { role }, select: { id: true, role: true } })
    // Promu livreur → un profil (en attente de vérification) doit exister.
    if (role === Role.DRIVER) {
      await this.prisma.driverProfile.upsert({ where: { userId }, update: {}, create: { userId, isAvailable: false } })
    }
    return updated
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!user) throw new NotFoundException('Utilisateur introuvable.')
    if (user.role === Role.SUPERADMIN) {
      const admins = await this.prisma.user.count({ where: { role: Role.SUPERADMIN } })
      if (admins <= 1) throw new BadRequestException('Impossible : c’est le dernier compte super-admin.')
    }
    // Une commande ou une livraison EN COURS ne doit jamais perdre son titulaire.
    const [activeOrders, activeDeliveries] = await Promise.all([
      this.prisma.order.count({
        where: {
          clientId: userId,
          status: { in: [OrderStatus.AWAITING_DRIVER, OrderStatus.AWAITING_PICKUP, OrderStatus.IN_DELIVERY, OrderStatus.RETURNING] },
        },
      }),
      this.prisma.delivery.count({
        where: {
          driverId: userId,
          deliveredAt: null,
          order: { status: { in: [OrderStatus.AWAITING_PICKUP, OrderStatus.IN_DELIVERY, OrderStatus.RETURNING] } },
        },
      }),
    ])
    if (activeOrders > 0 || activeDeliveries > 0) {
      throw new BadRequestException('Ce compte a une commande ou une livraison en cours — attendez sa clôture.')
    }
    try {
      await this.prisma.user.delete({ where: { id: userId } })
      return { ok: true, deleted: true }
    } catch {
      // Historique relationnel (commandes, paiements...) → la suppression brute
      // casserait la comptabilité : bloquez/suspendez le compte à la place.
      throw new BadRequestException(
        'Ce compte a un historique (commandes, paiements...) : suppression impossible. Suspendez ses enseignes ou son profil livreur, ou laissez l’utilisateur supprimer son compte (anonymisation).',
      )
    }
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
      // Codes de réception bloqués après trop d'essais → intervention admin
      this.prisma.order.count({ where: { codeAttempts: { gte: MAX_CODE_ATTEMPTS }, status: { not: OrderStatus.DELIVERED } } }),
      this.prisma.order.count({ where: { createdAt: { gte: startOfToday } } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID, updatedAt: { gte: startOfToday } },
        _sum: { amount: true, platformAmount: true },
      }),
      // Livraisons à surveiller : récupérées il y a > 3 h sans issue, OU
      // acceptées il y a > 3 h jamais récupérées (livreur disparu).
      this.prisma.delivery.count({
        where: {
          deliveredAt: null,
          failedAt: null,
          OR: [
            { pickedUpAt: { lt: stuckCutoff }, order: { status: OrderStatus.IN_DELIVERY } },
            { pickedUpAt: null, acceptedAt: { lt: stuckCutoff }, order: { status: OrderStatus.AWAITING_PICKUP } },
          ],
        },
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
