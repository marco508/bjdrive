import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { PrismaModule } from './prisma/prisma.module'
import { CommonModule } from './common/common.module'
import { RealtimeModule } from './realtime/realtime.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { StoresModule } from './stores/stores.module'
import { OrdersModule } from './orders/orders.module'
import { DeliveriesModule } from './deliveries/deliveries.module'
import { PaymentsModule } from './payments/payments.module'
import { AdminModule } from './admin/admin.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    StoresModule,
    OrdersModule,
    DeliveriesModule,
    PaymentsModule,
    AdminModule,
  ],
})
export class AppModule {}
