import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { RolesGuard } from '../common/roles.guard'
import { Roles, CurrentUser } from '../common/decorators'
import { DeliveriesService } from './deliveries.service'
import { AvailabilityDto, CompleteDto, LocationDto } from './dto'

@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DRIVER)
export class DeliveriesController {
  constructor(private deliveries: DeliveriesService) {}

  @Get('available')
  available(@CurrentUser('userId') userId: string, @Query('lat') lat: string, @Query('lng') lng: string, @Query('radius') radius?: string) {
    return this.deliveries.available(userId, Number(lat), Number(lng), radius ? Number(radius) : undefined)
  }

  @Get('mine')
  mine(@CurrentUser('userId') userId: string) {
    return this.deliveries.mine(userId)
  }

  // Historique de gains par jour : /deliveries/earnings?days=30
  @Get('earnings')
  earnings(@CurrentUser('userId') userId: string, @Query('days') days?: string) {
    return this.deliveries.earningsHistory(userId, days ? Number(days) : undefined)
  }

  @Post('accept/:orderId')
  accept(@CurrentUser('userId') userId: string, @Param('orderId') orderId: string) {
    return this.deliveries.accept(userId, orderId)
  }

  @Post(':orderId/pickup/:storeId')
  pickup(@CurrentUser('userId') userId: string, @Param('orderId') orderId: string, @Param('storeId') storeId: string) {
    return this.deliveries.pickupStore(userId, orderId, storeId)
  }

  @Post(':orderId/complete')
  complete(@CurrentUser('userId') userId: string, @Param('orderId') orderId: string, @Body() dto: CompleteDto) {
    return this.deliveries.complete(userId, orderId, dto.code)
  }

  @Post('location')
  location(@CurrentUser('userId') userId: string, @Body() dto: LocationDto) {
    return this.deliveries.updateLocation(userId, dto.lat, dto.lng)
  }

  @Patch('availability')
  availability(@CurrentUser('userId') userId: string, @Body() dto: AvailabilityDto) {
    return this.deliveries.setAvailability(userId, dto.isAvailable)
  }
}
