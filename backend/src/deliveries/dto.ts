import { IsBoolean, IsNumber, IsString, Length } from 'class-validator'

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
