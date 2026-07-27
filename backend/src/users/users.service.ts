import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DriverStatus, StoreStatus } from '@prisma/client'
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

    // Toujours : sessions, abonnements push et comptes de versement supprimés.
    const cleanup = [
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.pushSubscription.deleteMany({ where: { userId } }),
      this.prisma.paymentAccount.deleteMany({ where: { userId } }),
      this.prisma.passwordReset.deleteMany({ where: { userId } }),
    ]
    // Enseignes du gérant retirées de la vente ; profil livreur désactivé.
    const sideEffects = [
      this.prisma.store.updateMany({ where: { ownerId: userId }, data: { status: StoreStatus.SUSPENDED, active: false } }),
      this.prisma.driverProfile.updateMany({ where: { userId }, data: { status: DriverStatus.SUSPENDED, isAvailable: false } }),
    ]
    await this.prisma.$transaction([...cleanup, ...sideEffects])

    try {
      await this.prisma.user.delete({ where: { id: userId } })
      return { ok: true, deleted: true }
    } catch {
      // Historique relationnel → anonymisation irréversible.
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
