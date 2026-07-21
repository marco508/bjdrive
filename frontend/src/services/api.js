// Client HTTP unique de l'application (web ET, à terme, mobile).
// - Ajoute le JWT automatiquement
// - Économe en données : petit cache local (stale-while-revalidate) pour le catalogue
import { API_URL } from '../config.js'

const TOKEN_KEY = 'bjdrive_token'
let token = (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_KEY)) || null

export function setToken(t) {
  token = t || null
  if (typeof localStorage === 'undefined') return
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}
export function getToken() {
  return token
}

async function req(method, path, body, { auth = true } = {}) {
  const headers = {}
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (auth && token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(API_URL + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error('Connexion au serveur impossible. Vérifiez votre réseau.')
  }
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const msg = data?.message
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg || `Erreur ${res.status}`)
  }
  return data
}
function safeJson(t) {
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

const get = (p, o) => req('GET', p, undefined, o)
const post = (p, b, o) => req('POST', p, b, o)
const patch = (p, b, o) => req('PATCH', p, b, o)
const del = (p, o) => req('DELETE', p, undefined, o)

// --- petit cache local pour limiter la consommation de données ---
function cacheGet(key, maxAgeMs) {
  try {
    const raw = localStorage.getItem('cache_' + key)
    if (!raw) return null
    const { at, data } = JSON.parse(raw)
    if (Date.now() - at > maxAgeMs) return { stale: true, data }
    return { stale: false, data }
  } catch {
    return null
  }
}
function cacheSet(key, data) {
  try {
    localStorage.setItem('cache_' + key, JSON.stringify({ at: Date.now(), data }))
  } catch {
    /* quota */
  }
}

export const api = {
  // ---------- Auth ----------
  register: (dto) => post('/auth/register', dto, { auth: false }),
  login: (dto) => post('/auth/login', dto, { auth: false }),

  // ---------- Utilisateur ----------
  me: () => get('/users/me'),
  updateMe: (dto) => patch('/users/me', dto),
  paymentAccounts: () => get('/users/me/payment-accounts'),
  addPaymentAccount: (dto) => post('/users/me/payment-accounts', dto),
  removePaymentAccount: (id) => del(`/users/me/payment-accounts/${id}`),

  // ---------- Catalogue (public) ----------
  categories: async () => {
    const cached = cacheGet('categories', 6 * 3600e3)
    if (cached && !cached.stale) return cached.data
    try {
      const data = await get('/categories', { auth: false })
      cacheSet('categories', data)
      return data
    } catch (e) {
      if (cached) return cached.data // hors-ligne : on sert le cache
      throw e
    }
  },
  stores: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null),
    ).toString()
    return get(`/stores${q ? '?' + q : ''}`, { auth: false })
  },
  store: (id) => get(`/stores/${id}`, { auth: false }),

  // ---------- Manager ----------
  myStores: () => get('/stores/mine'),
  myStore: (id) => get(`/stores/mine/${id}`),
  createStore: (dto) => post('/stores', dto),
  updateStore: (id, dto) => patch(`/stores/${id}`, dto),
  addProduct: (storeId, dto) => post(`/stores/${storeId}/products`, dto),
  importProducts: (storeId, products) => post(`/stores/${storeId}/products/import`, { products }),
  updateProduct: (id, dto) => patch(`/products/${id}`, dto),
  removeProduct: (id) => del(`/products/${id}`),
  storeOrders: (storeId) => get(`/orders/store/${storeId}`),

  // ---------- Commandes (client) ----------
  createOrder: (dto) => post('/orders', dto),
  myOrders: () => get('/orders/mine'),
  order: (id) => get(`/orders/${id}`),
  rescheduleOrder: (id, iso) => patch(`/orders/${id}/schedule`, { scheduledDeliveryAt: iso }),
  cancelOrder: (id) => post(`/orders/${id}/cancel`),

  // ---------- Paiement ----------
  initiatePayment: (orderId) => post(`/payments/${orderId}/initiate`),
  confirmPayment: (orderId, transactionId) => post(`/payments/${orderId}/confirm`, { transactionId }),

  // ---------- Livreur ----------
  availableDeliveries: (lat, lng, radius) => get(`/deliveries/available?lat=${lat}&lng=${lng}${radius ? '&radius=' + radius : ''}`),
  myDeliveries: () => get('/deliveries/mine'),
  acceptDelivery: (orderId) => post(`/deliveries/accept/${orderId}`),
  pickupDelivery: (orderId) => post(`/deliveries/${orderId}/pickup`),
  completeDelivery: (orderId, code) => post(`/deliveries/${orderId}/complete`, { code }),
  sendLocation: (lat, lng) => post('/deliveries/location', { lat, lng }),
  setAvailability: (isAvailable) => patch('/deliveries/availability', { isAvailable }),

  // ---------- Super-admin ----------
  adminOverview: () => get('/admin/overview'),
  adminStores: (status) => get(`/admin/stores${status ? '?status=' + status : ''}`),
  adminVerifyStore: (id, dto) => post(`/admin/stores/${id}/verify`, dto),
  adminConfig: () => get('/admin/config'),
  adminUpdateConfig: (dto) => patch('/admin/config', dto),
  adminUsers: (role) => get(`/admin/users${role ? '?role=' + role : ''}`),
}
