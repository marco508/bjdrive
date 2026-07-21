import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'

// Passerelle temps réel (Socket.IO).
// Les clients rejoignent la « room » d'une commande pour recevoir en direct
// les changements de statut et la position du livreur.
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway {
  @WebSocketServer() server: Server

  @SubscribeMessage('subscribeOrder')
  onSubscribe(@MessageBody() data: { orderId: string }, @ConnectedSocket() client: Socket) {
    if (data?.orderId) client.join(`order:${data.orderId}`)
    return { ok: true }
  }

  @SubscribeMessage('unsubscribeOrder')
  onUnsubscribe(@MessageBody() data: { orderId: string }, @ConnectedSocket() client: Socket) {
    if (data?.orderId) client.leave(`order:${data.orderId}`)
    return { ok: true }
  }

  // Appelé par les services pour diffuser un événement à une commande.
  emitOrder(orderId: string, event: string, payload: any) {
    this.server?.to(`order:${orderId}`).emit(event, payload)
  }
}
