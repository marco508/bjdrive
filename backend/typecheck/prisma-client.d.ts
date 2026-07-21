// Stub de types pour @prisma/client — UNIQUEMENT pour la vérification TypeScript
// dans un environnement sans accès au générateur Prisma. Non utilisé au runtime.
export enum Role {
  CLIENT = 'CLIENT',
  MANAGER = 'MANAGER',
  DRIVER = 'DRIVER',
  SUPERADMIN = 'SUPERADMIN',
}
export enum StoreStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}
export enum VerificationMethod {
  ONSITE = 'ONSITE',
  VIDEO = 'VIDEO',
}
export enum OrderStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  AWAITING_DRIVER = 'AWAITING_DRIVER',
  AWAITING_PICKUP = 'AWAITING_PICKUP',
  IN_DELIVERY = 'IN_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}
export enum PaymentStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}
export enum PaymentProvider {
  KKIAPAY = 'KKIAPAY',
  MTN_MOMO = 'MTN_MOMO',
  MOOV_MONEY = 'MOOV_MONEY',
  BANK_CARD = 'BANK_CARD',
  BANK_ACCOUNT = 'BANK_ACCOUNT',
}

export namespace Prisma {
  type ProductCreateManyInput = any
  type ProductCreateManyStoreInput = any
  type OrderItemCreateManyOrderInput = any
}

type Delegate = {
  findUnique: (args?: any) => Promise<any>
  findFirst: (args?: any) => Promise<any>
  findMany: (args?: any) => Promise<any[]>
  create: (args?: any) => Promise<any>
  createMany: (args?: any) => Promise<any>
  update: (args?: any) => Promise<any>
  updateMany: (args?: any) => Promise<any>
  upsert: (args?: any) => Promise<any>
  delete: (args?: any) => Promise<any>
  deleteMany: (args?: any) => Promise<any>
  count: (args?: any) => Promise<number>
  aggregate: (args?: any) => Promise<any>
}

export class PrismaClient {
  user: Delegate
  paymentAccount: Delegate
  category: Delegate
  store: Delegate
  product: Delegate
  order: Delegate
  orderItem: Delegate
  orderStore: Delegate
  orderStatusHistory: Delegate
  delivery: Delegate
  driverProfile: Delegate
  payment: Delegate
  appConfig: Delegate
  $connect(): Promise<void>
  $disconnect(): Promise<void>
  $transaction(arg: any): Promise<any>
  $queryRawUnsafe<T = any>(query: string, ...values: any[]): Promise<T>
  $executeRawUnsafe(query: string, ...values: any[]): Promise<any>
}
