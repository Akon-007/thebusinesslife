import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../../api/client'

/**
 * Loads a single API resource and tracks its loading, error and success states.
 *
 * Deliberately small: the portals only ever need "fetch this path, let me retry
 * it, tell me what went wrong".
 */
export interface ApiResource<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

export function useApi<T>(path: string | null): ApiResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (path === null) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    api<T>(path)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setLoading(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(
          cause instanceof ApiError ? cause.message : 'Could not load this data. Try again.',
        )
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [path, nonce])

  return { data, error, loading, reload }
}
