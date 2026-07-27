// Abonnement aux notifications Web Push (VAPID).
// Fonctionne uniquement si l'API a des clés VAPID configurées et si le
// navigateur supporte les notifications (PWA installée ou onglet ouvert).
import { api } from '../services/api.js'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushStatus() {
  if (!pushSupported()) return 'unsupported'
  const { publicKey } = await api.vapidPublicKey().catch(() => ({ publicKey: null }))
  if (!publicKey) return 'unavailable' // serveur sans clés VAPID
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'subscribed' : 'ready'
}

// Demande la permission puis enregistre l'abonnement côté serveur.
export async function enablePush() {
  if (!pushSupported()) throw new Error('Notifications non supportées sur cet appareil.')
  const { publicKey } = await api.vapidPublicKey()
  if (!publicKey) throw new Error('Notifications indisponibles (serveur non configuré).')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permission refusée.')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }))
  const json = sub.toJSON()
  await api.pushSubscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } })
  return true
}

export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    await api.pushUnsubscribe(sub.endpoint).catch(() => {})
    await sub.unsubscribe().catch(() => {})
  }
}
