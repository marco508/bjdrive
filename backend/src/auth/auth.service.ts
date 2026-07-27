import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Cron, CronExpression } from '@nestjs/schedule'
import { Role } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { PrismaService } from '../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import { ForgotPasswordDto, RegisterDto, LoginDto, RefreshDto, ResetPasswordDto } from './dto'

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }

  private get refreshTtlMs() {
    const days = Number(this.config.get('REFRESH_EXPIRES_DAYS')) || 30
    return days * 24 * 60 * 60 * 1000
  }

  // Access token court (JWT) + refresh token opaque stocké haché, avec rotation.
  private async issueTokens(user: { id: string; email: string; role: Role; name: string }) {
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, role: user.role, name: user.name })
    const refreshToken = randomBytes(48).toString('hex')
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: this.hash(refreshToken), expiresAt: new Date(Date.now() + this.refreshTtlMs) },
    })
    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
    }
  }

  async register(dto: RegisterDto) {
    if (dto.role === Role.SUPERADMIN) {
      throw new BadRequestException('Le compte super-admin ne peut pas être créé publiquement.')
    }
    if (dto.role === Role.STAFF) {
      throw new BadRequestException("Les comptes employés sont créés par le gérant de l'enseigne.")
    }
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (existing) throw new BadRequestException('Un compte existe déjà avec cet e-mail.')

    const passwordHash = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, passwordHash, phone: dto.phone, role: dto.role },
    })

    // Un livreur obtient automatiquement un profil livreur (en attente de vérification).
    if (dto.role === Role.DRIVER) {
      await this.prisma.driverProfile.create({ data: { userId: user.id } })
    }
    return this.issueTokens(user)
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (!user) throw new UnauthorizedException('E-mail ou mot de passe incorrect.')
    const ok = await bcrypt.compare(dto.password, user.passwordHash)
    if (!ok) throw new UnauthorizedException('E-mail ou mot de passe incorrect.')
    return this.issueTokens(user)
  }

  // Rotation : le jeton présenté est révoqué et remplacé. Un jeton déjà révoqué
  // signale un vol potentiel → toutes les sessions de l'utilisateur sont coupées.
  async refresh(dto: RefreshDto) {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(dto.refreshToken) },
      include: { user: true },
    })
    if (!row) throw new UnauthorizedException('Session invalide, reconnectez-vous.')
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      throw new UnauthorizedException('Session révoquée, reconnectez-vous.')
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException('Session expirée, reconnectez-vous.')
    await this.prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } })
    return this.issueTokens(row.user)
  }

  async logout(dto: RefreshDto) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(dto.refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return { ok: true }
  }

  // ---- Mot de passe oublié ----
  // Réponse TOUJOURS identique (pas d'énumération d'e-mails). Jeton à usage
  // unique, haché en base, valable 30 minutes, envoyé par e-mail.
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } })
    if (user) {
      // Invalide les demandes précédentes encore actives.
      await this.prisma.passwordReset.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      })
      const token = randomBytes(32).toString('hex')
      await this.prisma.passwordReset.create({
        data: { userId: user.id, tokenHash: this.hash(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      })
      const base = this.config.get<string>('WEB_APP_URL') || 'http://localhost:8080'
      this.mail.sendPasswordReset(user.email, user.name, `${base}/reset?token=${token}`).catch(() => {})
    }
    return { ok: true, message: 'Si un compte existe avec cet e-mail, un lien de réinitialisation vient de lui être envoyé.' }
  }

  // Nouveau mot de passe : jeton validé puis brûlé, toutes les sessions coupées.
  async resetPassword(dto: ResetPasswordDto) {
    const row = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: this.hash(dto.token) },
      include: { user: true },
    })
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException('Lien invalide ou expiré — refaites une demande de réinitialisation.')
    }
    const passwordHash = await bcrypt.hash(dto.password, 10)
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      // Sécurité : toute session existante est révoquée (si le compte était compromis).
      this.prisma.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ])
    return this.issueTokens(row.user) // connecté directement avec le nouveau mot de passe
  }

  // Purge quotidienne des jetons expirés/révoqués depuis plus de 7 jours.
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupTokens() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    await this.prisma.refreshToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    })
  }
}
