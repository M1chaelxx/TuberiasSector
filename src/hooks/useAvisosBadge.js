import { useEffect, useRef } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'

const LAST_SEEN_KEY = 'avisos_last_seen'

function toMs(ts) {
  if (!ts) return 0
  return ts.toMillis ? ts.toMillis() : new Date(ts).getTime()
}

function setBadge(count) {
  if (!('setAppBadge' in navigator)) return
  if (count > 0) navigator.setAppBadge(count).catch(() => {})
  else navigator.clearAppBadge?.().catch(() => {})
}

function notify(aviso) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification(`📋 ${aviso.titulo || 'Nuevo aviso'}`, {
      body: aviso.descripcion || '',
      tag: 'avisos-tubysol',
    })
  } catch {}
}

// Muestra la burbujita roja en el ícono de la app (PWA instalada) con la
// cantidad de avisos nuevos creados desde la última vez que se visitó el tablón,
// y dispara una notificación del navegador mientras la app está abierta.
export function useAvisosBadge(enabled, currentUserDisplay) {
  const knownIdsRef = useRef(null) // null = todavía no se cargó el primer snapshot

  useEffect(() => {
    if (!enabled) { setBadge(0); knownIdsRef.current = null; return }

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }

    const unsub = onSnapshot(collection(db, 'avisos'), snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))

      if (knownIdsRef.current === null) {
        // Primera carga: no notificar avisos ya existentes, solo sembrar el set.
        knownIdsRef.current = new Set(docs.map(d => d.id))
      } else {
        const nuevosDocs = docs.filter(d => !knownIdsRef.current.has(d.id))
        for (const a of nuevosDocs) {
          if (a.creadoPor && a.creadoPor === currentUserDisplay) continue
          notify(a)
        }
        knownIdsRef.current = new Set(docs.map(d => d.id))
      }

      const lastSeen = parseInt(localStorage.getItem(LAST_SEEN_KEY) || '0', 10)
      const pendientesNuevos = docs.filter(a => toMs(a.creadoEn) > lastSeen).length
      setBadge(pendientesNuevos)
    }, () => {})
    return unsub
  }, [enabled, currentUserDisplay])
}

// Llamar al entrar al tablón de avisos para marcar todo como visto y limpiar el badge.
export function marcarAvisosVistos() {
  localStorage.setItem(LAST_SEEN_KEY, String(Date.now()))
  setBadge(0)
}
