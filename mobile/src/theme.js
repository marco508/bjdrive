// Charte BjDrive (identique au web).
export const C = {
  green: '#0a7d3c',
  greenDark: '#075c2c',
  greenSoft: '#e6f4ec',
  yellow: '#ffce00',
  red: '#e8112d',
  ink: '#12211a',
  muted: '#6b7c73',
  line: '#e7ede9',
  bg: '#f6f8f7',
  card: '#ffffff',
}

export const STATUS_LABELS = {
  PENDING_PAYMENT: 'En attente de paiement',
  AWAITING_DRIVER: 'Recherche d’un livreur',
  AWAITING_PICKUP: 'Livreur en route vers l’enseigne',
  IN_DELIVERY: 'En cours de livraison',
  DELIVERED: 'Livrée',
  RETURNING: 'Retour à l’enseigne',
  FAILED: 'Non livrée',
  CANCELLED: 'Annulée',
}

export const STATUS_ICON = {
  PENDING_PAYMENT: '💳',
  AWAITING_DRIVER: '🔎',
  AWAITING_PICKUP: '🏪',
  IN_DELIVERY: '🛵',
  DELIVERED: '✅',
  RETURNING: '↩️',
  FAILED: '⚠️',
  CANCELLED: '❌',
}

export const ORDER_FLOW = ['AWAITING_DRIVER', 'AWAITING_PICKUP', 'IN_DELIVERY', 'DELIVERED']

export function formatFCFA(n) {
  return `${Number(n || 0).toLocaleString('fr-FR')} F`
}
