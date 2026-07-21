// Configuration réseau du frontend. Surchargée par les variables VITE_* au build.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3007/api'
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3007'
export const KKIAPAY_PUBLIC_KEY = import.meta.env.VITE_KKIAPAY_PUBLIC_KEY || ''
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
