import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { Role } from '@prisma/client'

export class RegisterDto {
  @IsString() name: string
  @IsEmail() email: string
  @MinLength(4) password: string
  @IsOptional() @IsString() phone?: string
  // Un compte SUPERADMIN ne peut pas être créé via cette route (voir seed).
  @IsEnum(Role) role: Role
}

export class LoginDto {
  @IsEmail() email: string
  @IsString() password: string
}
