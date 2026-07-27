import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator'
import { Role } from '@prisma/client'

export class RegisterDto {
  @IsString() name: string
  @IsEmail() email: string
  @MinLength(6) password: string
  @IsOptional() @IsString() phone?: string
  // Un compte SUPERADMIN ne peut pas être créé via cette route (voir seed).
  @IsEnum(Role) role: Role
}

export class LoginDto {
  @IsEmail() email: string
  @IsString() password: string
}

export class RefreshDto {
  @IsString() refreshToken: string
}

export class ForgotPasswordDto {
  @IsEmail() email: string
}

export class ResetPasswordDto {
  @IsString() token: string
  @MinLength(6) password: string
}
