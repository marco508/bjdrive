import { Module } from '@nestjs/common'
import { DeliveriesService } from './deliveries.service'
import { DeliveriesController } from './deliveries.controller'

@Module({
  providers: [DeliveriesService],
  controllers: [DeliveriesController],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
