import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore'
import Header from '../../components/Header'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { exportPuestosPdf } from './exportPuestosPdf'
import SecuenciaMes from './SecuenciaMes'
import { PUESTOS_MEDICION, fmtNum, fmtDuracionSeg, statsNorm, buildTareas, parseTakt, unidadesTarea } from './puestosCalc'

// mm:ss a partir de centisegundos — mismo tiempo estándar (tiempoNorm) que ya
// usa Balance, solo que acá se muestra sin los centisegundos (alcanza para
// planificar puestos, no hace falta esa precisión en esta pantalla).
function fmtMMSS(cs) {
  const totalSec = Math.round(cs / 100)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtHoras(h) {
  if (!isFinite(h) || h <= 0) return '—'
  const totalMin = Math.round(h * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${hh}h ${String(mm).padStart(2, '0')}m`
}

// Número de paso (1 → 4): la pantalla se recorre en ese orden.
function StepNum({ n }) {
  return (
    <span style={{
      width: 22, height: 22, borderRadius: 11, background: 'var(--primary)', color: '#fff',
      fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{n}</span>
  )
}

// Ficha tocable de una tarea (subconjunto): código, descripción y el tiempo
// que le suma al puesto (tiempo estándar × cantidad por equipo × % si está dividida).
function TareaChip({ t, cant, share, tone, onClick }) {
  const c = tone === 'libre'
    ? { bg: '#fff3e0', bd: '#ffb74d', fg: '#e65100' }
    : { bg: '#e8f1fd', bd: '#90caf9', fg: '#0d47a1' }
  return (
    <button onClick={onClick} title={t.desc} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, maxWidth: '100%',
      background: c.bg, border: `1.5px solid ${c.bd}`, color: c.fg, borderRadius: 8,
      padding: '5px 9px', cursor: 'pointer', textAlign: 'left',
    }}>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 700 }}>
        {t.code}
        <span style={{ fontFamily: 'monospace' }}>{fmtMMSS(t.tStd * cant * share)}</span>
        {cant > 1 && <span style={{ fontSize: 10.5 }}>×{cant}</span>}
        {share < 1 && <span style={{ fontSize: 10.5 }}>{Math.round(share * 100)}%</span>}
        {t.origen === 'Preformado' && <span title="Preformado: se puede dividir entre 2 puestos">✂️</span>}
      </span>
      <span style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.85, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.desc}</span>
    </button>
  )
}

// Barra de carga de un puesto con marca del takt requerido: verde con margen,
// naranja cerca del takt (>90%), roja si lo pasa (ese puesto no llega a la meta).
function LoadBar({ cs, taktCs, escalaCs }) {
  const pct = Math.min(100, (cs / escalaCs) * 100)
  const color = !taktCs ? 'var(--primary)' : cs > taktCs ? '#e53935' : cs > taktCs * 0.9 ? '#fb8c00' : '#43a047'
  const taktPct = taktCs > 0 ? Math.min(100, (taktCs / escalaCs) * 100) : null
  return (
    <div style={{ position: 'relative', height: 14, background: '#eee', borderRadius: 7 }}>
      <div style={{ width: `${Math.max(pct, cs > 0 ? 2 : 0)}%`, height: '100%', background: color, borderRadius: 7, transition: 'width .3s' }} />
      {taktPct !== null && (
        <div title="Takt requerido" style={{ position: 'absolute', left: `calc(${taktPct}% - 1px)`, top: -4, bottom: -4, width: 3, borderRadius: 2, background: '#212121' }} />
      )}
    </div>
  )
}

// Reparto sugerido de tareas entre N puestos (balanceo de línea). Cada item es
// { code, w, split } con w = trabajo por equipo terminado en centisegundos
// (tiempo estándar × cantidad por equipo) y split = true si la tarea se puede
// dividir entre 2 puestos (solo las de Preformado). Primero reparte tareas
// enteras de mayor a menor siempre al puesto menos cargado, después mejora
// moviendo/intercambiando tareas del cuello de botella, y por último divide
// en 2 puestos (en pasos de 5%) la tarea de Preformado que más ayude.
function distribuir(items, N) {
  const loads = Array(N).fill(0)
  const sorted = [...items].sort((a, b) => b.w - a.w || a.code.localeCompare(b.code))
  const place = {}
  const argmax = () => { let k = 0; for (let i = 1; i < N; i++) if (loads[i] > loads[k]) k = i; return k }
  const argmin = () => { let k = 0; for (let i = 1; i < N; i++) if (loads[i] < loads[k]) k = i; return k }
  sorted.forEach(it => { const k = argmin(); place[it.code] = k; loads[k] += it.w })

  for (let iter = 0; iter < 300 && N > 1; iter++) {
    const B = argmax(), LB = loads[B]
    let best = null
    for (const a of sorted.filter(x => place[x.code] === B)) {
      for (let O = 0; O < N; O++) {
        if (O === B) continue
        const LO = loads[O]
        const nm = Math.max(LB - a.w, LO + a.w)
        if (nm < LB - 1e-6 && (!best || nm < best.nm)) best = { nm, a, O, b: null }
        for (const b of sorted) {
          if (place[b.code] !== O) continue
          const d = a.w - b.w
          if (d <= 0) continue
          const nm2 = Math.max(LB - d, LO + d)
          if (nm2 < LB - 1e-6 && (!best || nm2 < best.nm)) best = { nm: nm2, a, O, b }
        }
      }
    }
    if (!best) break
    place[best.a.code] = best.O
    loads[B] -= best.a.w; loads[best.O] += best.a.w
    if (best.b) { place[best.b.code] = B; loads[best.O] -= best.b.w; loads[B] += best.b.w }
  }

  const split = {}
  for (let iter = 0; iter < 20 && N > 1; iter++) {
    const B = argmax(), L = argmin()
    const gap = loads[B] - loads[L]
    if (gap <= loads[B] * 0.02) break
    const cand = sorted.filter(x => x.split && place[x.code] === B).sort((a, b) => b.w - a.w)[0]
    if (!cand) break
    const want = Math.min(gap / 2, cand.w)
    const movedPct = Math.min(95, Math.round((want / cand.w) * 100 / 5) * 5)
    if (movedPct < 5) break
    const moved = (cand.w * movedPct) / 100
    loads[B] -= moved; loads[L] += moved
    split[cand.code] = { i1: B, i2: L, pct1: 100 - movedPct }
    delete place[cand.code]
  }

  const asig = []
  for (const it of sorted) {
    if (split[it.code]) {
      const sp = split[it.code]
      asig.push({ code: it.code, i: sp.i1, pct: sp.pct1 }, { code: it.code, i: sp.i2, pct: 100 - sp.pct1 })
    } else asig.push({ code: it.code, i: place[it.code], pct: 100 })
  }
  return { loads, asig }
}

// Los subconjuntos IDU solo se sueldan en los primeros 5 puestos; las demás
// líneas arrancan sin tope (editable en Parámetros).
function maxPuestosDefault(linea) {
  return String(linea || '').toUpperCase().trim() === 'IDU' ? 5 : 0
}

function nuevoPuestoId() {
  return `p${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export default function SoldaduraPuestos() {
  const { isProduccion } = useAuth()
  const readOnly = isProduccion

  const [modelos, setModelos] = useState([])
  const [tiemposAll, setTiemposAll] = useState({})
  const [selectedModeloName, setSelectedModeloName] = useState('')
  const [selectedDocId, setSelectedDocId] = useState('')
  const [lineaFilter, setLineaFilter] = useState('')

  // Estado guardado en Firestore para el Modelo/Cap/Línea elegido
  const [puestos, setPuestos] = useState([])
  const [asignaciones, setAsignaciones] = useState([]) // [{code, puestoId}]
  const [horasTurno, setHorasTurno] = useState(8)
  const [turnosDia, setTurnosDia] = useState(1)
  const [eficPct, setEficPct] = useState(90)
  const [metaCantidad, setMetaCantidad] = useState(0)
  const [diasPlazo, setDiasPlazo] = useState(20)
  const [maxPuestos, setMaxPuestos] = useState(0) // 0 = sin tope
  const [cantidades, setCantidades] = useState({}) // {code: unidades por equipo terminado}
  const [cargado, setCargado] = useState(false)
  const [savedTakt, setSavedTakt] = useState({})
  const [menuCode, setMenuCode] = useState(null)     // tarea abierta en la hoja de asignación
  const [showParams, setShowParams] = useState(null) // null = abierto solo si falta la meta
  const [showDetalle, setShowDetalle] = useState(false)

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'soldadura_modelos'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setModelos(data)
      if (data.length && !selectedModeloName) {
        const first = data[0]
        setSelectedModeloName(first.modelo || first.id)
        setSelectedDocId(first.id)
      }
    }, () => {})
    const u2 = onSnapshot(collection(db, 'soldadura_tiempos'), snap => {
      const m = {}
      snap.docs.forEach(d => { m[d.id] = d.data() })
      setTiemposAll(m)
    }, () => {})
    const u3 = onSnapshot(doc(db, 'config', 'takt_soldadura'), snap => {
      setSavedTakt(snap.exists() ? snap.data() : {})
    }, () => {})
    return () => { u1(); u2(); u3() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const modeloNames = [...new Set(modelos.map(m => m.modelo || m.id))].sort()
  const capsForModelo = modelos.filter(m => (m.modelo || m.id) === selectedModeloName)
  const selectedDoc = modelos.find(m => m.id === selectedDocId) || null
  const tiempos = tiemposAll[selectedDocId] || {}
  const allSubconjs = (selectedDoc?.subconjuntos || []).filter(s => !s.tipo || s.tipo === 'Completo')
  const lineas = [...new Set(allSubconjs.map(s => s.linea).filter(Boolean))].sort()
  const subconjuntos = lineaFilter ? allSubconjs.filter(s => s.linea === lineaFilter) : allSubconjs

  // Reset de línea cuando cambia el modelo/cap, o autoselección si solo hay una
  useEffect(() => {
    if (lineas.length === 1) setLineaFilter(lineas[0])
    else if (lineaFilter && !lineas.includes(lineaFilter)) setLineaFilter('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDocId])

  const tareas = useMemo(() => buildTareas(subconjuntos, tiempos), [subconjuntos, tiempos])

  const puestosKey = selectedDocId && lineaFilter ? `${selectedDocId}||${lineaFilter}` : ''

  // Carga la distribución guardada para este Modelo/Cap/Línea
  useEffect(() => {
    if (!puestosKey) { setCargado(false); return }
    setCargado(false)
    const unsub = onSnapshot(doc(db, 'soldadura_puestos', puestosKey), snap => {
      if (snap.exists()) {
        const d = snap.data()
        setPuestos(d.puestos || [])
        setAsignaciones(d.asignaciones || [])
        setHorasTurno(d.horasTurno ?? 8)
        setTurnosDia(d.turnosDia ?? 1)
        setEficPct(d.eficPct ?? 90)
        setMetaCantidad(d.metaCantidad ?? 0)
        setDiasPlazo(d.diasPlazo ?? 20)
        setMaxPuestos(d.maxPuestos ?? maxPuestosDefault(lineaFilter))
        setCantidades(d.cantidades || {})
      } else {
        setPuestos([])
        setAsignaciones([])
        setHorasTurno(8)
        setTurnosDia(1)
        setEficPct(90)
        setMetaCantidad(0)
        setDiasPlazo(20)
        setMaxPuestos(maxPuestosDefault(lineaFilter))
        setCantidades({})
      }
      setCargado(true)
    }, () => setCargado(true))
    return unsub
  }, [puestosKey])

  async function guardar(patch) {
    if (!puestosKey || readOnly) return
    await setDoc(doc(db, 'soldadura_puestos', puestosKey), {
      puestos, asignaciones, horasTurno, turnosDia, eficPct, metaCantidad,
      diasPlazo, maxPuestos, cantidades,
      ...patch,
      actualizadoEn: new Date().toISOString(),
    }, { merge: true })
  }

  function handleModeloChange(name) {
    setSelectedModeloName(name)
    const caps = modelos.filter(m => (m.modelo || m.id) === name)
    setSelectedDocId(caps.length ? caps[0].id : '')
  }

  function agregarPuesto() {
    const nuevo = { id: nuevoPuestoId(), nombre: `Puesto ${puestos.length + 1}` }
    const next = [...puestos, nuevo]
    setPuestos(next)
    guardar({ puestos: next })
  }

  function renombrarPuesto(id, nombre) {
    const next = puestos.map(p => p.id === id ? { ...p, nombre } : p)
    setPuestos(next)
    guardar({ puestos: next })
  }

  function eliminarPuesto(id) {
    const next = puestos.filter(p => p.id !== id)
    // Si una tarea dividida pierde uno de sus 2 puestos, queda entera en el otro
    const nextAsig = asignaciones.filter(a => a.puestoId !== id).map(a => {
      const { pct, ...rest } = a
      const quedan = asignaciones.filter(x => x.code === a.code && x.puestoId !== id).length
      return quedan > 1 ? a : rest
    })
    setPuestos(next)
    setAsignaciones(nextAsig)
    guardar({ puestos: next, asignaciones: nextAsig })
  }

  function asignarTarea(code, puestoId) {
    const next = asignaciones.filter(a => a.code !== code)
    if (puestoId) next.push({ code, puestoId })
    setAsignaciones(next)
    guardar({ asignaciones: next })
  }

  // Divide una tarea de Preformado entre 2 puestos (pct1 = % del primero)
  function dividirTarea(code, id1, id2, pct1) {
    if (!id1 || !id2 || id1 === id2) return
    const next = asignaciones.filter(a => a.code !== code)
    next.push({ code, puestoId: id1, pct: pct1 }, { code, puestoId: id2, pct: 100 - pct1 })
    setAsignaciones(next)
    guardar({ asignaciones: next })
  }

  function cambiarCantidad(code, n) {
    const next = { ...cantidades, [code]: n }
    setCantidades(next)
    guardar({ cantidades: next })
  }

  function aplicarDistribucion(N) {
    if ((puestos.length || asignaciones.length) &&
        !window.confirm(`Esto reemplaza los puestos y asignaciones actuales de esta línea por una propuesta de ${N} puestos. Después la podés editar a mano. ¿Continuar?`)) return
    const res = distribuir(items, N)
    const nuevos = Array.from({ length: N }, (_, i) => ({ id: nuevoPuestoId(), nombre: `Puesto ${i + 1}` }))
    const nuevasAsig = res.asig.map(a => (
      a.pct < 100
        ? { code: a.code, puestoId: nuevos[a.i].id, pct: a.pct }
        : { code: a.code, puestoId: nuevos[a.i].id }
    ))
    setPuestos(nuevos)
    setAsignaciones(nuevasAsig)
    guardar({ puestos: nuevos, asignaciones: nuevasAsig })
  }

  // Desde la secuencia del mes: toma los equipos del modelo y los días con producción como meta
  function usarMetaSecuencia(qty, dias) {
    const q = Math.round(qty)
    const d = Math.round(dias)
    setMetaCantidad(q)
    setDiasPlazo(d)
    guardar({ metaCantidad: q, diasPlazo: d })
  }

  function handleParam(setter, key, raw, parser = Number) {
    const val = raw === '' ? '' : parser(raw)
    setter(val)
    if (val !== '' && !Number.isNaN(val)) guardar({ [key]: val })
  }

  // code -> [{puestoId, pct}] — una entrada normalmente; 2 si la tarea (solo
  // de Preformado) está dividida entre dos puestos.
  const asigPorCode = useMemo(() => {
    const m = {}
    asignaciones.forEach(a => { (m[a.code] = m[a.code] || []).push({ puestoId: a.puestoId, pct: a.pct ?? 100 }) })
    return m
  }, [asignaciones])

  const cantDe = code => Number(cantidades[code]) || 1
  const tareasSinAsignar = tareas.filter(t => !asigPorCode[t.code]?.length)

  // Trabajo por equipo terminado de cada tarea (tiempo estándar × cantidad por equipo)
  const items = useMemo(
    () => tareas.map(t => ({ code: t.code, w: t.tStd * (Number(cantidades[t.code]) || 1), split: t.origen === 'Preformado' })),
    [tareas, cantidades]
  )

  const porPuesto = puestos.map(p => {
    const asignadas = tareas
      .map(t => {
        const e = asigPorCode[t.code]?.find(x => x.puestoId === p.id)
        return e ? { ...t, share: e.pct / 100, cant: cantDe(t.code) } : null
      })
      .filter(Boolean)
    const tcCs = asignadas.reduce((a, t) => a + t.tStd * t.cant * t.share, 0)
    const tcSec = tcCs / 100
    const unHs = tcSec > 0 ? 3600 / tcSec : 0
    const unTurno = unHs * (Number(horasTurno) || 0)
    const unDia = unTurno * (Number(turnosDia) || 0)
    const eficFrac = (Number(eficPct) || 0) / 100
    return {
      ...p, asignadas, tcCs,
      unHs: unHs * eficFrac,
      unTurno: unTurno * eficFrac,
      unDia: unDia * eficFrac,
    }
  })

  const activos = porPuesto.filter(p => p.asignadas.length > 0)
  const bottleneck = activos.length ? [...activos].sort((a, b) => b.tcCs - a.tcCs)[0] : null

  const meta = Number(metaCantidad) || 0
  const horasParaMeta = bottleneck && bottleneck.unHs > 0 ? meta / bottleneck.unHs : 0
  const turnosParaMeta = Number(horasTurno) > 0 ? horasParaMeta / Number(horasTurno) : 0
  const diasParaMeta = Number(turnosDia) > 0 ? turnosParaMeta / Number(turnosDia) : 0

  const horasDiaUsadas = (Number(horasTurno) || 0) * (Number(turnosDia) || 0)
  const excedeDia = horasDiaUsadas > 24

  // Dotación necesaria para cumplir la meta dentro del plazo: takt requerido,
  // mínimo teórico de personas y una tabla de escenarios (±2 personas alrededor del número indicativo) armada con
  // el reparto sugerido, para ver cuánto rinde sumar o sacar una persona.
  const maxP = Number(maxPuestos) || 0
  // Takt cargado en la pantalla Takt Time para este Modelo/Cap/Línea (clave
  // docId||línea, cae a la clave vieja docId) — si existe, manda sobre el
  // takt que se deduce de la meta, porque es el ritmo real de la línea.
  const taktCargadoSeg = parseTakt(savedTakt[`${selectedDocId}||${lineaFilter}`] || savedTakt[selectedDocId] || '') / 100
  const dot = useMemo(() => {
    const horas = Number(horasTurno) || 0
    const turnos = Number(turnosDia) || 0
    const plazo = Number(diasPlazo) || 0
    const efic = (Number(eficPct) || 0) / 100
    const metaN = Number(metaCantidad) || 0
    if (!items.length) return null
    const tiempoUtilSeg = horas * turnos * plazo * 3600 * efic
    const taktMetaSeg = metaN > 0 && tiempoUtilSeg > 0 ? tiempoUtilSeg / metaN : 0
    const fuente = taktCargadoSeg > 0 ? 'cargado' : 'meta'
    const taktSeg = taktCargadoSeg > 0 ? taktCargadoSeg : taktMetaSeg
    if (taktSeg <= 0) return null
    const sumaCs = items.reduce((a, i) => a + i.w, 0)
    const trabajoSeg = sumaCs / 100
    const minTeo = Math.max(1, Math.ceil(trabajoSeg / taktSeg - 1e-9))
    const armarFila = N => {
      const r = distribuir(items, N)
      const maxCs = Math.max(...r.loads)
      const tcSeg = maxCs / 100
      const unHs = tcSeg > 0 ? (3600 / tcSeg) * efic : 0
      const porDia = unHs * horas * turnos
      return {
        N, tcSeg,
        ok: tcSeg <= taktSeg + 1e-9,
        unTurno: unHs * horas,
        diasMeta: porDia > 0 && metaN > 0 ? metaN / porDia : 0,
        balance: maxCs > 0 ? sumaCs / (N * maxCs) : 0,
        hhEquipo: (N * tcSeg) / 3600,
      }
    }
    // Se evalúan todas las opciones desde 1 persona; el número indicativo es la
    // primera que llega al takt y se muestran ±2 personas alrededor de ese número.
    const todas = []
    for (let N = 1; N <= minTeo + 6; N++) todas.push(armarFila(N))
    const real = todas.find(f => f.ok) || null
    const centro = real ? real.N : minTeo
    const desde = Math.max(1, centro - 2)
    const hasta = real ? centro + 2 : centro + 4
    const filas = todas.filter(f => f.N >= desde && f.N <= hasta)
    const conTope = maxP > 0 ? armarFila(maxP) : null
    const largas = items.filter(i => i.w / 100 > taktSeg * (i.split ? 2 : 1) + 1e-9)
    return { taktSeg, taktMetaSeg, fuente, trabajoSeg, minTeo, filas, real, conTope, largas }
  }, [items, horasTurno, turnosDia, diasPlazo, eficPct, metaCantidad, maxP, taktCargadoSeg])

  const sinMedir = (() => {
    const medidas = new Set(tareas.map(t => t.code))
    const codes = new Set()
    subconjuntos.forEach(sc => {
      const c = sc.codCompleto || sc.codigo || ''
      if (c) codes.add(c)
      ;(sc.parciales || []).forEach(par => { if (par.codParcial) codes.add(par.codParcial) })
    })
    return [...codes].filter(c => !medidas.has(c)).length
  })()
  const pocaMuestra = tareas.filter(t => t.n === 1).length

  const selectStyle = {
    flex: 1, padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid #e0e0e0', fontSize: 14, background: '#fff', outline: 'none',
  }
  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid #e0e0e0', fontSize: 14, outline: 'none',
    boxSizing: 'border-box', opacity: readOnly ? 0.6 : 1,
  }
  const labelStyle = { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }

  // Takt para mostrar aunque todavía no haya tareas medidas (dot solo existe con tareas)
  const taktMostrarSeg = dot ? dot.taktSeg : (taktCargadoSeg > 0 ? taktCargadoSeg : 0)
  const taktCs = taktMostrarSeg * 100
  const escalaCs = Math.max(taktCs, ...porPuesto.map(p => p.tcCs), 1)
  const tareaMenu = tareas.find(t => t.code === menuCode) || null
  const entMenu = tareaMenu ? (asigPorCode[tareaMenu.code] || []) : []
  const plazoN = Number(diasPlazo) || 0
  const paramsAbiertos = showParams ?? !(meta > 0)
  const necesarias = dot?.real?.N ?? null

  const kpis = [
    {
      label: 'Takt de la línea', value: taktMostrarSeg > 0 ? fmtDuracionSeg(taktMostrarSeg) : '—',
      sub: taktMostrarSeg <= 0 ? 'sin takt ni meta' : (dot ? dot.fuente : 'cargado') === 'cargado' ? 'cargado en Takt Time' : 'calculado con la meta',
    },
    { label: 'Personas necesarias', value: necesarias ?? '—', sub: dot ? `mínimo teórico ${dot.minTeo}` : 'cargá meta y días', color: '#2e7d32' },
    {
      label: 'Personas armadas', value: puestos.length, sub: `${activos.length} con tareas`,
      color: necesarias && puestos.length < necesarias ? '#c62828' : undefined,
    },
    {
      label: 'Días para la meta', value: bottleneck && meta > 0 ? fmtNum(diasParaMeta) : '—',
      sub: plazoN ? `plazo: ${plazoN} días` : 'con tu armado',
      color: bottleneck && meta > 0 && plazoN ? (diasParaMeta <= plazoN ? '#2e7d32' : '#c62828') : undefined,
    },
    { label: 'Sin asignar', value: tareasSinAsignar.length, sub: `de ${tareas.length} tareas`, color: tareasSinAsignar.length ? '#e65100' : '#2e7d32' },
  ]

  return (
    <div className="app">
      <Header title="Distribución de Puestos" back="/soldadura" />

      {/* Selectors */}
      <div style={{ padding: '10px 12px 6px', display: 'flex', gap: 8 }}>
        <select value={selectedModeloName} onChange={e => handleModeloChange(e.target.value)} style={selectStyle}>
          <option value="">— Modelo —</option>
          {modeloNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={selectedDocId} onChange={e => setSelectedDocId(e.target.value)} disabled={!selectedModeloName} style={{ ...selectStyle, opacity: selectedModeloName ? 1 : 0.45 }}>
          <option value="">— Cap —</option>
          {capsForModelo.map(c => <option key={c.id} value={c.id}>{c.cap || c.id}</option>)}
        </select>
      </div>

      {lineas.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '0 12px 8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {lineas.map(l => (
            <button key={l} onClick={() => setLineaFilter(l)} style={{
              flexShrink: 0, padding: '5px 14px', borderRadius: 16, border: '1.5px solid',
              borderColor: lineaFilter === l ? '#333' : '#d0d0d0',
              background: lineaFilter === l ? '#333' : '#fff',
              color: lineaFilter === l ? '#fff' : 'var(--text-primary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{l}</button>
          ))}
        </div>
      )}

      {!selectedDocId || !lineaFilter ? (
        <div className="empty" style={{ paddingTop: 60 }}>
          <div className="ei">👷</div>
          <p>Seleccioná modelo, capacidad y línea</p>
        </div>
      ) : !cargado ? (
        <div className="spinner"><div className="spin" /></div>
      ) : (
        <div className="content" style={{ paddingTop: 0 }}>
          {readOnly && (
            <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: '#e65100', marginBottom: 10 }}>
              Solo lectura para tu perfil — la distribución la arma Ingeniería/Admin.
            </div>
          )}

          {/* Exportar para imprimir */}
          <button onClick={() => exportPuestosPdf({
            modelo: selectedModeloName, cap: selectedDoc?.cap || selectedDocId, linea: lineaFilter,
            params: { horasTurno, turnosDia, eficPct, diasPlazo },
            dot, porPuesto, sinAsignar: tareasSinAsignar, bottleneck, meta, diasParaMeta, taktCs,
          })} style={{
            width: '100%', marginBottom: 12, padding: '10px 14px', borderRadius: 10, border: '1.5px solid var(--primary)',
            background: '#fff', color: 'var(--primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>📄 Exportar PDF para imprimir</button>

          {/* Tablero resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
            {kpis.map(k => (
              <div key={k.label} style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Paso 1 — Parámetros */}
          <div className="detail-section" style={{ marginBottom: 12 }}>
            <button onClick={() => setShowParams(!paramsAbiertos)} className="section-header" style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
            }}>
              <StepNum n={1} />
              <span style={{ flex: 1 }}>
                Datos de producción
                {!paramsAbiertos && (
                  <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {meta || 0} equipos en {diasPlazo || 0} días · {horasTurno} h × {turnosDia} turno{Number(turnosDia) !== 1 ? 's' : ''} · {eficPct}% eficiencia{maxP > 0 ? ` · tope ${maxP} puestos` : ''}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>{paramsAbiertos ? 'Cerrar ▲' : 'Editar ▼'}</span>
            </button>
            {paramsAbiertos && (
              <>
                <div style={{ padding: '10px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>🎯 Equipos a producir (meta)</label>
                    <input type="number" min="0" step="1" disabled={readOnly} value={metaCantidad}
                      onChange={e => handleParam(setMetaCantidad, 'metaCantidad', e.target.value, Number)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>📅 Días para cumplirla</label>
                    <input type="number" min="0" step="1" disabled={readOnly} value={diasPlazo}
                      onChange={e => handleParam(setDiasPlazo, 'diasPlazo', e.target.value, Number)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>⏱ Horas por turno</label>
                    <input type="number" min="0" max="24" step="0.1" disabled={readOnly} value={horasTurno}
                      onChange={e => handleParam(setHorasTurno, 'horasTurno', e.target.value, Number)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>🔁 Turnos por día</label>
                    <input type="number" min="0" step="1" disabled={readOnly} value={turnosDia}
                      onChange={e => handleParam(setTurnosDia, 'turnosDia', e.target.value, Number)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>⚙️ % Eficiencia</label>
                    <input type="number" min="0" max="100" step="1" disabled={readOnly} value={eficPct}
                      onChange={e => handleParam(setEficPct, 'eficPct', e.target.value, Number)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>🚧 Máx. de puestos (0 = sin tope)</label>
                    <input type="number" min="0" step="1" disabled={readOnly} value={maxPuestos}
                      onChange={e => handleParam(setMaxPuestos, 'maxPuestos', e.target.value, Number)} style={inputStyle} />
                  </div>
                </div>
                {excedeDia && (
                  <div style={{ margin: '0 16px 10px', fontSize: 11.5, color: '#c62828', fontWeight: 600 }}>
                    ⚠️ {horasTurno}h × {turnosDia} turno{turnosDia !== 1 ? 's' : ''} = {fmtNum(horasDiaUsadas)}h — supera las 24h del día
                  </div>
                )}
              </>
            )}
          </div>

          {/* Secuencia del mes (mezcla de modelos) */}
          <SecuenciaMes
            lineaFilter={lineaFilter}
            selectedModeloName={selectedModeloName}
            selectedCap={selectedDoc?.cap || ''}
            modelos={modelos}
            tiemposAll={tiemposAll}
            savedTakt={savedTakt}
            params={{ horasTurno, turnosDia, eficPct }}
            unDiaArmado={bottleneck?.unDia || 0}
            readOnly={readOnly}
            onUsarMeta={usarMetaSecuencia}
          />

          {/* Paso 2 — Cuánta gente */}
          <div className="detail-section" style={{ marginBottom: 12 }}>
            <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StepNum n={2} /> ¿Cuánta gente necesito?
            </div>
            {!dot ? (
              <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {taktMostrarSeg > 0 ? (
                  <>El Takt Time cargado para esta línea es <b>{fmtDuracionSeg(taktMostrarSeg)}</b>, pero todavía no hay tareas con tiempo medido: cuando se midan subconjuntos de esta línea se calcula cuánta gente hace falta.</>
                ) : (
                  <>Cargá el Takt de esta línea en la pantalla <b>Takt Time</b>, o completá en el paso 1 los <b>equipos a producir</b> y los <b>días para cumplirla</b> (y que haya tareas con tiempo medido) para calcularlo.</>
                )}
              </div>
            ) : (
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
                  {dot.fuente === 'cargado' ? (
                    <>
                      El Takt Time cargado para esta línea es <b>{fmtDuracionSeg(dot.taktSeg)}</b>: tiene que salir un equipo cada {fmtDuracionSeg(dot.taktSeg)}.
                      {dot.taktMetaSeg > 0 && <> (Solo para la meta de {meta} equipos en {diasPlazo} días alcanzaría con uno cada {fmtDuracionSeg(dot.taktMetaSeg)}.)</>}
                    </>
                  ) : (
                    <>Para hacer <b>{meta}</b> equipos en <b>{diasPlazo}</b> días tiene que salir un equipo cada <b>{fmtDuracionSeg(dot.taktSeg)}</b> (takt). No hay Takt cargado para esta línea en la pantalla Takt Time.</>
                  )}
                  {' '}Soldar un equipo completo lleva <b>{fmtDuracionSeg(dot.trabajoSeg)}</b> de trabajo, así que como mínimo hacen falta <b>{dot.minTeo}</b> persona{dot.minTeo !== 1 ? 's' : ''}.
                </div>
                {!dot.real && (
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#c62828', marginBottom: 8 }}>
                    ⚠️ Ni con {dot.filas[dot.filas.length - 1].N} personas se llega al takt.
                  </div>
                )}
                {maxP > 0 && meta > 0 && dot.real && dot.real.N > maxP && (
                  <div style={{ fontSize: 12, color: '#c62828', fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>
                    ⚠️ El tope de esta línea es de {maxP} puestos: con {maxP} cumplirías la meta en ≈ {fmtNum(dot.conTope.diasMeta)} días (el plazo es de {diasPlazo}).
                  </div>
                )}
                {dot.largas.length > 0 && (
                  <div style={{ fontSize: 12, color: '#c62828', fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>
                    ⚠️ Tareas más largas que el takt (una sola persona no llega): {dot.largas.map(l => l.code).join(', ')}. Solo las de Preformado se pueden dividir en 2 puestos.
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 8 }}>
                  {dot.filas.map(f => {
                    const rec = dot.real?.N === f.N
                    const sobreTope = maxP > 0 && f.N > maxP
                    return (
                      <div key={f.N} style={{
                        border: rec ? '2px solid #43a047' : '1.5px solid #e0e0e0',
                        background: rec ? '#f1f8e9' : '#fff', borderRadius: 12, padding: 10,
                        display: 'flex', flexDirection: 'column', gap: 4,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 18, fontWeight: 800 }}>{f.N} 👷</span>
                          {rec && <span style={{ fontSize: 10, background: '#43a047', color: '#fff', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>RECOMENDADO</span>}
                          {!f.ok && <span style={{ fontSize: 10, background: '#ffebee', color: '#c62828', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>no llega</span>}
                          {sobreTope && <span style={{ fontSize: 10, background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>supera tope</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' }}>
                          <div>Puesto más cargado: <b style={{ color: f.ok ? 'var(--text-primary)' : '#c62828' }}>{fmtDuracionSeg(f.tcSeg)}</b></div>
                          <div>Sale: <b style={{ color: 'var(--text-primary)' }}>{fmtNum(f.unTurno)}</b> equipos/turno</div>
                          {meta > 0 && <div>Meta en: <b style={{ color: plazoN && f.diasMeta > plazoN ? '#c62828' : 'var(--text-primary)' }}>{fmtNum(f.diasMeta)}</b> días</div>}
                          <div>Gente ocupada: <b style={{ color: 'var(--text-primary)' }}>{Math.round(f.balance * 100)}%</b> del tiempo</div>
                        </div>
                        {!readOnly && (
                          <button onClick={() => aplicarDistribucion(f.N)} style={{
                            marginTop: 4, background: rec ? '#43a047' : 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8,
                            padding: '7px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}>Armar con {f.N} persona{f.N !== 1 ? 's' : ''}</button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>
                  "Armar" crea los puestos y reparte las tareas automáticamente; después lo ajustás a mano en el paso 3.
                </div>
              </div>
            )}
          </div>

          {/* Paso 3 — Armado de puestos */}
          <div className="detail-section" style={{ marginBottom: 12 }}>
            <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StepNum n={3} />
              <span style={{ flex: 1 }}>Puestos y tareas</span>
              {!readOnly && (
                <button onClick={agregarPuesto} style={{
                  background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>+ Puesto</button>
              )}
            </div>
            <div style={{ padding: '8px 16px 0', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              👆 <b>Tocá una tarea</b> para elegir qué puesto la hace, cambiar la cantidad por equipo o dividirla (✂️ solo Preformado).
              {taktCs > 0 && <> La <b>línea negra</b> de cada barra es el takt: si la barra la pasa (rojo), ese puesto no llega a la meta.</>}
            </div>

            {(sinMedir > 0 || pocaMuestra > 0) && (
              <div style={{ margin: '8px 16px 0', padding: '6px 10px', borderRadius: 8, fontSize: 11.5, color: '#e65100', lineHeight: 1.6, background: '#fff8e1' }}>
                {sinMedir > 0 && <div>⚠️ {sinMedir} subconjunto{sinMedir !== 1 ? 's' : ''} de esta línea sin tiempo medido: no entra{sinMedir !== 1 ? 'n' : ''} en ningún cálculo.</div>}
                {pocaMuestra > 0 && <div>⚠️ {pocaMuestra} tarea{pocaMuestra !== 1 ? 's' : ''} con una sola medición — el tiempo es poco confiable.</div>}
              </div>
            )}

            {/* Bandeja de tareas sin asignar */}
            <div style={{ margin: '10px 16px', padding: 10, borderRadius: 10, border: '1.5px dashed ' + (tareasSinAsignar.length ? '#ffb74d' : '#c8e6c9'), background: tareasSinAsignar.length ? '#fffaf3' : '#f6fbf6' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: tareasSinAsignar.length ? '#e65100' : '#2e7d32', marginBottom: tareasSinAsignar.length ? 8 : 0 }}>
                {tareas.length === 0
                  ? 'Sin tiempos medidos para esta línea todavía.'
                  : tareasSinAsignar.length
                    ? `📥 Tareas sin asignar (${tareasSinAsignar.length}) — no entran en los cálculos hasta que tengan puesto`
                    : '✅ Todas las tareas tienen puesto'}
              </div>
              {tareasSinAsignar.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tareasSinAsignar.map(t => (
                    <TareaChip key={t.code} t={t} cant={cantDe(t.code)} share={1} tone="libre" onClick={() => setMenuCode(t.code)} />
                  ))}
                </div>
              )}
            </div>

            {maxP > 0 && puestos.length > maxP && (
              <div style={{ padding: '0 16px 8px', fontSize: 11.5, color: '#c62828', fontWeight: 600 }}>
                ⚠️ Superaste el tope de {maxP} puestos para esta línea.
              </div>
            )}
            {puestos.length === 0 && (
              <div style={{ padding: '4px 16px 14px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Todavía no hay puestos{!readOnly ? ' — usá "Armar" en el paso 2 o "+ Puesto" para crearlos a mano' : ''}.
              </div>
            )}

            {/* Tarjetas de puesto */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, padding: '0 16px 14px' }}>
              {porPuesto.map(p => {
                const esCuello = bottleneck?.id === p.id && activos.length > 1
                const over = taktCs > 0 && p.tcCs > taktCs
                return (
                  <div key={p.id} style={{
                    border: `1.5px solid ${over ? '#ef9a9a' : esCuello ? '#ffcc80' : '#e0e0e0'}`,
                    borderRadius: 12, padding: 10, background: '#fff', display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input value={p.nombre} disabled={readOnly}
                        onChange={e => renombrarPuesto(p.id, e.target.value)}
                        style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 6, border: '1px solid #e0e0e0', fontSize: 13.5, fontWeight: 700, background: readOnly ? 'transparent' : '#fafafa' }} />
                      {esCuello && (
                        <span style={{ fontSize: 10, background: '#fff3e0', color: '#e65100', borderRadius: 4, padding: '2px 6px', fontWeight: 700, flexShrink: 0 }}>cuello de botella</span>
                      )}
                      {!readOnly && (
                        <button onClick={() => {
                          if (p.asignadas.length && !window.confirm(`¿Eliminar ${p.nombre}? Sus ${p.asignadas.length} tarea(s) vuelven a "sin asignar".`)) return
                          eliminarPuesto(p.id)
                        }} title="Eliminar puesto" style={{
                          background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6,
                          width: 28, height: 28, cursor: 'pointer', fontSize: 13, flexShrink: 0,
                        }}>🗑</button>
                      )}
                    </div>
                    <div>
                      <LoadBar cs={p.tcCs} taktCs={taktCs} escalaCs={escalaCs} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        <span>Carga <b style={{ color: over ? '#c62828' : 'var(--text-primary)' }}>{fmtMMSS(p.tcCs)}</b> por equipo</span>
                        {taktCs > 0 && <span>{Math.round((p.tcCs / taktCs) * 100)}% del takt</span>}
                      </div>
                    </div>
                    {p.asignadas.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: '#9e9e9e', fontStyle: 'italic' }}>Sin tareas — tocá una tarea de la bandeja para asignársela.</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {p.asignadas.map(t => (
                          <TareaChip key={t.code} t={t} cant={t.cant} share={t.share} tone="asignada" onClick={() => setMenuCode(t.code)} />
                        ))}
                      </div>
                    )}
                    {p.asignadas.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', borderTop: '1px dashed #eee', paddingTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                        Capacidad (turno de {fmtNum(Number(horasTurno) || 0)} h): <b style={{ color: 'var(--text-primary)' }}>{fmtNum(p.unHs)}</b> eq/h · <b style={{ color: 'var(--text-primary)' }}>{fmtNum(p.unTurno)}</b> eq/turno · <b style={{ color: 'var(--text-primary)' }}>{fmtNum(p.unDia)}</b> eq/día
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Paso 4 — Resultado */}
          <div className="detail-section" style={{ marginBottom: 12 }}>
            <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StepNum n={4} /> Resultado con este armado
            </div>
            {!bottleneck ? (
              <div style={{ padding: '14px 16px', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Asigná al menos una tarea a un puesto para ver el resultado.
              </div>
            ) : (
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  La línea avanza al ritmo del puesto más cargado (<b>{bottleneck.nombre}</b>, {fmtMMSS(bottleneck.tcCs)} por equipo):
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, margin: '6px 0 4px', fontVariantNumeric: 'tabular-nums' }}>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Equipos/hora: </span><b>{fmtNum(bottleneck.unHs)}</b></div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Equipos/turno: </span><b>{fmtNum(bottleneck.unTurno)}</b></div>
                  <div><span style={{ color: 'var(--text-secondary)' }}>Equipos/día: </span><b>{fmtNum(bottleneck.unDia)}</b></div>
                </div>
                {meta > 0 && (
                  <div style={{
                    marginTop: 8, padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: plazoN && diasParaMeta > plazoN ? '#ffebee' : '#e8f5e9',
                    color: plazoN && diasParaMeta > plazoN ? '#c62828' : '#2e7d32',
                  }}>
                    {plazoN && diasParaMeta > plazoN ? '⚠️' : '✅'} {meta} equipos en ≈ {fmtNum(diasParaMeta)} días ({fmtNum(turnosParaMeta)} turnos · {fmtHoras(horasParaMeta)})
                    {plazoN ? (diasParaMeta > plazoN ? ` — no llega al plazo de ${plazoN} días` : ` — dentro del plazo de ${plazoN} días`) : ''}
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 6 }}>Ya incluye el % de eficiencia.</div>

                <button onClick={() => setShowDetalle(!showDetalle)} style={{
                  marginTop: 10, background: 'none', border: '1.5px solid #e0e0e0', borderRadius: 8,
                  padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: 'var(--primary)',
                }}>{showDetalle ? '▲ Ocultar detalle por puesto' : '▼ Ver detalle por puesto (unidades y tiempo de cada tarea)'}</button>

                {showDetalle && activos.map(p => (
                  <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.nombre}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                        TC {fmtMMSS(p.tcCs)} · ocupación {bottleneck.tcCs > 0 ? Math.round((p.tcCs / bottleneck.tcCs) * 100) : 0}%
                      </span>
                    </div>
                    {p.asignadas.length > 1 && (
                      <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginBottom: 4, lineHeight: 1.5 }}>
                        El puesto arma una unidad de cada tarea por ciclo (cascada): la cantidad rinde igual para todas, pero cada una ocupa distinto tiempo del turno.
                      </div>
                    )}
                    {p.asignadas.map(t => {
                      const u = unidadesTarea(porPuesto, t.code)
                      const tiempoTurnoSeg = (t.tStd / 100) * t.share * u.turno
                      return (
                        <div key={t.code} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0', flexWrap: 'wrap' }}>
                          <span style={{ color: '#555' }}>
                            {t.code} <span style={{ color: '#999' }}>({fmtMMSS(t.tStd)} c/u{t.cant > 1 ? ` ×${t.cant}` : ''}{t.share < 1 ? ` · ${Math.round(t.share * 100)}% de la tarea` : ''})</span>
                          </span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {fmtNum(u.turno)}/turno · {fmtNum(u.dia)}/día · ocupa {fmtDuracionSeg(tiempoTurnoSeg)} del turno
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hoja de una tarea: a qué puesto va, cantidad y división */}
      {tareaMenu && (
        <div className="modal-overlay" onClick={() => setMenuCode(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <h2 style={{ marginBottom: 2 }}>{tareaMenu.code}</h2>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{tareaMenu.desc}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              Tiempo estándar <b style={{ color: 'var(--text-primary)' }}>{fmtMMSS(tareaMenu.tStd)}</b> · {tareaMenu.n} medición{tareaMenu.n !== 1 ? 'es' : ''} · medido en {tareaMenu.origen}
            </div>

            <div style={{ ...labelStyle, fontSize: 12, marginTop: 16, marginBottom: 6 }}>¿Qué puesto la hace?</div>
            {puestos.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Primero creá los puestos (paso 2 "Armar" o "+ Puesto").</div>
            ) : entMenu.length === 2 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Está dividida entre 2 puestos (ver abajo).</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 6 }}>
                {[{ id: '', nombre: 'Sin asignar' }, ...puestos].map(p => {
                  const sel = (entMenu[0]?.puestoId || '') === p.id
                  return (
                    <button key={p.id || 'none'} disabled={readOnly} onClick={() => asignarTarea(tareaMenu.code, p.id)} style={{
                      padding: '9px 8px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: readOnly ? 'default' : 'pointer',
                      border: `1.5px solid ${sel ? 'var(--primary)' : '#e0e0e0'}`,
                      background: sel ? 'var(--primary)' : (p.id ? '#fff' : '#fafafa'),
                      color: sel ? '#fff' : (p.id ? 'var(--text-primary)' : 'var(--text-secondary)'),
                    }}>{sel ? '✓ ' : ''}{p.nombre}</button>
                  )
                })}
              </div>
            )}

            <div style={{ ...labelStyle, fontSize: 12, marginTop: 16, marginBottom: 6 }}>Unidades por equipo terminado</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6, 8, 10].map(v => {
                const sel = cantDe(tareaMenu.code) === v
                return (
                  <button key={v} disabled={readOnly} onClick={() => cambiarCantidad(tareaMenu.code, v)} style={{
                    minWidth: 40, padding: '6px 8px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: readOnly ? 'default' : 'pointer',
                    border: `1.5px solid ${sel ? 'var(--primary)' : '#e0e0e0'}`, background: sel ? 'var(--primary)' : '#fff', color: sel ? '#fff' : 'var(--text-primary)',
                  }}>×{v}</button>
                )
              })}
            </div>

            {tareaMenu.origen === 'Preformado' && (
              <>
                <div style={{ ...labelStyle, fontSize: 12, marginTop: 16, marginBottom: 6 }}>✂️ Dividir entre 2 puestos (solo Preformado)</div>
                {entMenu.length === 2 ? (
                  <>
                    {[0, 1].map(i => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <select value={entMenu[i].puestoId} disabled={readOnly}
                          onChange={e => i === 0
                            ? dividirTarea(tareaMenu.code, e.target.value, entMenu[1].puestoId, entMenu[0].pct)
                            : dividirTarea(tareaMenu.code, entMenu[0].puestoId, e.target.value, entMenu[0].pct)}
                          style={{ ...selectStyle, fontSize: 13 }}>
                          {puestos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                        {i === 0 ? (
                          <select value={entMenu[0].pct} disabled={readOnly}
                            onChange={e => dividirTarea(tareaMenu.code, entMenu[0].puestoId, entMenu[1].puestoId, Number(e.target.value))}
                            style={{ ...selectStyle, flex: '0 0 80px', fontSize: 13 }}>
                            {Array.from({ length: 19 }, (_, k) => (k + 1) * 5).map(v => <option key={v} value={v}>{v}%</option>)}
                          </select>
                        ) : (
                          <span style={{ flex: '0 0 80px', textAlign: 'center', fontSize: 13, fontWeight: 700 }}>{entMenu[1].pct}%</span>
                        )}
                      </div>
                    ))}
                    {!readOnly && (
                      <button onClick={() => asignarTarea(tareaMenu.code, entMenu[0].puestoId)} style={{ background: 'none', border: 'none', color: '#c62828', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                        ✕ Quitar división (queda entera en el primero)
                      </button>
                    )}
                  </>
                ) : puestos.length < 2 || entMenu.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Asignala primero a un puesto (y que haya al menos 2 puestos).</div>
                ) : !readOnly && (
                  <button onClick={() => {
                    const otro = puestos.find(p => p.id !== entMenu[0].puestoId)
                    if (otro) dividirTarea(tareaMenu.code, entMenu[0].puestoId, otro.id, 50)
                  }} style={{
                    background: '#fff', border: '1.5px dashed var(--primary)', color: 'var(--primary)', borderRadius: 8,
                    padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  }}>✂️ Dividir 50 / 50 con otro puesto</button>
                )}
              </>
            )}

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setMenuCode(null)}>Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
