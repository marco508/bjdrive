// Configuration réseau du frontend. Surchargée par les variables VITE_* au build.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3007/api'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3007'
export const KKIAPAY_PUBLIC_KEY = import.meta.env.VITE_KKIAPAY_PUBLIC_KEY || ''
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

// Numéro WhatsApp du support (chiffres seuls, ex. "22997000000") — liens masqués si vide.
export const SUPPORT_WHATSAPP = (import.meta.env.VITE_SUPPORT_WHATSAPP || '').replace(/\D/g, '')
export const supportWhatsAppUrl = (text = 'Bonjour BjDrive 👋') =>
  SUPPORT_WHATSAPP ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}` : null

// Origine de l'API sans le préfixe /api — sert à résoudre les URLs d'images (/uploads/...)
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '')

// Résout une URL d'image renvoyée par l'API (chemin relatif /uploads/...)
export function imageSrc(url) {
  if (!url) return null
  return url.startsWith('http') ? url : API_ORIGIN + url
}
