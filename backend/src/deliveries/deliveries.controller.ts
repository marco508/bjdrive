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
  available(@Query('lat') lat: string, @Query('lng') lng: string, @Query('radius') radius?: string) {
    return this.deliveries.available(Number(lat), Number(lng), radius ? Number(radius) : undefined)
  }

  @Get('mine')
  mine(@CurrentUser('userId') userId: string) {
    return this.deliveries.mine(userId)
  }

  @Post('accept/:orderId')
  accept(@CurrentUser('userId') userId: string, @Param('orderId') orderId: string) {
    return this.deliveries.accept(userId, orderId)
  }

  @Post(':orderId/pickup')
  pickup(@CurrentUser('userId') userId: string, @Param('orderId') orderId: string) {
    return this.deliveries.pickup(userId, orderId)
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
