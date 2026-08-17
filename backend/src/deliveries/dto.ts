import { IsBoolean, IsNumber, IsOptional, IsString, Length, MaxLength } from 'class-validator'

export class LocationDto {
  @IsNumber() lat: number
  @IsNumber() lng: number
}

export class CompleteDto {
  @IsString() @Length(4, 6) code: string
}

export class AvailabilityDto {
  @IsBoolean() isAvailable: boolean
}

// Échec de livraison signalé par le livreur (client absent, refus de payer...).
export class FailDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string
}
