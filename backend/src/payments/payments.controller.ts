import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
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

  // Webhook public appelé par KkiaPay
  @Post('webhook')
  webhook(@Body() body: any) {
    return this.payments.webhook(body)
  }
}
