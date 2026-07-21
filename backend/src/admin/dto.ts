import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { Role, VerificationMethod } from '@prisma/client'

export class VerifyStoreDto {
  @IsBoolean() approved: boolean
  @IsOptional() @IsEnum(VerificationMethod) method?: VerificationMethod
  @IsOptional() @IsString() notes?: string
}

export class UpdateConfigDto {
  @IsOptional() @IsInt() @Min(0) baseDeliveryFee?: number
  @IsOptional() @IsInt() @Min(0) perKmFee?: number
  @IsOptional() @IsNumber() commissionRate?: number
  @IsOptional() @IsInt() @Min(1) maxDeliveriesPerDay?: number
}

export class SetRoleDto {
  @IsEnum(Role) role: Role
}
