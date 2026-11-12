// Registra el service worker (caché de la app) y avisa cuando hay una versión nueva.
// Solo en la versión publicada (no en desarrollo).
function mostrarAviso(alTocar) {
  if (document.getElementById('tubysol-update')) return
  const box = document.createElement('div')
  box.id = 'tubysol-update'
  box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:14px;z-index:99999;background:#1a73e8;color:#fff;border-radius:12px;padding:11px 14px;display:flex;align-items:center;gap:10px;font:600 13px Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.3)'
  const txt = document.createElement('span')
  txt.style.flex = '1'
  txt.textContent = 'Hay una versión nueva de TubySol'
  const btn = document.createElement('button')
  btn.textContent = 'Actualizar'
  btn.style.cssText = 'background:#fff;color:#1a73e8;border:none;border-radius:8px;padding:7px 12px;font:700 13px Arial,sans-serif;cursor:pointer'
  btn.onclick = () => { btn.textContent = 'Actualizando…'; alTocar() }
  const x = document.createElement('button')
  x.textContent = '✕'
  x.setAttribute('aria-label', 'Cerrar')
  x.style.cssText = 'background:none;border:none;color:#fff;font-size:16px;cursor:pointer;padding:0 2px'
  x.onclick = () => box.remove()
  box.append(txt, btn, x)
  document.body.appendChild(box)
}

export function registrarSW() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const teniaControl = !!navigator.serviceWorker.controller
  let recargando = false
  // Al activarse la versión nueva (después de tocar "Actualizar") se recarga una sola vez.
  // En la primera instalación no se recarga.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!teniaControl || recargando) return
    recargando = true
    window.location.reload()
  })
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js')
      const avisar = sw => mostrarAviso(() => sw.postMessage('SKIP_WAITING'))
      if (reg.waiting && navigator.serviceWorker.controller) avisar(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const nuevo = reg.installing
        nuevo?.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) avisar(nuevo)
        })
      })
      // Buscar versión nueva al volver a la app y cada 30 min
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {})
      })
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000)
    } catch { /* sin service worker la app anda igual que antes */ }
  })
}
