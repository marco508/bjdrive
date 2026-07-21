import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator'

export class CreateStoreDto {
  @IsString() name: string
  @IsOptional() @IsString() description?: string
  @IsString() categoryId: string
  @IsOptional() @IsString() emoji?: string
  @IsOptional() @IsString() color?: string
  @IsString() address: string
  @IsNumber() lat: number
  @IsNumber() lng: number
}

export class UpdateStoreDto {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() categoryId?: string
  @IsOptional() @IsString() emoji?: string
  @IsOptional() @IsString() color?: string
  @IsOptional() @IsString() address?: string
  @IsOptional() @IsNumber() lat?: number
  @IsOptional() @IsNumber() lng?: number
  @IsOptional() @IsBoolean() active?: boolean
}

export class ProductDto {
  @IsString() name: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() category?: string
  @IsOptional() @IsString() emoji?: string
  @IsInt() @Min(0) price: number
  @IsInt() @Min(0) stock: number
  @IsOptional() @IsString() unit?: string
}

export class ImportProductsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductDto)
  products: ProductDto[]
}

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() category?: string
  @IsOptional() @IsString() emoji?: string
  @IsOptional() @IsInt() @Min(0) price?: number
  @IsOptional() @IsInt() @Min(0) stock?: number
  @IsOptional() @IsString() unit?: string
  @IsOptional() @IsBoolean() active?: boolean
}
