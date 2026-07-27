// Configuration réseau de l'app mobile.
// En développement, pointez vers l'IP LAN de votre machine (voir README) :
//   ex. apiUrl: "http://192.168.1.20:3007/api"
import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra || {}

export const API_URL = extra.apiUrl || 'https://bjdrive.dkpsolution.tech/api'
export const SOCKET_URL = extra.socketUrl || 'https://bjdrive.dkpsolution.tech'
export const WEB_URL = extra.webUrl || 'https://bjdrive.dkpsolution.tech'

// Origine de l'API sans /api — pour résoudre les URLs d'images (/uploads/...)
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '')
export function imageSrc(url) {
  if (!url) return null
  return url.startsWith('http') ? url : API_ORIGIN + url
}
