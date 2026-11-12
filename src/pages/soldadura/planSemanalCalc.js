import { claveModelo } from './secuenciaExcel'
import { buildTareas } from './puestosCalc'

// Cálculo del Plan semanal / mensual: cuánto tiempo necesita cada puesto cada día para
// los equipos que pide la secuencia, contra el tiempo disponible del turno.
// El "Puesto N" de un modelo es el mismo puesto/persona que el "Puesto N" de
// los otros modelos de la línea (se une por nombre). Sin Firestore.

export const PLAN_A_SOL = { 'IDU': 'IDU', 'ODU I': 'ODU', 'ODU II': 'ODU2' }
export const PLAN_LINEAS = ['IDU', 'ODU I', 'ODU II']

const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '')
const DIA_MS = 864e5
const utc = iso => new Date(iso + 'T00:00:00Z')
const iso = d => d.toISOString().slice(0, 10)

export function lunesDe(fechaISO) {
  const d = utc(fechaISO)
  const dow = (d.getUTCDay() + 6) % 7 // lunes = 0
  return iso(new Date(d.getTime() - dow * DIA_MS))
}

export function diasDeSemana(lunes, conDomingo) {
  const n = conDomingo ? 7 : 6
  return Array.from({ length: n }, (_, i) => iso(new Date(utc(lunes).getTime() + i * DIA_MS)))
}

// Une el `diario` de todos los meses cargados → { 'YYYY-MM-DD': { linea: {turnos, items} } }
export function unirDiario(docs) {
  const out = {}
  docs.forEach(d => Object.entries(d.diario || {}).forEach(([f, v]) => { out[f] = v }))
  return out
}

// Lunes de las semanas que tienen producción en alguna línea
export function semanasDe(diario) {
  const set = new Set()
  Object.entries(diario).forEach(([f, lineas]) => {
    if (Object.values(lineas).some(l => (l.items || []).some(i => i.qty > 0))) set.add(lunesDe(f))
  })
  return [...set].sort()
}

// Meses (YYYY-MM) que tienen producción en alguna línea
export function mesesDe(diario) {
  const set = new Set()
  Object.entries(diario).forEach(([f, lineas]) => {
    if (Object.values(lineas).some(l => (l.items || []).some(i => i.qty > 0))) set.add(f.slice(0, 7))
  })
  return [...set].sort()
}

// Días del mes con producción en la línea (el plan mensual muestra solo esos)
export function diasDeMes(diario, mes, planLinea) {
  return Object.keys(diario)
    .filter(f => f.startsWith(mes) && (diario[f]?.[planLinea]?.items || []).some(i => i.qty > 0))
    .sort()
}

// Qué falta (o no) de cada modelo del plan para poder calcularlo
function prepararModelo(it, planLinea, modelos, tiemposAll, puestosAll) {
  const base = { plataforma: it.plataforma, cap: it.cap, estado: '', puestos: {}, sinAsignar: 0, md: null }
  const md = modelos.find(m => claveModelo(m.modelo || m.id) === claveModelo(it.plataforma) && norm(m.cap) === norm(it.cap))
  if (!md) return { ...base, estado: 'Falta armar: el modelo no está cargado en la app' }
  const solLinea = PLAN_A_SOL[planLinea]
  const subs = (md.subconjuntos || []).filter(s => (!s.tipo || s.tipo === 'Completo') && norm(s.linea) === norm(solLinea))
  if (!subs.length) return { ...base, md, estado: `Falta armar: sin subconjuntos en la línea ${solLinea}` }
  const lineaExacta = subs[0].linea
  const tareas = buildTareas(subs, tiemposAll[md.id] || {})
  if (!tareas.length) return { ...base, md, estado: 'Falta armar: sin tiempos medidos' }
  const pd = puestosAll[`${md.id}||${lineaExacta}`]
  if (!pd || !(pd.puestos || []).length || !(pd.asignaciones || []).length) {
    return { ...base, md, estado: 'Falta armar: sin puestos asignados' }
  }
  const cants = pd.cantidades || {}
  const puestos = {}
  let sinAsignar = 0
  for (const t of tareas) {
    const asigs = (pd.asignaciones || []).filter(a => a.code === t.code)
    if (!asigs.length) { sinAsignar++; continue }
    const cant = Number(cants[t.code]) || 1
    for (const a of asigs) {
      const p = (pd.puestos || []).find(x => x.id === a.puestoId)
      if (!p) { continue }
      const key = norm(p.nombre)
      const share = (a.pct ?? 100) / 100
      const lista = (puestos[key] ||= { label: p.nombre, tareas: [] })
      lista.tareas.push({ code: t.code, desc: t.desc, cant, share, segUnidad: (t.tStd / 100) * cant * share })
    }
  }
  const aviso = sinAsignar ? `${sinAsignar} tarea(s) sin asignar a un puesto (no cuentan)` : ''
  return { ...base, md, puestos, sinAsignar, estado: aviso, ok: true, horas: pd.horasTurno, efic: pd.eficPct }
}

// turnosOverride: { 'YYYY-MM-DD': n } — turnos cargados a mano en la pantalla,
// mandan sobre los del Excel.
// fechasFijas: días a calcular (plan mensual); si no viene, la semana de `lunes`.
export function calcularPlan({ diario, lunes, fechas: fechasFijas, planLinea, modelos, tiemposAll, puestosAll, horas, efic, turnosOverride = {} }) {
  const conDomingo = !fechasFijas && diasDeSemana(lunes, true).slice(6).some(f => (diario[f]?.[planLinea]?.items || []).some(i => i.qty > 0))
  const fechas = fechasFijas || diasDeSemana(lunes, conDomingo)
  const cache = {}
  const prep = it => (cache[`${it.plataforma}|${it.cap}`] ||= prepararModelo(it, planLinea, modelos, tiemposAll, puestosAll))

  const dias = fechas.map(f => {
    const l = diario[f]?.[planLinea]
    const items = (l?.items || []).filter(i => i.qty > 0)
    const equipos = items.reduce((a, i) => a + i.qty, 0)
    const turnosExcel = Number(l?.turnos) || 0
    const manual = turnosOverride[f]
    const editado = manual !== undefined && manual !== '' && isFinite(Number(manual))
    const turnos = editado ? Number(manual) : (equipos > 0 ? (turnosExcel || 1) : turnosExcel)
    return {
      fecha: f, items, equipos, turnos, turnosExcel, turnosEditado: editado,
      turnosEstimados: !editado && equipos > 0 && !turnosExcel, dispSeg: horas * turnos * 3600 * efic,
    }
  })

  // puesto → día → { seg, detalle: { clave → fila } }
  const mapa = {}
  const modelosSem = {}
  dias.forEach((d, di) => {
    d.items.forEach(it => {
      const m = prep(it)
      const k = `${it.plataforma}|${it.cap}`
      const ms = (modelosSem[k] ||= { plataforma: it.plataforma, cap: it.cap, qty: 0, estado: m.estado, ok: !!m.ok })
      ms.qty += it.qty
      if (!m.ok) return
      for (const [pk, p] of Object.entries(m.puestos)) {
        const pm = (mapa[pk] ||= { label: p.label, dias: dias.map(() => ({ seg: 0, det: {} })) })
        p.tareas.forEach(t => {
          const c = pm.dias[di]
          const seg = it.qty * t.segUnidad
          c.seg += seg
          const dk = `${k}|${t.code}`
          const f = (c.det[dk] ||= { plataforma: it.plataforma, cap: it.cap, code: t.code, desc: t.desc, units: 0, seg: 0 })
          f.units += it.qty * t.cant
          f.seg += seg
        })
      }
    })
  })

  const num = s => Number(String(s).replace(/\D+/g, '')) || 0
  const puestos = Object.entries(mapa)
    .sort((a, b) => num(a[0]) - num(b[0]) || a[0].localeCompare(b[0]))
    .map(([key, p]) => {
      const celdas = p.dias.map((c, i) => {
        const d = dias[i]
        // Cuánto falta para llegar: tiempo que excede el turno y los equipos que
        // no alcanzaría a hacer (a la mezcla de ese día: equipos × lo que sobra ÷ lo necesario)
        const faltaSeg = Math.max(0, c.seg - d.dispSeg)
        return {
          seg: c.seg, pct: c.seg > 0 ? (d.dispSeg > 0 ? c.seg / d.dispSeg : Infinity) : null, det: Object.values(c.det),
          faltaSeg, faltaEq: c.seg > 0 ? Math.ceil(d.equipos * faltaSeg / c.seg - 1e-9) : 0,
        }
      })
      const totalSeg = celdas.reduce((a, c) => a + c.seg, 0)
      const faltaSeg = celdas.reduce((a, c) => a + c.faltaSeg, 0)
      const dispTotal = dias.reduce((a, d) => a + (d.equipos > 0 ? d.dispSeg : 0), 0)
      return { key, label: p.label, celdas, totalSeg, dispTotal, faltaSeg, pctTotal: totalSeg > 0 ? (dispTotal > 0 ? totalSeg / dispTotal : Infinity) : null }
    })

  const alertas = []
  puestos.forEach(p => p.celdas.forEach((c, i) => {
    if (c.pct != null && c.pct > 1.0001) {
      alertas.push({
        puesto: p.label, fecha: dias[i].fecha, pct: c.pct, seg: c.seg, dispSeg: dias[i].dispSeg, faltaSeg: c.faltaSeg, faltaEq: c.faltaEq,
        top: [...c.det].sort((a, b) => b.seg - a.seg).slice(0, 2),
      })
    }
  }))
  alertas.sort((a, b) => b.pct - a.pct)

  // Sugerencia de horas/eficiencia: la del modelo con más equipos en la semana
  const masGrande = Object.values(modelosSem).filter(m => m.ok).sort((a, b) => b.qty - a.qty)[0]
  const sug = masGrande ? cache[`${masGrande.plataforma}|${masGrande.cap}`] : null

  // Equipos que no saldrían cada día: los limita el puesto que más falta
  dias.forEach((d, i) => { d.faltaEq = Math.max(0, ...puestos.map(p => p.celdas[i].faltaEq)) })

  return {
    dias, puestos,
    faltaSeg: puestos.reduce((a, p) => a + p.faltaSeg, 0),
    faltaEq: dias.reduce((a, d) => a + d.faltaEq, 0), alertas, conDomingo,
    modelos: Object.values(modelosSem).sort((a, b) => b.qty - a.qty),
    equipos: dias.reduce((a, d) => a + d.equipos, 0),
    sugerencia: sug ? { horas: sug.horas, efic: sug.efic, modelo: `${masGrande.plataforma} ${masGrande.cap}` } : null,
  }
}

// Columnas para mostrar: en la semana, un día por columna; en el mes, una
// semana por columna. Cada grupo = { titulo, idxs (índices de plan.dias), equipos, dispSeg }.
export function gruposDias(dias, porSemana) {
  const grupos = []
  dias.forEach((d, i) => {
    const k = porSemana ? lunesDe(d.fecha) : d.fecha
    let g = grupos.find(x => x.key === k)
    if (!g) { g = { key: k, idxs: [], equipos: 0, dispSeg: 0 }; grupos.push(g) }
    g.idxs.push(i)
    g.equipos += d.equipos
    if (d.equipos > 0) g.dispSeg += d.dispSeg
  })
  return grupos
}

// Celda de un puesto sumando varios días (semana dentro del mes)
export function celdaGrupo(puesto, g) {
  const cs = g.idxs.map(i => puesto.celdas[i])
  const seg = cs.reduce((a, c) => a + c.seg, 0)
  return {
    seg, pct: seg > 0 ? (g.dispSeg > 0 ? seg / g.dispSeg : Infinity) : null,
    faltaSeg: cs.reduce((a, c) => a + c.faltaSeg, 0), faltaEq: cs.reduce((a, c) => a + c.faltaEq, 0),
  }
}

// Filas de tareas de un puesto: una por modelo+tarea, con las unidades y el
// tiempo de cada grupo (día o semana).
export function tareasDePuesto(puesto, grupos) {
  const m = {}
  grupos.forEach((g, gi) => g.idxs.forEach(i => puesto.celdas[i].det.forEach(f => {
    const k = `${f.plataforma}|${f.cap}|${f.code}`
    const r = (m[k] ||= { ...f, porDia: grupos.map(() => null), segTotal: 0, unitsTotal: 0 })
    const x = (r.porDia[gi] ||= { units: 0, seg: 0 })
    x.units += f.units
    x.seg += f.seg
    r.segTotal += f.seg
    r.unitsTotal += f.units
  })))
  return Object.values(m).sort((a, b) => b.segTotal - a.segTotal)
}

// Cascada de un puesto en los días `idxs`: cada tarea arranca donde termina la
// anterior (en el orden en que se hacen: modelo por modelo y, dentro de cada
// modelo, de la más larga a la más corta). `disp` = tiempo disponible de esos días.
export function cascadaDePuesto(puesto, idxs, dias) {
  const m = {}
  idxs.forEach(i => puesto.celdas[i].det.forEach(f => {
    const k = `${f.plataforma}|${f.cap}|${f.code}`
    const r = (m[k] ||= { plataforma: f.plataforma, cap: f.cap, code: f.code, desc: f.desc, units: 0, seg: 0 })
    r.units += f.units
    r.seg += f.seg
  }))
  const porModelo = {}
  Object.values(m).forEach(r => { porModelo[`${r.plataforma} ${r.cap}`] = (porModelo[`${r.plataforma} ${r.cap}`] || 0) + r.seg })
  const filas = Object.values(m).sort((a, b) =>
    porModelo[`${b.plataforma} ${b.cap}`] - porModelo[`${a.plataforma} ${a.cap}`] ||
    `${a.plataforma} ${a.cap}`.localeCompare(`${b.plataforma} ${b.cap}`) || b.seg - a.seg)
  let t = 0
  filas.forEach(f => { f.inicio = t; t += f.seg })
  const disp = idxs.reduce((a, i) => a + (dias[i].equipos > 0 ? dias[i].dispSeg : 0), 0)
  return { filas, total: t, disp }
}

// verde ≤ 90 %, naranja hasta 100 %, rojo si se pasa del turno (o no hay turno)
export function nivel(pct) {
  if (pct == null) return 'vacio'
  if (pct > 1.0001) return 'rojo'
  if (pct > 0.9) return 'naranja'
  return 'verde'
}

export const pctTexto = pct => (pct == null ? '—' : isFinite(pct) ? `${Math.round(pct * 100)}%` : 'sin turno')

// "+2h 31m · ≈ 88 eq" para una celda que se pasa del turno
export function faltaTexto(faltaSeg, faltaEq, fmt) {
  if (!(faltaSeg > 0)) return ''
  return `falta ${fmt(faltaSeg)}${faltaEq > 0 ? ` · ${faltaEq.toLocaleString('es-AR')} eq` : ''}`
}
