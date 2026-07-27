import { Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
  IsDateString,
} from 'class-validator'
import { PaymentMethod } from '@prisma/client'

export class OrderItemInput {
  @IsString() productId: string
  @IsInt() @Min(1) qty: number
}

export class CreateOrderDto {
  // Le panier peut contenir des produits de plusieurs enseignes (regroupées côté serveur).
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => OrderItemInput)
  items: OrderItemInput[]
  @IsNumber() destLat: number
  @IsNumber() destLng: number
  @IsOptional() @IsString() destAddress?: string
  @IsOptional() @IsString() destNote?: string
  // KKIAPAY (défaut) ou CASH (paiement à la livraison, si autorisé par la config)
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod
}

export class ScheduleDto {
  @IsDateString() scheduledDeliveryAt: string
}

export class StoreReviewInput {
  @IsString() storeId: string
  @IsInt() @Min(1) @Max(5) rating: number
  @IsOptional() @IsString() comment?: string
}

// Avis après livraison : note du livreur et/ou des enseignes de la commande.
export class ReviewDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) driverRating?: number
  @IsOptional() @IsString() driverComment?: string
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => StoreReviewInput)
  stores?: StoreReviewInput[]
}
