import { Type } from 'class-transformer'
import { ArrayNotEmpty, IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested, IsDateString } from 'class-validator'

export class OrderItemInput {
  @IsString() productId: string
  @IsInt() @Min(1) qty: number
}

export class CreateOrderDto {
  @IsString() storeId: string
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => OrderItemInput)
  items: OrderItemInput[]
  @IsNumber() destLat: number
  @IsNumber() destLng: number
  @IsOptional() @IsString() destAddress?: string
  @IsOptional() @IsString() destNote?: string
}

export class ScheduleDto {
  @IsDateString() scheduledDeliveryAt: string
}
