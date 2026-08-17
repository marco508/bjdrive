// Statuts de commande — alignés sur le backend (enum OrderStatus).
export const STATUS_LABELS = {
  PENDING_PAYMENT: 'En attente de paiement',
  AWAITING_DRIVER: "En attente d'un livreur",
  AWAITING_PICKUP: 'Récupération au magasin',
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
  DELIVERED: '🏠',
  RETURNING: '↩️',
  FAILED: '⚠️',
  CANCELLED: '❌',
}

// Étapes affichées au client après paiement.
export const ORDER_FLOW = ['AWAITING_DRIVER', 'AWAITING_PICKUP', 'IN_DELIVERY', 'DELIVERED']

export const STORE_STATUS_LABELS = {
  PENDING: 'En attente de vérification',
  VERIFIED: 'Vérifiée',
  REJECTED: 'Refusée',
  SUSPENDED: 'Suspendue',
  BANNED: 'Bloquée définitivement',
}
