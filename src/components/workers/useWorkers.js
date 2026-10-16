import { useCallback, useEffect, useRef, useState } from 'react'
import { workersApi } from '../../services/workers.js'
export function useWorkers() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const loading = useRef(null)
  const reload = useCallback(async (fresh = false) => {
    if (loading.current) {
      await loading.current
      if (!fresh) return
    }
    const pending = (async () => {
      try {
        const next = await workersApi()
        if (alive.current) {
          setData(next)
          setError('')
        }
      } catch (e) {
        if (alive.current) {
          setError(e.message)
          if (['ACCESS_DENIED', 'UNAUTHORIZED'].includes(e.message)) setData(null)
        }
      }
    })()
    loading.current = pending
    await pending
    if (loading.current === pending) loading.current = null
  }, [])
  useEffect(() => {
    alive.current = true
    const initial = setTimeout(reload, 0)
    const timer = setInterval(reload, 15000)
    return () => {
      alive.current = false
      clearTimeout(initial)
      clearInterval(timer)
    }
  }, [reload])
  const execute = async (action, body) => {
    setBusy(true)
    setError('')
    try {
      const result = await workersApi(action, body)
      // A poll begun before a mutation must not leave the action's confirmed state stale.
      await reload(true)
      return result
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }
  return { data, error, busy, execute, reload }
}
