import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator'
import { PaymentProvider } from '@prisma/client'

export class UpdateMeDto {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() phone?: string
}

export class PaymentAccountDto {
  @IsEnum(PaymentProvider) provider: PaymentProvider
  @IsString() accountRef: string // numéro MoMo/Moov, IBAN, ou identifiant marchand
  @IsOptional() @IsString() label?: string
  @IsOptional() @IsString() holderName?: string
  @IsOptional() @IsBoolean() isDefault?: boolean
}
