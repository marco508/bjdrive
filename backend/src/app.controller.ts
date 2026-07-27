import { Controller, Get } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { PrismaService } from './prisma/prisma.service'
import { SettingsService } from './common/settings.service'

@Controller()
export class AppController {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  // Sonde de santé (healthcheck Docker / supervision) : API + base de données.
  @Get('health')
  @SkipThrottle()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { ok: true, db: true, at: new Date().toISOString() }
    } catch {
      return { ok: false, db: false, at: new Date().toISOString() }
    }
  }

  // Paramètres publics utiles au client (tarifs affichés, cash autorisé...).
  @Get('config/public')
  async publicConfig() {
    const cfg = await this.settings.get()
    return {
      baseDeliveryFee: cfg.baseDeliveryFee,
      perKmFee: cfg.perKmFee,
      commissionRate: cfg.commissionRate,
      allowCashOnDelivery: cfg.allowCashOnDelivery,
      currency: cfg.currency,
    }
  }
}
