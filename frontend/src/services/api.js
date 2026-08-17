// Client HTTP unique de l'application (web ET, à terme, mobile).
// - Ajoute le JWT automatiquement
// - Renouvelle la session automatiquement (refresh token avec rotation)
// - Économe en données : petit cache local (stale-while-revalidate) pour le catalogue
import { API_URL } from '../config.js'

const TOKEN_KEY = 'bjdrive_token'
const REFRESH_KEY = 'bjdrive_refresh'
let token = (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_KEY)) || null
let refreshToken = (typeof localStorage !== 'undefined' && localStorage.getItem(REFRESH_KEY)) || null

export function setToken(t, r) {
  token = t || null
  if (r !== undefined) refreshToken = r || null
  if (typeof localStorage === 'undefined') return
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
  if (r !== undefined) {
    if (r) localStorage.setItem(REFRESH_KEY, r)
    else localStorage.removeItem(REFRESH_KEY)
  }
}
export function getToken() {
  return token
}
export function getRefreshToken() {
  return refreshToken
}

// Renouvellement de session partagé (une seule requête refresh à la fois).
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
        setToken(data.accessToken, data.refreshToken)
        return true
      } catch {
        return false
      } finally {
        setTimeout(() => (refreshing = null), 0)
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
  // Access token expiré → on tente un refresh puis on rejoue la requête une fois.
  if (res.status === 401 && auth && retry && refreshToken && !path.startsWith('/auth/')) {
    const ok = await tryRefresh()
    if (ok) return req(method, path, body, { auth, retry: false })
    setToken(null, null)
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
const delBody = (p, b, o) => req('DELETE', p, b, o)

// Envoi multipart (photos) — pas de JSON ici.
async function upload(path, file) {
  const fd = new FormData()
  fd.append('file', file)
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let res = await fetch(API_URL + path, { method: 'POST', headers, body: fd })
  if (res.status === 401 && refreshToken) {
    const ok = await tryRefresh()
    if (ok) {
      headers.Authorization = `Bearer ${token}`
      res = await fetch(API_URL + path, { method: 'POST', headers, body: fd })
    }
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data?.message
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg || `Erreur ${res.status}`)
  }
  return data
}

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
  forgotPassword: (email) => post('/auth/forgot', { email }, { auth: false }),
  resetPassword: (token, password) => post('/auth/reset', { token, password }, { auth: false }),
  logoutServer: () => (refreshToken ? post('/auth/logout', { refreshToken }, { auth: false }).catch(() => {}) : Promise.resolve()),

  // ---------- Utilisateur ----------
  me: () => get('/users/me'),
  updateMe: (dto) => patch('/users/me', dto),
  deleteMe: (password) => delBody('/users/me', { password }),
  paymentAccounts: () => get('/users/me/payment-accounts'),
  addPaymentAccount: (dto) => post('/users/me/payment-accounts', dto),
  removePaymentAccount: (id) => del(`/users/me/payment-accounts/${id}`),

  // ---------- Config publique (tarifs affichés, cash autorisé...) ----------
  publicConfig: async () => {
    const cached = cacheGet('publicConfig', 3600e3)
    if (cached && !cached.stale) return cached.data
    try {
      const data = await get('/config/public', { auth: false })
      cacheSet('publicConfig', data)
      return data
    } catch (e) {
      if (cached) return cached.data
      throw e
    }
  },

  // ---------- Notifications push ----------
  vapidPublicKey: () => get('/notifications/vapid-public-key', { auth: false }),
  pushSubscribe: (sub) => post('/notifications/subscribe', sub),
  pushUnsubscribe: (endpoint) => delBody('/notifications/subscribe', { endpoint }),

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
  searchProducts: (q, lat, lng) =>
    get(`/products/search?q=${encodeURIComponent(q || '')}${lat != null && lng != null ? `&lat=${lat}&lng=${lng}` : ''}`, { auth: false }),

  // ---------- Chat de commande (client + enseigne + livreur) ----------
  orderMessages: (orderId) => get(`/orders/${orderId}/messages`),
  sendOrderMessage: (orderId, body) => post(`/orders/${orderId}/messages`, { body }),

  // ---------- Stats d'achat du client ----------
  myStats: () => get('/orders/stats/mine'),

  // ---------- Employés (staff) ----------
  staffMyStore: () => get('/staff/my-store'),
  listStaff: (storeId) => get(`/stores/${storeId}/staff`),
  addStaff: (storeId, dto) => post(`/stores/${storeId}/staff`, dto),
  removeStaff: (storeId, staffId) => del(`/stores/${storeId}/staff/${staffId}`),
  setStaffApprover: (storeId, staffId, canApprove) => patch(`/stores/${storeId}/staff/${staffId}/approver`, { canApprove }),
  adjustStock: (productId, delta, note) => post(`/products/${productId}/stock`, { delta, note }),
  stockRequests: (storeId, status) => get(`/stores/${storeId}/stock-requests${status ? '?status=' + status : ''}`),
  decideStockRequest: (requestId, approved) => post(`/stock-requests/${requestId}/decide`, { approved }),
  findByBarcode: (storeId, code) => get(`/stores/${storeId}/products/barcode/${encodeURIComponent(code)}`),
  completePickup: (orderId, storeId, code) => post(`/orders/${orderId}/store/${storeId}/complete-pickup`, { code }),
  confirmHandover: (orderId, storeId) => post(`/orders/${orderId}/store/${storeId}/handover`),
  confirmReturn: (orderId, storeId) => post(`/orders/${orderId}/store/${storeId}/return`),

  // ---------- Manager ----------
  myStores: () => get('/stores/mine'),
  myStore: (id) => get(`/stores/mine/${id}`),
  createStore: (dto) => post('/stores', dto),
  updateStore: (id, dto) => patch(`/stores/${id}`, dto),
  uploadStoreImage: (id, file) => upload(`/stores/${id}/image`, file),
  addProduct: (storeId, dto) => post(`/stores/${storeId}/products`, dto),
  importProducts: (storeId, products) => post(`/stores/${storeId}/products/import`, { products }),
  updateProduct: (id, dto) => patch(`/products/${id}`, dto),
  uploadProductImage: (id, file) => upload(`/products/${id}/image`, file),
  removeProduct: (id) => del(`/products/${id}`),
  storeOrders: (storeId) => get(`/orders/store/${storeId}`),
  markStoreReady: (orderId, storeId) => post(`/orders/${orderId}/store/${storeId}/ready`),

  // ---------- Commandes (client) ----------
  createOrder: (dto) => post('/orders', dto),
  myOrders: () => get('/orders/mine'),
  order: (id) => get(`/orders/${id}`),
  rescheduleOrder: (id, iso) => patch(`/orders/${id}/schedule`, { scheduledDeliveryAt: iso }),
  cancelOrder: (id) => post(`/orders/${id}/cancel`),
  reviewOrder: (id, dto) => post(`/orders/${id}/review`, dto),

  // ---------- Paiement ----------
  initiatePayment: (orderId) => post(`/payments/${orderId}/initiate`),
  confirmPayment: (orderId, transactionId) => post(`/payments/${orderId}/confirm`, { transactionId }),

  // ---------- Livreur ----------
  availableDeliveries: (lat, lng, radius) => get(`/deliveries/available?lat=${lat}&lng=${lng}${radius ? '&radius=' + radius : ''}`),
  myDeliveries: () => get('/deliveries/mine'),
  myEarnings: (days = 30) => get(`/deliveries/earnings?days=${days}`),
  acceptDelivery: (orderId) => post(`/deliveries/accept/${orderId}`),
  pickupStore: (orderId, storeId) => post(`/deliveries/${orderId}/pickup/${storeId}`),
  completeDelivery: (orderId, code) => post(`/deliveries/${orderId}/complete`, { code }),
  failDelivery: (orderId, reason) => post(`/deliveries/${orderId}/fail`, { reason }),
  sendLocation: (lat, lng) => post('/deliveries/location', { lat, lng }),
  setAvailability: (isAvailable) => patch('/deliveries/availability', { isAvailable }),

  // ---------- Super-admin ----------
  adminOverview: () => get('/admin/overview'),
  adminStores: (status) => get(`/admin/stores${status ? '?status=' + status : ''}`),
  adminVerifyStore: (id, dto) => post(`/admin/stores/${id}/verify`, dto),
  adminSuspendStore: (id, suspended) => patch(`/admin/stores/${id}/suspend`, { suspended }),
  adminBanStore: (id, reason) => post(`/admin/stores/${id}/ban`, { reason }),
  adminDeleteStore: (id) => del(`/admin/stores/${id}`),
  adminDrivers: (status) => get(`/admin/drivers${status ? '?status=' + status : ''}`),
  adminVerifyDriver: (userId, dto) => post(`/admin/drivers/${userId}/verify`, dto),
  adminSuspendDriver: (userId, suspended) => patch(`/admin/drivers/${userId}/suspend`, { suspended }),
  adminRefunds: () => get('/admin/refunds'),
  adminRetryRefund: (orderId) => post(`/admin/refunds/${orderId}/retry`),
  adminMarkRefunded: (orderId, reference) => post(`/admin/refunds/${orderId}/mark-refunded`, { reference }),
  adminBalances: () => get('/admin/balances'),
  adminPayouts: (userId) => get(`/admin/payouts${userId ? '?userId=' + userId : ''}`),
  adminCreatePayout: (dto) => post('/admin/payouts', dto),
  adminOrders: (status) => get(`/admin/orders${status ? '?status=' + status : ''}`),
  adminResetCode: (orderId) => post(`/admin/orders/${orderId}/reset-code`),
  adminConfig: () => get('/admin/config'),
  adminUpdateConfig: (dto) => patch('/admin/config', dto),
  adminUsers: (role) => get(`/admin/users${role ? '?role=' + role : ''}`),
}
