import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { api, setToken, getToken } from '../services/api.js'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  const [cart, setCart] = useState({ store: null, items: {} })
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
    setCart({ store: null, items: {} })
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      setUser(await api.me())
    } catch {
      /* ignore */
    }
  }, [])

  // ---------- Panier (une seule enseigne à la fois) ----------
  const addToCart = useCallback((store, product, delta = 1) => {
    setCart((prev) => {
      let base = prev
      if (prev.store && prev.store.id !== store.id && Object.keys(prev.items).length) base = { store, items: {} }
      const current = base.items[product.id]?.qty || 0
      const next = Math.max(0, Math.min(product.stock, current + delta))
      const items = { ...base.items }
      if (next === 0) delete items[product.id]
      else items[product.id] = { product, qty: next }
      return { store: Object.keys(items).length ? store : null, items }
    })
  }, [])

  const clearCart = useCallback(() => setCart({ store: null, items: {} }), [])

  const cartItems = Object.values(cart.items)
  const cartCount = cartItems.reduce((s, it) => s + it.qty, 0)
  const cartSubtotal = cartItems.reduce((s, it) => s + it.product.price * it.qty, 0)

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
