import { useEffect, useState, useCallback, useRef } from 'react'

// Hook générique d'appel API : { data, loading, error, reload, setData }.
// Recharge quand `deps` change.
export function useAsync(fn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fnRef.current())
    } catch (e) {
      setError(e.message || 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const d = await fnRef.current()
        if (alive) setData(d)
      } catch (e) {
        if (alive) setError(e.message || 'Erreur')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload, setData }
}
