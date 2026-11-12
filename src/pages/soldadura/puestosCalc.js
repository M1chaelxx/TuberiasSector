// Cálculos compartidos de Puestos (tiempos estándar por tarea, formatos, takt).

export const PUESTOS_MEDICION = [
  'SOL-01', 'SOL-02', 'SOL-03', 'SOL-04', 'SOL-05', 'SOL-06',
  'SOL-07', 'SOL-08', 'SOL-09', 'SOL-10', 'SOL-11', 'SOL-12',
  'SOL-13', 'SOL-14', 'SOL-15', 'SOL-16', 'SOL-17', 'SOL-18',
  'Preformado',
]

export function fmtNum(n) {
  if (!isFinite(n)) return '—'
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

// Tiempo real dedicado a UNA tarea puntual dentro del turno — aunque la
// cantidad de unidades sea la misma para todas las tareas de un puesto
// (cascada), el tiempo que insume cada una es distinto según su propio
// tiempo estándar. Recibe segundos.
export function fmtDuracionSeg(totalSeg) {
  if (!isFinite(totalSeg) || totalSeg <= 0) return '—'
  const s = Math.round(totalSeg)
  if (s >= 3600) {
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    return `${h}h ${String(m).padStart(2, '0')}m`
  }
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${m}:${String(ss).padStart(2, '0')} min`
}

// Promedio de tiempo normal por unidad, entre las mediciones que tiene un
// código en un puesto puntual — mismo cálculo que statsNorm() de Balance.
export function statsNorm(meds) {
  if (!meds?.length) return { avg: 0, n: 0 }
  const vals = meds.map(m => (m.tiempoNorm || 0) / (m.subconjuntosQty || 1))
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  return { avg, n: vals.length }
}

// Arma la lista de tareas (subconjuntos + parciales con medición propia) con
// su tiempo estándar — el mismo dato que ya usa Balance para "contribution",
// tomado del puesto donde más se midió cada código. La diferencia con
// Balance es que ACÁ el puesto de origen de la medición no se usa para nada
// más: la asignación a un puesto de esta pantalla es 100% manual, porque acá
// "puesto" se entiende como la persona/operario, no la máquina donde se tomó
// el tiempo en su momento.
export function buildTareas(subconjuntos, tiempos) {
  const tareas = []
  for (const s of subconjuntos) {
    const code = s.codCompleto || s.codigo || ''
    if (code) {
      const stats = PUESTOS_MEDICION
        .map(p => ({ ...statsNorm(tiempos[code]?.[p]?.mediciones), puesto: p }))
        .filter(x => x.avg > 0)
      if (stats.length) {
        const best = [...stats].sort((a, b) => b.avg - a.avg)[0]
        tareas.push({ code, desc: s.descGral || s.titulo || code, tStd: best.avg, n: best.n, origen: best.puesto })
      }
    }
    for (const par of (s.parciales || [])) {
      const pcode = par.codParcial || ''
      if (!pcode || pcode === code) continue
      const statsP = PUESTOS_MEDICION
        .map(p => ({ ...statsNorm(tiempos[pcode]?.[p]?.mediciones), puesto: p }))
        .filter(x => x.avg > 0)
      if (!statsP.length) continue
      const bestP = [...statsP].sort((a, b) => b.avg - a.avg)[0]
      tareas.push({ code: pcode, desc: par.descSubc || pcode, tStd: bestP.avg, n: bestP.n, origen: bestP.puesto })
    }
  }
  return tareas
}

// Takt guardado en la pantalla Takt Time ("MM:SS:cc") → centisegundos.
// Mismo parseo que Balance.
export function parseTakt(str) {
  if (!str) return 0
  const parts = String(str).split(':').map(Number)
  if (parts.length === 3) return parts[0] * 6000 + parts[1] * 100 + parts[2]
  if (parts.length === 2) return parts[0] * 6000 + parts[1] * 100
  return 0
}


// Unidades de UNA tarea que se completan por turno / por día. Cada puesto arma
// una unidad de cada tarea por ciclo (cascada), así que un puesto rinde
// (unidades del puesto × cantidad por equipo). Si la tarea está DIVIDIDA entre
// dos puestos (Preformado, ej: 30% / 70%), cada unidad pasa por AMBOS —cada uno
// hace su parte—, entonces se completan tantas como permite el puesto más lento
// y el número es el mismo en los dos. El % solo reparte el tiempo, no la cantidad.
export function unidadesTarea(porPuesto, code) {
  let turno = Infinity
  let dia = Infinity
  for (const p of porPuesto) {
    const t = (p.asignadas || []).find(x => x.code === code)
    if (!t) continue
    turno = Math.min(turno, p.unTurno * t.cant)
    dia = Math.min(dia, p.unDia * t.cant)
  }
  return { turno: isFinite(turno) ? turno : 0, dia: isFinite(dia) ? dia : 0 }
}
