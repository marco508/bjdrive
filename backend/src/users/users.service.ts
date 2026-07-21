import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PaymentAccountDto, UpdateMeDto } from './dto'

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
