import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as webpush from 'web-push'
import { PrismaService } from '../prisma/prisma.service'
import { haversine } from '../common/distance'

export interface PushPayload {
  title: string
  body: string
  url?: string // route de l'app ouverte au clic
  tag?: string
}

// Notifications Web Push (VAPID) : le client/livreur/manager est prévenu même
// application fermée. Sans clés VAPID configurées, le service est inactif (log).
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications')
  private enabled = false

  constructor(private prisma: PrismaService, private config: ConfigService) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')
    if (publicKey && privateKey) {
      // Des clés invalides ne doivent jamais empêcher l'API de démarrer :
      // on désactive simplement le push et on explique comment corriger.
      try {
        webpush.setVapidDetails(this.config.get('VAPID_SUBJECT') || 'mailto:admin@bjdrive.bj', publicKey, privateKey)
        this.enabled = true
      } catch (e: any) {
        this.logger.error(
          `Clés VAPID invalides (${e?.message}) → notifications push désactivées. ` +
            'Régénérez-les avec : npx web-push generate-vapid-keys',
        )
      }
    } else {
      this.logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY absents → notifications push désactivées.')
    }
  }

  get vapidPublicKey(): string | null {
    return this.enabled ? (this.config.get<string>('VAPID_PUBLIC_KEY') as string) : null
  }

  async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    })
    return { ok: true }
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } })
    return { ok: true }
  }

  // Envoie à tous les appareils d'un utilisateur ; purge les abonnements expirés.
  async sendToUser(userId: string, payload: PushPayload) {
    if (!this.enabled) return
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } })
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload),
          )
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
          } else {
            this.logger.warn(`Échec push vers ${userId}: ${e?.statusCode || e?.message}`)
          }
        }
      }),
    )
  }

  async sendToUsers(userIds: string[], payload: PushPayload) {
    await Promise.all([...new Set(userIds)].map((id) => this.sendToUser(id, payload)))
  }

  // Prévient les livreurs VÉRIFIÉS, disponibles et récemment localisés près d'un point.
  async notifyNearbyDrivers(point: { lat: number; lng: number }, payload: PushPayload, radiusMeters = 15000) {
    if (!this.enabled) return
    const recent = new Date(Date.now() - 60 * 60 * 1000) // localisé il y a moins d'1 h
    const drivers = await this.prisma.driverProfile.findMany({
      where: {
        status: 'VERIFIED',
        isAvailable: true,
        currentLat: { not: null },
        currentLng: { not: null },
        lastLocationAt: { gte: recent },
      },
      select: { userId: true, currentLat: true, currentLng: true },
    })
    const near = drivers.filter(
      (d) => haversine({ lat: d.currentLat!, lng: d.currentLng! }, point) <= radiusMeters,
    )
    await this.sendToUsers(near.map((d) => d.userId), payload)
  }
}
