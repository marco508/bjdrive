// Contexte global : session (auth + refresh) et panier multi-enseignes.
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, loadTokens, setTokens, getToken } from './api'

const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [cart, setCart] = useState({ items: {} })

  useEffect(() => {
    let alive = true
    ;(async () => {
      await loadTokens()
      if (getToken()) {
        try {
          const me = await api.me()
          if (alive) setUser(me)
        } catch {
          await setTokens(null, null)
        }
      }
      if (alive) setAuthReady(true)
    })()
    return () => {
      alive = false
    }
  }, [])

  const login = useCallback(async (dto) => {
    const { accessToken, refreshToken } = await api.login(dto)
    await setTokens(accessToken, refreshToken)
    const me = await api.me()
    setUser(me)
    return me
  }, [])

  const register = useCallback(async (dto) => {
    const { accessToken, refreshToken } = await api.register(dto)
    await setTokens(accessToken, refreshToken)
    const me = await api.me()
    setUser(me)
    return me
  }, [])

  const logout = useCallback(async () => {
    api.logoutServer()
    await setTokens(null, null)
    setUser(null)
    setCart({ items: {} })
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      setUser(await api.me())
    } catch {}
  }, [])

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
  const cartStores = Object.values(
    cartItems.reduce((acc, it) => {
      acc[it.store.id] = it.store
      return acc
    }, {}),
  )

  return (
    <AppContext.Provider
      value={{ user, authReady, login, register, logout, refreshUser, cart, cartItems, cartCount, cartSubtotal, cartStores, addToCart, clearCart }}
    >
      {children}
    </AppContext.Provider>
  )
}
