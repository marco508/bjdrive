import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { PaymentProvider, Role, VerificationMethod } from '@prisma/client'

export class VerifyStoreDto {
  @IsBoolean() approved: boolean
  @IsOptional() @IsEnum(VerificationMethod) method?: VerificationMethod
  @IsOptional() @IsString() notes?: string
}

// Vérification d'un livreur (pièce d'identité, entretien...).
export class VerifyDriverDto {
  @IsBoolean() approved: boolean
  @IsOptional() @IsString() notes?: string
}

export class UpdateConfigDto {
  @IsOptional() @IsInt() @Min(0) baseDeliveryFee?: number
  @IsOptional() @IsInt() @Min(0) perKmFee?: number
  @IsOptional() @IsNumber() commissionRate?: number
  @IsOptional() @IsInt() @Min(1) maxDeliveriesPerDay?: number
  @IsOptional() @IsBoolean() allowCashOnDelivery?: boolean
}

export class SetRoleDto {
  @IsEnum(Role) role: Role
}

// Versement manuel enregistré par le super-admin (négatif = dépôt d'espèces d'un livreur).
export class CreatePayoutDto {
  @IsString() userId: string
  @IsInt() amount: number
  @IsOptional() @IsEnum(PaymentProvider) provider?: PaymentProvider
  @IsOptional() @IsString() reference?: string
  @IsOptional() @IsString() note?: string
}

export class MarkRefundedDto {
  @IsOptional() @IsString() reference?: string
}
