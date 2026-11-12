import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Al terminar el build completa public/sw.js: número de versión del build y la lista
// de archivos de la app que el service worker guarda para abrir rápido / sin señal.
function swBuild() {
  return {
    name: 'tubysol-sw-build',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist')
      const swPath = path.join(dist, 'sw.js')
      if (!fs.existsSync(swPath)) return
      const archivos = []
      const recorrer = d => {
        for (const f of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, f.name)
          if (f.isDirectory()) recorrer(p)
          else archivos.push(path.relative(dist, p).split(path.sep).join('/'))
        }
      }
      recorrer(dist)
      const lista = ['./', ...archivos.filter(f => f !== 'sw.js')]
      const src = fs.readFileSync(swPath, 'utf8')
        .replace("'__BUILD__'", JSON.stringify(String(Date.now())))
        .replace("'__PRECACHE__'", JSON.stringify(lista))
      fs.writeFileSync(swPath, src)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), swBuild()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 3000,
  },
})
