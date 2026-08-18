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
  MaxLength,
  Min,
  ValidateNested,
  IsDateString,
} from 'class-validator'
import { Fulfillment, PaymentMethod } from '@prisma/client'

export class OrderItemInput {
  @IsString() productId: string
  @IsInt() @Min(1) qty: number
}

export class CreateOrderDto {
  // Le panier peut contenir des produits de plusieurs enseignes (regroupées côté serveur).
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => OrderItemInput)
  items: OrderItemInput[]
  // Position requise pour une LIVRAISON ; ignorée pour un RETRAIT (coords de l'enseigne).
  @IsOptional() @IsNumber() destLat?: number
  @IsOptional() @IsNumber() destLng?: number
  @IsOptional() @IsString() destAddress?: string
  @IsOptional() @IsString() destNote?: string
  // KKIAPAY (défaut) ou CASH (paiement à la livraison/au retrait, si autorisé)
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod
  // DELIVERY (défaut) ou PICKUP (le client passe chercher — une seule enseigne)
  @IsOptional() @IsEnum(Fulfillment) fulfillment?: Fulfillment

  // ---- Commande « pour un proche » (diaspora) ----
  // Soit un proche enregistré (beneficiaryId → adresse + contact repris),
  // soit un destinataire saisi à la volée (recipientName + recipientPhone +
  // destLat/destLng). Le livreur appellera CE contact.
  @IsOptional() @IsString() beneficiaryId?: string
  @IsOptional() @IsString() @MaxLength(80) recipientName?: string
  @IsOptional() @IsString() @MaxLength(30) recipientPhone?: string
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
