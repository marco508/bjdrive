// Calcul des montants d'une commande (extrait pour être testable sans base).
// La commission est ajoutée EN PLUS du total : le client la paie, la plateforme l'encaisse.
export interface PricingConfig {
  baseDeliveryFee: number
  perKmFee: number
  commissionRate: number
}

export interface OrderAmounts {
  deliveryFee: number
  commission: number
  total: number
}

export function computeOrderAmounts(subtotal: number, meters: number, cfg: PricingConfig): OrderAmounts {
  const deliveryFee = Math.round(cfg.baseDeliveryFee + (meters / 1000) * cfg.perKmFee)
  const commission = Math.round(subtotal * cfg.commissionRate)
  return { deliveryFee, commission, total: subtotal + deliveryFee + commission }
}
