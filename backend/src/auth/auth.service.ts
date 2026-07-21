import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { RegisterDto, LoginDto } from './dto'

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  private sign(user: { id: string; email: string; role: Role; name: string }) {
    const token = this.jwt.sign({ sub: user.id, email: user.email, role: user.role, name: user.name })
    return {
      accessToken: token,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    }
  }

  async register(dto: RegisterDto) {
    if (dto.role === Role.SUPERADMIN) {
      throw new BadRequestException('Le compte super-admin ne peut pas être créé publiquement.')
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) throw new BadRequestException('Un compte existe déjà avec cet e-mail.')

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, phone: dto.phone, role: dto.role },
    })

    // Un livreur obtient automatiquement un profil livreur.
    if (dto.role === Role.DRIVER) {
      await this.prisma.driverProfile.create({ data: { userId: user.id } })
    }
    return this.sign(user)
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('E-mail ou mot de passe incorrect.')
    const ok = await bcrypt.compare(dto.password, user.passwordHash)
    if (!ok) throw new UnauthorizedException('E-mail ou mot de passe incorrect.')
    return this.sign(user)
  }
}
