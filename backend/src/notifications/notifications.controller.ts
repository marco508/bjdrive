import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { CurrentUser } from '../common/decorators'
import { NotificationsService } from './notifications.service'
import { PushSubscriptionDto, UnsubscribeDto } from './dto'

@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  // Clé publique VAPID nécessaire au navigateur pour s'abonner (null si désactivé).
  @Get('vapid-public-key')
  vapidKey() {
    return { publicKey: this.notifications.vapidPublicKey }
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  subscribe(@CurrentUser('userId') userId: string, @Body() dto: PushSubscriptionDto) {
    return this.notifications.subscribe(userId, dto)
  }

  @Delete('subscribe')
  @UseGuards(JwtAuthGuard)
  unsubscribe(@CurrentUser('userId') userId: string, @Body() dto: UnsubscribeDto) {
    return this.notifications.unsubscribe(userId, dto.endpoint)
  }
}
