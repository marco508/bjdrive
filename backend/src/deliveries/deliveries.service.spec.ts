import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { DeliveriesService } from './deliveries.service'

// Doubles de test minimalistes : on ne teste que la logique métier du service.
function makeService(overrides: any = {}) {
  const prisma: any = {
    driverProfile: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'driver1', status: 'VERIFIED', maxPerDay: null }),
      upsert: jest.fn(),
    },
    delivery: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: 'del1' }),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ codeAttempts: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderStatusHistory: { create: jest.fn() },
    orderStore: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
    payment: { upsert: jest.fn() },
    review: { aggregate: jest.fn().mockResolvedValue({ _avg: { rating: null }, _count: 0 }) },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    ...overrides.prisma,
  }
  const geo: any = { awaitingOrdersNear: jest.fn().mockResolvedValue([]) }
  const settings: any = {
    get: jest.fn().mockResolvedValue({ maxDeliveriesPerDay: 5, trustedDriverDeliveries: 20, newDriverMaxOrderTotal: 25000 }),
  }
  const realtime: any = { emitOrder: jest.fn(), emitDrivers: jest.fn() }
  const notifications: any = {
    sendToUser: jest.fn(),
    sendToUsers: jest.fn(),
    notifyNearbyDrivers: jest.fn(),
  }
  const mail: any = { sendInvoice: jest.fn() }
  return { svc: new DeliveriesService(prisma, geo, settings, realtime, notifications, mail), prisma, notifications, mail }
}

const BASE_ORDER = {
  id: 'o1',
  clientId: 'client1',
  status: 'AWAITING_DRIVER',
  paymentMethod: 'KKIAPAY',
  deliveryFee: 700,
  total: 5000,
  subtotal: 4000,
  commission: 300,
  receptionCode: '1234',
  codeAttempts: 0,
}

describe('DeliveriesService.accept', () => {
  it('refuse un livreur non vérifié', async () => {
    const { svc, prisma } = makeService()
    prisma.driverProfile.findUnique.mockResolvedValue({ userId: 'driver1', status: 'PENDING' })
    await expect(svc.accept('driver1', 'o1')).rejects.toThrow(ForbiddenException)
  })

  it('refuse au-delà du plafond quotidien', async () => {
    const { svc, prisma } = makeService()
    prisma.delivery.count.mockResolvedValue(5)
    await expect(svc.accept('driver1', 'o1')).rejects.toThrow(/Plafond atteint/)
  })

  it('refuse si un autre livreur a déjà pris la commande (course concurrente)', async () => {
    const { svc, prisma } = makeService()
    prisma.order.findUnique.mockResolvedValue(BASE_ORDER)
    prisma.order.updateMany.mockResolvedValue({ count: 0 }) // course perdue
    await expect(svc.accept('driver1', 'o1')).rejects.toThrow(/déjà prise/)
    expect(prisma.delivery.create).not.toHaveBeenCalled()
  })

  it('accepte et notifie le client', async () => {
    const { svc, prisma, notifications } = makeService()
    prisma.order.findUnique.mockResolvedValue(BASE_ORDER)
    await svc.accept('driver1', 'o1')
    expect(prisma.delivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ earnings: 700 }) }),
    )
    expect(notifications.sendToUser).toHaveBeenCalledWith('client1', expect.anything())
  })

  // ---- Garde-fous « nouveau livreur » (anti-fraude) ----
  it('nouveau livreur : commandes en espèces refusées', async () => {
    const { svc, prisma } = makeService()
    prisma.delivery.count.mockResolvedValue(0) // 0 livraison réussie → non confirmé
    prisma.order.findUnique.mockResolvedValue({ ...BASE_ORDER, paymentMethod: 'CASH' })
    await expect(svc.accept('driver1', 'o1')).rejects.toThrow(/réservées aux livreurs confirmés/)
  })

  it('nouveau livreur : commande au-dessus du plafond refusée', async () => {
    const { svc, prisma } = makeService()
    prisma.delivery.count.mockResolvedValue(0)
    prisma.order.findUnique.mockResolvedValue({ ...BASE_ORDER, total: 60000 })
    await expect(svc.accept('driver1', 'o1')).rejects.toThrow(/plafond/)
  })

  it('livreur confirmé (20+ livraisons) : cash et gros paniers autorisés', async () => {
    const { svc, prisma } = makeService()
    prisma.delivery.count.mockResolvedValue(25) // confirmé (sert aussi au quota du jour ≥ 5…
    // …donc on relève le plafond quotidien pour isoler le test de confiance)
    prisma.driverProfile.findUnique.mockResolvedValue({ userId: 'driver1', status: 'VERIFIED', maxPerDay: 100 })
    prisma.order.findUnique.mockResolvedValue({ ...BASE_ORDER, paymentMethod: 'CASH', total: 60000 })
    await expect(svc.accept('driver1', 'o1')).resolves.toBeDefined()
  })
})

describe('DeliveriesService.complete (code de réception)', () => {
  function withDelivery(order: any) {
    const { svc, prisma } = makeService()
    prisma.delivery.findUnique.mockResolvedValue({ orderId: order.id, driverId: 'driver1', order })
    return { svc, prisma }
  }

  it('mauvais code → incrémente le compteur et indique les essais restants', async () => {
    const { svc, prisma } = withDelivery({ ...BASE_ORDER, status: 'IN_DELIVERY' })
    await expect(svc.complete('driver1', 'o1', '0000')).rejects.toThrow(/essai/)
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { codeAttempts: { increment: 1 } }, select: { codeAttempts: true } }),
    )
  })

  it('bloque après 5 tentatives, même avec le bon code', async () => {
    const { svc } = withDelivery({ ...BASE_ORDER, status: 'IN_DELIVERY', codeAttempts: 5 })
    await expect(svc.complete('driver1', 'o1', '1234')).rejects.toThrow(/Trop de tentatives/)
  })

  it('bon code → livrée ; commande cash payée à la remise', async () => {
    const { svc, prisma } = withDelivery({ ...BASE_ORDER, status: 'IN_DELIVERY', paymentMethod: 'CASH' })
    await svc.complete('driver1', 'o1', '1234')
    expect(prisma.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ provider: 'CASH', amount: 5000, storeAmount: 4000, driverAmount: 700 }),
      }),
    )
  })

  it('refuse hors livraison en cours', async () => {
    const { svc } = withDelivery({ ...BASE_ORDER, status: 'AWAITING_PICKUP' })
    await expect(svc.complete('driver1', 'o1', '1234')).rejects.toThrow(BadRequestException)
  })
})
