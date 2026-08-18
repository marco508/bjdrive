import { Module } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { OrdersController } from './orders.controller'
import { OrdersPublicController } from './orders-public.controller'
import { PaymentsModule } from '../payments/payments.module'
import { BeneficiariesModule } from '../beneficiaries/beneficiaries.module'

@Module({
  imports: [PaymentsModule, BeneficiariesModule],
  providers: [OrdersService],
  controllers: [OrdersController, OrdersPublicController],
  exports: [OrdersService],
})
export class OrdersModule {}
