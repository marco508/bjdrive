import { Injectable, NotFoundException } from '@nestjs/common'
import { OrderStatus, PaymentStatus, StoreStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { SettingsService } from '../common/settings.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { VerifyStoreDto, UpdateConfigDto } from './dto'

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService, private settings: SettingsService, private realtime: RealtimeGateway) {}

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
    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        status: dto.approved ? StoreStatus.VERIFIED : StoreStatus.REJECTED,
        verificationMethod: dto.method,
        verificationNotes: dto.notes,
        verifiedById: adminId,
        verifiedAt: new Date(),
      },
    })
  }

  suspendStore(storeId: string, suspended: boolean) {
    return this.prisma.store.update({
      where: { id: storeId },
      data: { status: suspended ? StoreStatus.SUSPENDED : StoreStatus.VERIFIED },
    })
  }

  // -------- Configuration (tarifs, commission, plafond) --------
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

  // -------- Vue d'ensemble (KPIs) --------
  async overview() {
    const [stores, pending, users, drivers, orders, delivered, payments] = await Promise.all([
      this.prisma.store.count({ where: { status: StoreStatus.VERIFIED } }),
      this.prisma.store.count({ where: { status: StoreStatus.PENDING } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'DRIVER' } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: OrderStatus.DELIVERED } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.PAID },
        _sum: { amount: true, platformAmount: true, storeAmount: true, driverAmount: true },
      }),
    ])
    return {
      verifiedStores: stores,
      pendingStores: pending,
      users,
      drivers,
      orders,
      deliveredOrders: delivered,
      grossVolume: payments._sum.amount || 0,
      platformRevenue: payments._sum.platformAmount || 0, // commission 10% encaissée
      storesPayout: payments._sum.storeAmount || 0,
      driversPayout: payments._sum.driverAmount || 0,
    }
  }
}
