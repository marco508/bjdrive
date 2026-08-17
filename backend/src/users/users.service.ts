import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DriverStatus, OrderStatus, Role, StoreStatus } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { PaymentAccountDto, UpdateMeDto } from './dto'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Suppression de compte à la demande de l'utilisateur (mot de passe requis).
  // Sans historique : suppression réelle. Avec historique (commandes, livraisons,
  // enseignes...) : ANONYMISATION — les données personnelles disparaissent mais
  // la comptabilité (commandes, paiements, reversements) reste intègre.
  async deleteMe(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Utilisateur introuvable.')
    const ok = await bcrypt.compare(password || '', user.passwordHash)
    if (!ok) throw new BadRequestException('Mot de passe incorrect.')

    // Jamais pendant une commande ou une livraison EN COURS : le code de
    // réception (client) ou la marchandise (livreur) deviendraient orphelins.
    const activeStatuses: OrderStatus[] = [
      OrderStatus.AWAITING_DRIVER,
      OrderStatus.AWAITING_PICKUP,
      OrderStatus.IN_DELIVERY,
      OrderStatus.RETURNING,
    ]
    const [activeOrders, activeDeliveries] = await Promise.all([
      this.prisma.order.count({ where: { clientId: userId, status: { in: activeStatuses } } }),
      this.prisma.delivery.count({
        where: { driverId: userId, deliveredAt: null, order: { status: { in: activeStatuses } } },
      }),
    ])
    if (activeOrders > 0) {
      throw new BadRequestException('Vous avez une commande en cours — attendez sa livraison ou annulez-la avant de supprimer votre compte.')
    }
    if (activeDeliveries > 0) {
      throw new BadRequestException('Vous avez une livraison en cours — terminez-la avant de supprimer votre compte.')
    }
    // Le dernier super-admin ne peut pas se supprimer (perte de la plateforme).
    if (user.role === Role.SUPERADMIN) {
      const admins = await this.prisma.user.count({ where: { role: Role.SUPERADMIN } })
      if (admins <= 1) throw new BadRequestException('Impossible : vous êtes le dernier compte super-admin.')
    }

    // Toujours : sessions, abonnements push et jetons de réinitialisation supprimés.
    const cleanup = [
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.pushSubscription.deleteMany({ where: { userId } }),
      this.prisma.passwordReset.deleteMany({ where: { userId } }),
    ]
    // Enseignes du gérant retirées de la vente ; profil livreur désactivé.
    const sideEffects = [
      this.prisma.store.updateMany({ where: { ownerId: userId }, data: { status: StoreStatus.SUSPENDED, active: false } }),
      this.prisma.driverProfile.updateMany({ where: { userId }, data: { status: DriverStatus.SUSPENDED, isAvailable: false } }),
    ]
    await this.prisma.$transaction([...cleanup, ...sideEffects])

    try {
      await this.prisma.user.delete({ where: { id: userId } }) // comptes de versement supprimés en cascade
      return { ok: true, deleted: true }
    } catch {
      // Historique relationnel → anonymisation irréversible. Les coordonnées de
      // VERSEMENT sont conservées : un solde encore dû (enseigne/livreur) doit
      // pouvoir être versé même après la fermeture du compte.
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: 'Compte supprimé',
          email: `supprime-${userId}@deleted.bjdrive`,
          phone: null,
          passwordHash: randomBytes(32).toString('hex'), // plus aucune connexion possible
        },
      })
      return { ok: true, deleted: false, anonymized: true }
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { driverProfile: true, paymentAccounts: true, stores: { select: { id: true, name: true, status: true } } },
    })
    if (!user) throw new NotFoundException('Utilisateur introuvable.')
    const { passwordHash, ...safe } = user
    return safe
  }

  updateMe(userId: string, dto: UpdateMeDto) {
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: { id: true, name: true, phone: true } })
  }

  listPaymentAccounts(userId: string) {
    return this.prisma.paymentAccount.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  }

  async addPaymentAccount(userId: string, dto: PaymentAccountDto) {
    if (dto.isDefault) {
      await this.prisma.paymentAccount.updateMany({ where: { userId }, data: { isDefault: false } })
    }
    const count = await this.prisma.paymentAccount.count({ where: { userId } })
    return this.prisma.paymentAccount.create({
      data: { ...dto, userId, isDefault: dto.isDefault ?? count === 0 },
    })
  }

  async removePaymentAccount(userId: string, id: string) {
    await this.prisma.paymentAccount.deleteMany({ where: { id, userId } })
    return { ok: true }
  }
}
