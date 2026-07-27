// Client HTTP de l'app mobile — même contrat que le web (services/api.js),
// avec AsyncStorage à la place de localStorage et le même refresh automatique.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { API_URL } from './config'

const TOKEN_KEY = 'bjdrive_token'
const REFRESH_KEY = 'bjdrive_refresh'
let token = null
let refreshToken = null

// À appeler au démarrage (AppProvider) avant toute requête authentifiée.
export async function loadTokens() {
  token = await AsyncStorage.getItem(TOKEN_KEY)
  refreshToken = await AsyncStorage.getItem(REFRESH_KEY)
  return { token, refreshToken }
}

export async function setTokens(t, r) {
  token = t || null
  refreshToken = r || null
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t)
  else await AsyncStorage.removeItem(TOKEN_KEY)
  if (r) await AsyncStorage.setItem(REFRESH_KEY, r)
  else await AsyncStorage.removeItem(REFRESH_KEY)
}

export function getToken() {
  return token
}

let refreshing = null
async function tryRefresh() {
  if (!refreshToken) return false
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(API_URL + '/auth/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) return false
        const data = await res.json()
        await setTokens(data.accessToken, data.refreshToken)
        return true
      } catch {
        return false
      } finally {
        setTimeout(() => {
          refreshing = null
        }, 0)
      }
    })()
  }
  return refreshing
}

async function req(method, path, body, { auth = true, retry = true } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (auth && token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(API_URL + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error('Connexion au serveur impossible. Vérifiez votre réseau.')
  }
  if (res.status === 401 && auth && retry && refreshToken && !path.startsWith('/auth/')) {
    const ok = await tryRefresh()
    if (ok) return req(method, path, body, { auth, retry: false })
    await setTokens(null, null)
  }
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {}
  if (!res.ok) {
    const msg = data?.message
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg || `Erreur ${res.status}`)
  }
  return data
}

const get = (p, o) => req('GET', p, undefined, o)
const post = (p, b, o) => req('POST', p, b, o)
const patch = (p, b, o) => req('PATCH', p, b, o)
const del = (p, o) => req('DELETE', p, undefined, o)

export const api = {
  // Auth
  register: (dto) => post('/auth/register', dto, { auth: false }),
  login: (dto) => post('/auth/login', dto, { auth: false }),
  logoutServer: () => (refreshToken ? post('/auth/logout', { refreshToken }, { auth: false }).catch(() => {}) : Promise.resolve()),

  // Utilisateur
  me: () => get('/users/me'),
  updateMe: (dto) => patch('/users/me', dto),

  // Config publique
  publicConfig: () => get('/config/public', { auth: false }),

  // Catalogue
  categories: () => get('/categories', { auth: false }),
  stores: (params = {}) => {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    const q = entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    return get(`/stores${q ? '?' + q : ''}`, { auth: false })
  },
  store: (id) => get(`/stores/${id}`, { auth: false }),
  searchProducts: (q, lat, lng) =>
    get(`/products/search?q=${encodeURIComponent(q || '')}${lat != null && lng != null ? `&lat=${lat}&lng=${lng}` : ''}`, { auth: false }),

  // Commandes (client)
  createOrder: (dto) => post('/orders', dto),
  myOrders: () => get('/orders/mine'),
  order: (id) => get(`/orders/${id}`),
  cancelOrder: (id) => post(`/orders/${id}/cancel`),
  reviewOrder: (id, dto) => post(`/orders/${id}/review`, dto),

  // Paiement
  initiatePayment: (orderId) => post(`/payments/${orderId}/initiate`),
  confirmPayment: (orderId, transactionId) => post(`/payments/${orderId}/confirm`, { transactionId }),

  // Livreur
  availableDeliveries: (lat, lng, radius) => get(`/deliveries/available?lat=${lat}&lng=${lng}${radius ? '&radius=' + radius : ''}`),
  myDeliveries: () => get('/deliveries/mine'),
  myEarnings: (days = 30) => get(`/deliveries/earnings?days=${days}`),
  acceptDelivery: (orderId) => post(`/deliveries/accept/${orderId}`),
  pickupStore: (orderId, storeId) => post(`/deliveries/${orderId}/pickup/${storeId}`),
  completeDelivery: (orderId, code) => post(`/deliveries/${orderId}/complete`, { code }),
  sendLocation: (lat, lng) => post('/deliveries/location', { lat, lng }),
  setAvailability: (isAvailable) => patch('/deliveries/availability', { isAvailable }),

  // Manager
  myStores: () => get('/stores/mine'),
  myStore: (id) => get(`/stores/mine/${id}`),
  createStore: (dto) => post('/stores', dto),
  updateStore: (id, dto) => patch(`/stores/${id}`, dto),
  addProduct: (storeId, dto) => post(`/stores/${storeId}/products`, dto),
  updateProduct: (id, dto) => patch(`/products/${id}`, dto),
  removeProduct: (id) => del(`/products/${id}`),
  storeOrders: (storeId) => get(`/orders/store/${storeId}`),
  markStoreReady: (orderId, storeId) => post(`/orders/${orderId}/store/${storeId}/ready`),

  // Admin (vue synthétique — gestion complète sur le web)
  adminOverview: () => get('/admin/overview'),
}
