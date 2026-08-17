import { IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator'
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
  // Anti-fraude / litiges
  @IsOptional() @IsInt() @Min(1) trustedDriverDeliveries?: number
  @IsOptional() @IsInt() @Min(0) newDriverMaxOrderTotal?: number
  @IsOptional() @IsInt() @Min(0) payoutDelayDays?: number
  // Minutes avant annulation automatique d'une commande en ligne jamais payée.
  @IsOptional() @IsInt() @Min(0) pendingPaymentTtlMin?: number
}

export class SetRoleDto {
  @IsEnum(Role) role: Role
}

// Versement manuel enregistré par le super-admin (négatif = dépôt d'espèces d'un livreur).
export class CreatePayoutDto {
  @IsString() userId: string
  @IsInt() amount: number
  // Casquette concernée — indispensable pour un utilisateur à la fois gérant ET livreur.
  @IsOptional() @IsIn(['STORE', 'DRIVER']) role?: 'STORE' | 'DRIVER'
  @IsOptional() @IsEnum(PaymentProvider) provider?: PaymentProvider
  @IsOptional() @IsString() reference?: string
  @IsOptional() @IsString() note?: string
}

export class MarkRefundedDto {
  @IsOptional() @IsString() reference?: string
}
