import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { api, setToken, getToken } from '../services/api.js'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  // Panier MULTI-ENSEIGNES : chaque article porte son enseigne.
  const [cart, setCart] = useState({ items: {} })
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  // Au démarrage : si un token existe, on récupère le profil.
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (getToken()) {
        try {
          const me = await api.me()
          if (alive) setUser(me)
        } catch {
          setToken(null)
        }
      }
      if (alive) setAuthReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  const login = useCallback(async (dto) => {
    const { accessToken, user: u } = await api.login(dto)
    setToken(accessToken)
    const me = await api.me()
    setUser(me)
    return u
  }, [])

  const register = useCallback(async (dto) => {
    const { accessToken, user: u } = await api.register(dto)
    setToken(accessToken)
    const me = await api.me()
    setUser(me)
    return u
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    setCart({ items: {} })
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      setUser(await api.me())
    } catch {
      /* ignore */
    }
  }, [])

  // ---------- Panier multi-enseignes ----------
  // store = { id, name, emoji, color, lat, lng, address }
  const addToCart = useCallback((store, product, delta = 1) => {
    setCart((prev) => {
      const current = prev.items[product.id]?.qty || 0
      const next = Math.max(0, Math.min(product.stock ?? 9999, current + delta))
      const items = { ...prev.items }
      if (next === 0) delete items[product.id]
      else items[product.id] = { product, qty: next, store }
      return { items }
    })
  }, [])

  const clearCart = useCallback(() => setCart({ items: {} }), [])

  const cartItems = Object.values(cart.items)
  const cartCount = cartItems.reduce((s, it) => s + it.qty, 0)
  const cartSubtotal = cartItems.reduce((s, it) => s + it.product.price * it.qty, 0)
  // Enseignes distinctes présentes dans le panier
  const cartStores = Object.values(
    cartItems.reduce((acc, it) => {
      acc[it.store.id] = it.store
      return acc
    }, {}),
  )

  const value = {
    user,
    authReady,
    login,
    register,
    logout,
    refreshUser,
    cart,
    cartItems,
    cartCount,
    cartSubtotal,
    cartStores,
    addToCart,
    clearCart,
    toast,
    showToast,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
      {toast && <div className="toast">{toast}</div>}
    </AppContext.Provider>
  )
}
