import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { CurrentUser } from '../common/decorators'
import { UsersService } from './users.service'
import { PaymentAccountDto, UpdateMeDto } from './dto'

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('me')
  me(@CurrentUser('userId') userId: string) {
    return this.users.me(userId)
  }

  @Patch('me')
  updateMe(@CurrentUser('userId') userId: string, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(userId, dto)
  }

  // Suppression du compte (mot de passe exigé, anti force brute).
  @Delete('me')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  deleteMe(@CurrentUser('userId') userId: string, @Body() body: { password: string }) {
    return this.users.deleteMe(userId, body?.password || '')
  }

  @Get('me/payment-accounts')
  listAccounts(@CurrentUser('userId') userId: string) {
    return this.users.listPaymentAccounts(userId)
  }

  @Post('me/payment-accounts')
  addAccount(@CurrentUser('userId') userId: string, @Body() dto: PaymentAccountDto) {
    return this.users.addPaymentAccount(userId, dto)
  }

  @Delete('me/payment-accounts/:id')
  removeAccount(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.users.removePaymentAccount(userId, id)
  }
}
