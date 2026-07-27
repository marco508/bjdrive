import { BadRequestException } from '@nestjs/common'
import { OrdersService } from './orders.service'

const STORE = { id: 's1', name: 'Mini Market', status: 'VERIFIED', active: true, lat: 6.37, lng: 2.39, ownerId: 'owner1' }
const PRODUCT = { id: 'p1', name: 'Riz 5kg', price: 3000, stock: 10, active: true, emoji: '🍚', storeId: 's1', store: STORE }

function makeService(overrides: any = {}) {
  const created: any = { id: 'o1' }
  const prisma: any = {
    product: {
      findMany: jest.fn().mockResolvedValue([PRODUCT]),
      update: jest.fn().mockResolvedValue({}),
    },
    order: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...created, ...data })),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    orderStatusHistory: { create: jest.fn() },
    delivery: { delete: jest.fn() },
    review: { upsert: jest.fn() },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    ...overrides.prisma,
  }
  const settings: any = {
    get: jest.fn().mockResolvedValue({
      baseDeliveryFee: 500,
      perKmFee: 100,
      commissionRate: 0.1,
      maxDeliveriesPerDay: 5,
      allowCashOnDelivery: true,
      ...overrides.config,
    }),
  }
  const realtime: any = { emitOrder: jest.fn(), emitDrivers: jest.fn() }
  const notifications: any = { sendToUser: jest.fn(), sendToUsers: jest.fn(), notifyNearbyDrivers: jest.fn() }
  const payments: any = { requestRefund: jest.fn().mockResolvedValue({ refunded: true }) }
  return { svc: new OrdersService(prisma, settings, realtime, notifications, payments), prisma, payments, realtime }
}

const DTO: any = { items: [{ productId: 'p1', qty: 2 }], destLat: 6.36, destLng: 2.41 }

describe('OrdersService.create', () => {
  it('calcule sous-total, commission 10% et total', async () => {
    const { svc } = makeService()
    const order: any = await svc.create('client1', DTO)
    expect(order.subtotal).toBe(6000)
    expect(order.commission).toBe(600)
    expect(order.total).toBe(order.subtotal + order.deliveryFee + order.commission)
    expect(order.status).toBe('PENDING_PAYMENT')
  })

  it('décrémente le stock des produits commandés', async () => {
    const { svc, prisma } = makeService()
    await svc.create('client1', DTO)
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { decrement: 2 } } }),
    )
  })

  it('refuse un stock insuffisant', async () => {
    const { svc } = makeService()
    await expect(svc.create('client1', { ...DTO, items: [{ productId: 'p1', qty: 99 }] })).rejects.toThrow(/Stock insuffisant/)
  })

  it('commande cash → part directement en recherche de livreur', async () => {
    const { svc, realtime } = makeService()
    const order: any = await svc.create('client1', { ...DTO, paymentMethod: 'CASH' })
    expect(order.status).toBe('AWAITING_DRIVER')
    expect(realtime.emitDrivers).toHaveBeenCalledWith('newOrderAvailable', expect.anything())
  })

  it('refuse le cash quand la config le désactive', async () => {
    const { svc } = makeService({ config: { allowCashOnDelivery: false } })
    await expect(svc.create('client1', { ...DTO, paymentMethod: 'CASH' })).rejects.toThrow(BadRequestException)
  })
})

describe('OrdersService.cancel', () => {
  const ORDER = {
    id: 'o1',
    clientId: 'client1',
    status: 'AWAITING_DRIVER',
    paymentStatus: 'PAID',
    items: [{ productId: 'p1', qty: 2 }],
    delivery: null,
  }

  it('commande payée → restitue le stock et déclenche le remboursement', async () => {
    const { svc, prisma, payments } = makeService()
    prisma.order.findUnique.mockResolvedValue(ORDER)
    const res: any = await svc.cancel('client1', 'o1')
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: { increment: 2 } } }),
    )
    expect(payments.requestRefund).toHaveBeenCalledWith('o1')
    expect(res.refund).toEqual({ refunded: true })
  })

  it('supprime la livraison si un livreur avait accepté (quota libéré)', async () => {
    const { svc, prisma } = makeService()
    prisma.order.findUnique.mockResolvedValue({
      ...ORDER,
      status: 'AWAITING_PICKUP',
      delivery: { driverId: 'driver1' },
    })
    await svc.cancel('client1', 'o1')
    expect(prisma.delivery.delete).toHaveBeenCalledWith({ where: { orderId: 'o1' } })
  })

  it('refuse d’annuler une commande en cours de livraison', async () => {
    const { svc, prisma, payments } = makeService()
    prisma.order.findUnique.mockResolvedValue({ ...ORDER, status: 'IN_DELIVERY' })
    await expect(svc.cancel('client1', 'o1')).rejects.toThrow(/ne peut plus être annulée/)
    expect(payments.requestRefund).not.toHaveBeenCalled()
  })
})
