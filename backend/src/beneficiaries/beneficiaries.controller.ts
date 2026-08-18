import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { Role } from '@prisma/client'
import { JwtAuthGuard } from '../common/jwt-auth.guard'
import { RolesGuard } from '../common/roles.guard'
import { Roles, CurrentUser } from '../common/decorators'
import { BeneficiariesService } from './beneficiaries.service'
import { BeneficiaryDto } from './dto'

@Controller('beneficiaries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLIENT)
export class BeneficiariesController {
  constructor(private beneficiaries: BeneficiariesService) {}

  @Get()
  list(@CurrentUser('userId') userId: string) {
    return this.beneficiaries.list(userId)
  }

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: BeneficiaryDto) {
    return this.beneficiaries.create(userId, dto)
  }

  @Patch(':id')
  update(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: BeneficiaryDto) {
    return this.beneficiaries.update(userId, id, dto)
  }

  @Delete(':id')
  remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.beneficiaries.remove(userId, id)
  }
}
