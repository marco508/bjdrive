import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { DriverStatus, Role, StoreStatus } from '@prisma/client'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { RolesGuard } from '../common/roles.guard'
import { Roles, CurrentUser } from '../common/decorators'
import { AdminService } from './admin.service'
import { CreatePayoutDto, MarkRefundedDto, SetRoleDto, UpdateConfigDto, VerifyDriverDto, VerifyStoreDto } from './dto'

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPERADMIN)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('overview')
  overview() {
    return this.admin.overview()
  }

  // -------- Enseignes --------
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

  // Blocage définitif (irréversible depuis l'interface).
  @Post('stores/:id/ban')
  ban(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.admin.banStore(id, body?.reason)
  }

  // Suppression (refusée si l'enseigne a un historique de commandes).
  @Delete('stores/:id')
  deleteStore(@Param('id') id: string) {
    return this.admin.deleteStore(id)
  }

  // -------- Livreurs --------
  @Get('drivers')
  drivers(@Query('status') status?: DriverStatus) {
    return this.admin.listDrivers(status)
  }

  @Post('drivers/:userId/verify')
  verifyDriver(@CurrentUser('userId') adminId: string, @Param('userId') userId: string, @Body() dto: VerifyDriverDto) {
    return this.admin.verifyDriver(adminId, userId, dto)
  }

  @Patch('drivers/:userId/suspend')
  suspendDriver(@Param('userId') userId: string, @Body() body: { suspended: boolean }) {
    return this.admin.suspendDriver(userId, body?.suspended)
  }

  // -------- Commandes --------
  @Get('orders')
  orders(@Query('status') status?: string, @Query('take') take?: string) {
    return this.admin.listOrders(status as any, take ? Number(take) : undefined)
  }

  @Post('orders/:orderId/reset-code')
  resetCode(@Param('orderId') orderId: string) {
    return this.admin.resetCodeAttempts(orderId)
  }

  // -------- Remboursements --------
  @Get('refunds')
  refunds() {
    return this.admin.listRefunds()
  }

  @Post('refunds/:orderId/retry')
  retryRefund(@Param('orderId') orderId: string) {
    return this.admin.retryRefund(orderId)
  }

  @Post('refunds/:orderId/mark-refunded')
  markRefunded(@Param('orderId') orderId: string, @Body() dto: MarkRefundedDto) {
    return this.admin.markRefunded(orderId, dto)
  }

  // -------- Versements --------
  @Get('balances')
  balances() {
    return this.admin.balances()
  }

  @Get('payouts')
  payouts(@Query('userId') userId?: string) {
    return this.admin.listPayouts(userId)
  }

  @Post('payouts')
  createPayout(@CurrentUser('userId') adminId: string, @Body() dto: CreatePayoutDto) {
    return this.admin.createPayout(adminId, dto)
  }

  // -------- Configuration --------
  @Get('config')
  getConfig() {
    return this.admin.getConfig()
  }

  @Patch('config')
  updateConfig(@Body() dto: UpdateConfigDto) {
    return this.admin.updateConfig(dto)
  }

  // -------- Comptes --------
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
