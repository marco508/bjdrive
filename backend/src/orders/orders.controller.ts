import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { RolesGuard } from '../common/roles.guard'
import { Roles, CurrentUser } from '../common/decorators'
import { OrdersService } from './orders.service'
import { CreateOrderDto, ReviewDto, ScheduleDto } from './dto'

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateOrderDto) {
    return this.orders.create(userId, dto)
  }

  @Get('mine')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  mine(@CurrentUser('userId') userId: string) {
    return this.orders.listMine(userId)
  }

  // Habitudes d'achat du client (dashboard personnel).
  @Get('stats/mine')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  statsMine(@CurrentUser('userId') userId: string) {
    return this.orders.statsMine(userId)
  }

  @Get('store/:storeId')
  @UseGuards(RolesGuard)
  @Roles(Role.MANAGER, Role.STAFF)
  forStore(@CurrentUser('userId') userId: string, @Param('storeId') storeId: string) {
    return this.orders.listForStore(userId, storeId)
  }

  @Get(':id')
  getOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.orders.getOne(user.userId, user.role, id)
  }

  @Patch(':id/schedule')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  reschedule(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: ScheduleDto) {
    return this.orders.reschedule(userId, id, dto)
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  cancel(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.orders.cancel(userId, id)
  }

  // Avis après livraison (livreur et/ou enseignes).
  @Post(':id/review')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  review(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: ReviewDto) {
    return this.orders.review(userId, id, dto)
  }

  // Le gérant ou un employé marque la part de son enseigne comme prête.
  @Post(':id/store/:storeId/ready')
  @UseGuards(RolesGuard)
  @Roles(Role.MANAGER, Role.STAFF)
  storeReady(@CurrentUser('userId') userId: string, @Param('id') id: string, @Param('storeId') storeId: string) {
    return this.orders.markStoreReady(userId, id, storeId)
  }

  // Retrait sur place : l'enseigne valide la remise avec le code du client.
  @Post(':id/store/:storeId/complete-pickup')
  @UseGuards(RolesGuard)
  @Roles(Role.MANAGER, Role.STAFF)
  completePickup(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Param('storeId') storeId: string,
    @Body() body: { code: string },
  ) {
    return this.orders.completePickup(userId, id, storeId, body?.code || '')
  }
}
