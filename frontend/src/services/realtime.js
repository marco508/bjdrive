// Suivi temps réel via une SEULE connexion WebSocket persistante (Socket.IO).
// Économe en données : websocket uniquement (pas de polling HTTP répété).
import { io } from 'socket.io-client'
import { SOCKET_URL } from '../config.js'

let socket = null
function ensure() {
  if (!socket) {
    socket = io(SOCKET_URL, { transports: ['websocket'], autoConnect: true, reconnection: true })
  }
  return socket
}

// S'abonne à une commande. Renvoie une fonction de désabonnement.
export function trackOrder(orderId, { onUpdate, onDriver, onChat } = {}) {
  const s = ensure()
  const sub = () => s.emit('subscribeOrder', { orderId })
  if (s.connected) sub()
  s.on('connect', sub) // re-souscrit après une reconnexion

  const handleUpdate = (d) => {
    if (!d || (d.id && d.id !== orderId)) return
    onUpdate?.(d)
  }
  const handleDriver = (d) => {
    if (!d || (d.orderId && d.orderId !== orderId)) return
    onDriver?.(d)
  }
  const handleChat = (m) => {
    if (!m || (m.orderId && m.orderId !== orderId)) return
    onChat?.(m)
  }
  s.on('orderUpdate', handleUpdate)
  s.on('driverLocation', handleDriver)
  s.on('chatMessage', handleChat)

  return () => {
    s.emit('unsubscribeOrder', { orderId })
    s.off('connect', sub)
    s.off('orderUpdate', handleUpdate)
    s.off('driverLocation', handleDriver)
    s.off('chatMessage', handleChat)
  }
}

// Diffusion « nouvelle commande disponible » pour le dashboard livreur.
export function onNewOrders(handler) {
  const s = ensure()
  const sub = () => s.emit('subscribeDrivers')
  if (s.connected) sub()
  s.on('connect', sub)
  s.on('newOrderAvailable', handler)
  return () => {
    s.emit('unsubscribeDrivers')
    s.off('connect', sub)
    s.off('newOrderAvailable', handler)
  }
}
