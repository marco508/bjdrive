import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { RolesGuard } from '../common/roles.guard'
import { Roles, CurrentUser } from '../common/decorators'
import { OrdersService } from './orders.service'
import { CreateOrderDto, ScheduleDto } from './dto'

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

  @Get('store/:storeId')
  @UseGuards(RolesGuard)
  @Roles(Role.MANAGER)
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
}
