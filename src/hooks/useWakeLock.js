import { useRef, useCallback, useEffect } from 'react'

// Mantiene la pantalla encendida mientras el cronómetro está corriendo.
// Se re-adquiere automáticamente si el navegador la libera al cambiar de pestaña.
export function useWakeLock() {
  const sentinelRef = useRef(null)
  const wantedRef = useRef(false)

  const request = useCallback(async () => {
    wantedRef.current = true
    if (!('wakeLock' in navigator) || sentinelRef.current) return
    try {
      sentinelRef.current = await navigator.wakeLock.request('screen')
      sentinelRef.current.addEventListener('release', () => {
        sentinelRef.current = null
      })
    } catch {
      sentinelRef.current = null
    }
  }, [])

  const release = useCallback(() => {
    wantedRef.current = false
    if (sentinelRef.current) {
      sentinelRef.current.release().catch(() => {})
      sentinelRef.current = null
    }
  }, [])

  useEffect(() => {
    function onVisibilityChange() {
      if (wantedRef.current && document.visibilityState === 'visible') request()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      release()
    }
  }, [request, release])

  return { request, release }
}
