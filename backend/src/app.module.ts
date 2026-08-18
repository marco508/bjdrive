import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { CommonModule } from './common/common.module'
import { RealtimeModule } from './realtime/realtime.module'
import { NotificationsModule } from './notifications/notifications.module'
import { MailModule } from './mail/mail.service'
import { ChatModule } from './chat/chat.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { StoresModule } from './stores/stores.module'
import { OrdersModule } from './orders/orders.module'
import { DeliveriesModule } from './deliveries/deliveries.module'
import { PaymentsModule } from './payments/payments.module'
import { AdminModule } from './admin/admin.module'
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module'
import { AppController } from './app.controller'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    // Rate limiting global (par IP) — des limites plus strictes sont posées sur l'auth.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    CommonModule,
    RealtimeModule,
    NotificationsModule,
    MailModule,
    ChatModule,
    AuthModule,
    UsersModule,
    StoresModule,
    OrdersModule,
    DeliveriesModule,
    PaymentsModule,
    AdminModule,
    BeneficiariesModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
