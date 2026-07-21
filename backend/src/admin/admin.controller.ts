import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Role, StoreStatus } from '@prisma/client'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { RolesGuard } from '../common/roles.guard'
import { Roles, CurrentUser } from '../common/decorators'
import { AdminService } from './admin.service'
import { SetRoleDto, UpdateConfigDto, VerifyStoreDto } from './dto'

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview()
  }

  @Get('stores')
  stores(@Query('status') status?: StoreStatus) {
    return this.admin.listStores(status)
  }

  @Post('stores/:id/verify')
  verify(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: VerifyStoreDto) {
    return this.admin.verifyStore(userId, id, dto)
  }

  @Patch('stores/:id/suspend')
  suspend(@Param('id') id: string, @Body() body: { suspended: boolean }) {
    return this.admin.suspendStore(id, body?.suspended)
  }

  @Get('config')
  getConfig() {
    return this.admin.getConfig()
  }

  @Patch('config')
  updateConfig(@Body() dto: UpdateConfigDto) {
    return this.admin.updateConfig(dto)
  }

  @Get('users')
  users(@Query('role') role?: string) {
    return this.admin.listUsers(role)
  }

  @Patch('users/:id/role')
  setRole(@Param('id') id: string, @Body() dto: SetRoleDto) {
    return this.admin.setRole(id, dto.role)
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.admin.deleteUser(id)
  }
}
