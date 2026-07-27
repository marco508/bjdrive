import { computeOrderAmounts } from './pricing'

const CFG = { baseDeliveryFee: 500, perKmFee: 100, commissionRate: 0.1 }

describe('computeOrderAmounts', () => {
  it('additionne produits + livraison + commission (commission EN PLUS)', () => {
    const r = computeOrderAmounts(10000, 5000, CFG) // 5 km
    expect(r.deliveryFee).toBe(500 + 5 * 100)
    expect(r.commission).toBe(1000) // 10% du sous-total uniquement
    expect(r.total).toBe(10000 + 1000 + 1000)
  })

  it('arrondit les frais de livraison au FCFA', () => {
    const r = computeOrderAmounts(1000, 1234, CFG) // 1,234 km → 500 + 123,4
    expect(r.deliveryFee).toBe(623)
  })

  it('arrondit la commission au FCFA', () => {
    const r = computeOrderAmounts(1005, 0, CFG) // 100,5 → 101 (ni tronqué ni flottant)
    expect(r.commission).toBe(101)
    expect(Number.isInteger(r.total)).toBe(true)
  })

  it('distance nulle → frais de base seuls', () => {
    const r = computeOrderAmounts(2000, 0, CFG)
    expect(r.deliveryFee).toBe(500)
  })
})
