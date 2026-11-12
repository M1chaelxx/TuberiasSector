import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'

// Respaldo completo de la base (solo lectura): baja cada colección de la app a
// un archivo JSON. Las contraseñas de usuarios y solicitudes NO se incluyen
// (se reemplazan por "***") para que el archivo no sea un riesgo si se pierde.
const COLECCIONES = [
  'soldadura_modelos', 'soldadura_tiempos', 'soldadura_puestos', 'soldadura_secuencia', 'soldadura_visualizadores',
  'tuberia_bd', 'tuberia_tiempos',
  'calidad_auditorias', 'calidad_checklist_soldadura', 'calidad_checklist_producto_terminado',
  'avisos', 'config', 'tubysol_operarios', 'tubysol_usuarios', 'tubysol_solicitudes',
]

function limpiar(nombre, data) {
  if (nombre === 'tubysol_usuarios') {
    const d = { ...data }
    if ('password' in d) d.password = '***'
    if (d.perfiles) {
      d.perfiles = Object.fromEntries(Object.entries(d.perfiles).map(([k, v]) => [k, 'password' in (v || {}) ? { ...v, password: '***' } : v]))
    }
    return d
  }
  if (nombre === 'tubysol_solicitudes') {
    return 'password' in data ? { ...data, password: '***' } : data
  }
  return data
}

export async function descargarRespaldo() {
  const out = { generado: new Date().toISOString(), colecciones: {} }
  const conteo = {}
  for (const nombre of COLECCIONES) {
    const snap = await getDocs(collection(db, nombre))
    out.colecciones[nombre] = Object.fromEntries(snap.docs.map(d => [d.id, limpiar(nombre, d.data())]))
    conteo[nombre] = snap.size
  }
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `Respaldo_TubySol_${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10000)
  return conteo
}
