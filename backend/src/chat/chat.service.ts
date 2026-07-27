import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Role } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { NotificationsService } from '../notifications/notifications.service'

// Discussion privée d'une commande. Participants :
//   - le client de la commande
//   - le gérant ET les employés (STAFF) de chaque enseigne concernée
//   - le livreur assigné (rejoint la discussion dès qu'il accepte)
//   - le super-admin (supervision)
@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
    private notifications: NotificationsService,
  ) {}

  // Renvoie l'ordre + la liste des userIds participants, ou 403.
  private async assertParticipant(userId: string, role: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        stores: { include: { store: { select: { id: true, name: true, ownerId: true } } } },
        delivery: { select: { driverId: true } },
      },
    })
    if (!order) throw new NotFoundException('Commande introuvable.')
    const storeIds = order.stores.map((os) => os.store.id)
    const staff = await this.prisma.user.findMany({
      where: { staffStoreId: { in: storeIds }, role: Role.STAFF },
      select: { id: true },
    })
    const participants = new Set<string>([
      order.clientId,
      ...order.stores.map((os) => os.store.ownerId),
      ...staff.map((s) => s.id),
    ])
    if (order.delivery?.driverId) participants.add(order.delivery.driverId)
    if (role !== 'SUPERADMIN' && !participants.has(userId)) {
      throw new ForbiddenException("Vous ne participez pas à cette discussion.")
    }
    return { order, participants }
  }

  async list(userId: string, role: string, orderId: string) {
    await this.assertParticipant(userId, role, orderId)
    return this.prisma.message.findMany({
      where: { orderId },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
  }

  async send(userId: string, role: string, orderId: string, body: string) {
    const text = (body || '').trim()
    if (!text) throw new BadRequestException('Message vide.')
    if (text.length > 1000) throw new BadRequestException('Message trop long (1000 caractères max).')
    const { participants } = await this.assertParticipant(userId, role, orderId)
    const message = await this.prisma.message.create({
      data: { orderId, senderId: userId, senderRole: role as Role, body: text },
      include: { sender: { select: { id: true, name: true } } },
    })
    // Temps réel vers tous les écrans qui suivent la commande.
    this.realtime.emitOrder(orderId, 'chatMessage', message)
    // Push vers les autres participants.
    const others = [...participants].filter((id) => id !== userId)
    const who = role === 'CLIENT' ? 'Client' : role === 'DRIVER' ? 'Livreur' : 'Enseigne'
    this.notifications.sendToUsers(others, {
      title: `💬 ${who} · ${message.sender.name}`,
      body: text.slice(0, 120),
      url: role === 'CLIENT' ? '/manager/orders' : `/client/track/${orderId}`,
      tag: `chat-${orderId}`,
    })
    return message
  }
}
