import { IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

// Un proche au Bénin pour qui le client commande (diaspora).
export class BeneficiaryDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string
  @IsString() @MinLength(6) @MaxLength(30) phone: string
  @IsOptional() @IsString() @MaxLength(200) address?: string
  @IsNumber() lat: number
  @IsNumber() lng: number
  @IsOptional() @IsString() @MaxLength(200) note?: string
}
