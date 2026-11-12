// Service worker de TubySol — guarda en el celular/PC SOLO los archivos de la app
// para que abra rápido y también sin buena señal. NO toca Firebase, Cloudinary ni
// ningún dato (esas llamadas son de otro dominio y se dejan pasar tal cual).
// El build reemplaza __BUILD__ y __PRECACHE__ (ver vite.config.js).
const BUILD = '__BUILD__'
const PRECACHE = '__PRECACHE__'
const CACHE = 'tubysol-' + BUILD
const aUrl = p => new URL(p, self.registration.scope).href
const INDEX = () => aUrl('index.html')

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE)
    const lista = Array.isArray(PRECACHE) ? PRECACHE : []
    // Uno por uno: si algún archivo falla no se cae toda la instalación
    await Promise.allSettled(lista.map(p => c.add(new Request(aUrl(p), { cache: 'reload' }))))
  })())
})

// La versión nueva espera hasta que la app lo pida (aviso "Actualizar")
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting() })

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('tubysol-') && k !== CACHE) await caches.delete(k)
    }
    await self.clients.claim()
  })())
})

// La página principal: primero la red (así siempre llega la versión nueva);
// si la red falla o tarda más de 4 s, la copia guardada.
async function pagina(req) {
  const cache = await caches.open(CACHE)
  const red = fetch(req)
  red.then(res => { if (res && res.ok) cache.put(INDEX(), res.clone()) }).catch(() => {})
  try {
    return await Promise.race([
      red,
      new Promise((_, no) => setTimeout(() => no(new Error('lenta')), 4000)),
    ])
  } catch {
    const guardada = await cache.match(INDEX())
    return guardada || red
  }
}

// El resto de los archivos de la app (código con nombre único, imágenes, íconos): primero lo guardado
async function archivo(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res && res.ok && res.type === 'basic') cache.put(req, res.clone())
  return res
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const u = new URL(req.url)
  if (u.origin !== self.location.origin) return // Firebase, Cloudinary, Google: no se tocan
  const esPagina = req.mode === 'navigate' || u.href === aUrl('./') || u.href === INDEX()
  e.respondWith(esPagina ? pagina(req) : archivo(req))
})
