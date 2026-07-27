import { Body, Controller, Headers, Param, Post, Query, UseGuards } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import { Role } from '@prisma/client'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { RolesGuard } from '../common/roles.guard'
import { Roles, CurrentUser } from '../common/decorators'
import { PaymentsService } from './payments.service'

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Post(':orderId/initiate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  initiate(@CurrentUser('userId') userId: string, @Param('orderId') orderId: string) {
    return this.payments.initiate(userId, orderId)
  }

  @Post(':orderId/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CLIENT)
  confirm(@CurrentUser('userId') userId: string, @Param('orderId') orderId: string, @Body() body: { transactionId?: string }) {
    return this.payments.confirm(userId, orderId, body?.transactionId)
  }

  // Webhook public appelé par KkiaPay. Protégé par KKIAPAY_WEBHOOK_SECRET :
  // KkiaPay renvoie le « secret hash » du dashboard dans le header
  // x-kkiapay-secret (fallbacks : x-webhook-secret ou ?token=).
  // La transaction est de toute façon re-vérifiée auprès de l'API KkiaPay.
  @Post('webhook')
  @SkipThrottle()
  webhook(
    @Body() body: any,
    @Headers('x-kkiapay-secret') kkiapaySecret?: string,
    @Headers('x-webhook-secret') secret?: string,
    @Query('token') token?: string,
  ) {
    return this.payments.webhook(body, kkiapaySecret || secret || token)
  }
}
