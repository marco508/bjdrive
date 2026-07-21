import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'

// Paramètres logistiques de l'application (modifiables par le super-admin).
// Stockés en base (singleton AppConfig id=1) avec valeurs par défaut issues de l'env.
@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  async get() {
    const defaults = {
      baseDeliveryFee: Number(this.config.get('DEFAULT_BASE_DELIVERY_FEE')) || 500,
      perKmFee: Number(this.config.get('DEFAULT_PER_KM_FEE')) || 100,
      commissionRate: Number(this.config.get('COMMISSION_RATE')) || 0.1,
      maxDeliveriesPerDay: Number(this.config.get('MAX_DELIVERIES_PER_DAY')) || 5,
      currency: 'XOF',
    }
    const row = await this.prisma.appConfig.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...defaults },
    })
    return row
  }

  update(data: Partial<{ baseDeliveryFee: number; perKmFee: number; commissionRate: number; maxDeliveriesPerDay: number }>) {
    return this.prisma.appConfig.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    })
  }
}
