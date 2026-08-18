import { Controller, Get, Param } from '@nestjs/common'
import { OrdersService } from './orders.service'

// Suivi de commande PUBLIC (sans compte) : accessible au proche destinataire
// au Bénin via le jeton généré à la commande. Aucun guard d'authentification.
@Controller('public/orders')
export class OrdersPublicController {
  constructor(private orders: OrdersService) {}

  @Get('track/:token')
  track(@Param('token') token: string) {
    return this.orders.publicTrack(token)
  }
}
