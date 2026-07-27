import { Type } from 'class-transformer'
import { IsObject, IsString, IsUrl, ValidateNested } from 'class-validator'

class PushKeysDto {
  @IsString() p256dh: string
  @IsString() auth: string
}

export class PushSubscriptionDto {
  @IsUrl({ require_tld: false }) endpoint: string
  @IsObject() @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto
}

export class UnsubscribeDto {
  @IsString() endpoint: string
}
