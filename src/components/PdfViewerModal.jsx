import { useEffect, useState } from 'react'

// Visor de PDF a pantalla completa dentro de la misma app, en vez de abrir
// una pestaña nueva del navegador (que en la PWA instalada se siente como
// "salir" de la app).
//
// Se renderiza con el visor de Google Docs (docs.google.com/viewer) en vez
// de apuntar el <iframe> directo al PDF: la PWA instalada en Android corre
// sobre un WebView sin lector de PDF nativo, así que cargar el PDF directo
// dispara el selector del sistema ("¿Con qué abrir?") en vez de mostrarlo.
// El visor de Google es una página web común (dibuja el PDF, no lo abre como
// archivo), así que se ve igual pero sin ese cartel intermedio.
export default function PdfViewerModal({ url, onClose }) {
  // El viewport de la app tiene user-scalable=no (para que no se desplace la
  // pantalla sin querer al usar el cronómetro) — eso también bloquea el
  // pellizco para hacer zoom acá, donde sí hace falta para ver detalles del
  // plano. Se habilita mientras el visor está abierto y se restaura al cerrar.
  useEffect(() => {
    if (!url) return
    const meta = document.querySelector('meta[name="viewport"]')
    const prev = meta?.getAttribute('content')
    meta?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes')
    return () => { if (meta && prev) meta.setAttribute('content', prev) }
  }, [url])

  // El visor de Google a veces falla de forma intermitente (timeout de su
  // lado, o queda cacheado un intento fallido anterior) y muestra su propia
  // pantalla de error en vez del PDF. "Reintentar" cambia la URL que se le
  // pide (un parámetro extra que Cloudinary ignora) para forzar que Google
  // la trate como un pedido nuevo en vez de repetir el que falló.
  const [intento, setIntento] = useState(0)
  useEffect(() => { setIntento(0) }, [url])

  if (!url) return null
  const urlConCache = intento > 0 ? `${url}${url.includes('?') ? '&' : '?'}_r=${intento}` : url
  const viewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(urlConCache)}&embedded=true`
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#222', zIndex: 300,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, background: '#111', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setIntento(n => n + 1)}
            style={{
              background: '#333', color: '#fff', border: 'none', borderRadius: 18, padding: '8px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >🔄 Reintentar</button>
          <button
            onClick={() => window.open(url, '_blank')}
            style={{
              background: '#333', color: '#fff', border: 'none', borderRadius: 18, padding: '8px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >⬇ Abrir directo</button>
        </div>
        <button
          onClick={onClose}
          style={{
            background: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36,
            fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >×</button>
      </div>
      <iframe key={intento} src={viewerUrl} title="Visualizador PDF" style={{ flex: 1, border: 'none', background: '#fff' }} />
    </div>
  )
}
