// Cálculo de los indicadores (KPIs) del Tablero. Solo LEE lo que ya está
// guardado — no escribe nada ni cambia ningún cálculo de las otras pantallas.
import { PUESTOS_MEDICION, buildTareas, parseTakt } from '../soldadura/puestosCalc'
import { claveModelo } from '../soldadura/secuenciaExcel'

export const PUESTOS_TUB = ['OMS-1', 'OMS-2', 'TJ-1', 'TJ-2', 'TJ-3', 'TJ-4', 'BLM', 'CC', 'CTDA']

// Metas por defecto (se pueden cambiar desde "⚙️ Metas", se guardan en config/tablero_metas)
export const METAS_DEFAULT = {
  solCobertura:   { meta: 90,  mejor: 'mayor', unidad: '%', nombre: 'Soldadura medida',        ayuda: '% de tareas (subconjuntos) con al menos 1 medición' },
  solConfiable:   { meta: 70,  mejor: 'mayor', unidad: '%', nombre: 'Tiempos confiables',      ayuda: '% de tareas medidas con 2 o más mediciones' },
  solTakt:        { meta: 100, mejor: 'mayor', unidad: '%', nombre: 'Líneas con takt cargado', ayuda: '% de líneas (modelo + cap + línea) con Takt Time cargado' },
  solBalance:     { meta: 100, mejor: 'mayor', unidad: '%', nombre: 'Líneas que llegan al takt', ayuda: '% de líneas con puestos armados cuyo cuello de botella no pasa el takt' },
  tubCobertura:   { meta: 90,  mejor: 'mayor', unidad: '%', nombre: 'Tuberías medidas',        ayuda: '% de planos plantilla vigentes con al menos 1 medición' },
  planCobertura:  { meta: 80,  mejor: 'mayor', unidad: '%', nombre: 'Plan con tiempos',        ayuda: '% de los equipos del mes cuyos modelos tienen tiempos medidos' },
  calTubOk:       { meta: 97,  mejor: 'mayor', unidad: '%', nombre: 'Tuberías OK (30 días)',   ayuda: '% de controles OK en Auditoría de Tubería, últimos 30 días' },
  calSolOk:       { meta: 95,  mejor: 'mayor', unidad: '%', nombre: 'Soldadura OK (30 días)',  ayuda: '% de preguntas OK en Check List Soldadura, últimos 30 días' },
  calEvidencia:   { meta: 100, mejor: 'mayor', unidad: '%', nombre: 'NOK con evidencia',       ayuda: '% de NOK del Check List Soldadura con foto, últimos 30 días' },
  calPtOk:        { meta: 97,  mejor: 'mayor', unidad: '%', nombre: 'Prod. terminado OK',      ayuda: '% de preguntas OK en Check List Producto Terminado, últimos 30 días' },
  avisosCierre:   { meta: 3,   mejor: 'menor', unidad: ' d', nombre: 'Cierre de avisos',       ayuda: 'Días promedio que tarda en cerrarse un aviso (últimos 30 días)' },
  avisosViejos:   { meta: 0,   mejor: 'menor', unidad: '',  nombre: 'Avisos con +7 días',     ayuda: 'Avisos pendientes hace más de 7 días' },
  actividad:      { meta: 100, mejor: 'mayor', unidad: '%', nombre: 'Ritmo de mediciones',    ayuda: 'Mediciones de los últimos 7 días contra los 7 días anteriores (100% = igual ritmo)' },
}

const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '')
const DIA = 86400000

export function toMs(v) {
  if (!v) return 0
  if (typeof v === 'number') return v
  if (v.toDate) return v.toDate().getTime()
  if (v.seconds) return v.seconds * 1000
  const t = new Date(v).getTime()
  return isNaN(t) ? 0 : t
}

// 'YYYY-MM-DD' en hora local de una fecha guardada (texto o ISO)
function diaKey(f) {
  if (!f) return null
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)) return f
  const t = toMs(f)
  if (!t) return null
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function keyDeHoyMenos(dias) {
  return diaKey(new Date(Date.now() - dias * DIA))
}

export function estadoDe(valor, meta, mejor) {
  if (valor == null || meta == null || Number.isNaN(valor)) return 'gris'
  if (mejor === 'menor') {
    if (valor <= meta) return 'verde'
    return valor <= meta + Math.max(1, meta * 0.5) ? 'naranja' : 'rojo'
  }
  if (valor >= meta) return 'verde'
  return valor >= meta * 0.85 ? 'naranja' : 'rojo'
}

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null)

// Tareas de un modelo con la misma clave que usan las mediciones (||P cuando
// un Parcial comparte código con su propio Completo).
function tareasDe(modelo) {
  const out = []
  for (const s of (modelo.subconjuntos || [])) {
    const codeC = s.codCompleto || s.codigo
    if (!codeC) continue
    out.push({ code: codeC, storageKey: codeC })
    for (const par of (s.parciales || [])) {
      if (!par.codParcial) continue
      out.push({ code: par.codParcial, storageKey: par.codParcial === codeC ? `${par.codParcial}||P` : par.codParcial })
    }
  }
  return out
}

function nMediciones(tiemposDoc, storageKey) {
  let n = 0
  for (const p of PUESTOS_MEDICION) n += tiemposDoc?.[storageKey]?.[p]?.mediciones?.length || 0
  return n
}

const PLAN_A_SOL = { 'IDU': 'IDU', 'ODU I': 'ODU', 'ODU II': 'ODU2' }

export function calcularTablero(d, metasGuardadas = {}) {
  const metas = {}
  for (const k of Object.keys(METAS_DEFAULT)) {
    const g = Number(metasGuardadas?.[k])
    const hay = metasGuardadas?.[k] !== undefined && metasGuardadas?.[k] !== '' && !Number.isNaN(g)
    metas[k] = { ...METAS_DEFAULT[k], meta: hay ? g : METAS_DEFAULT[k].meta }
  }
  const kpis = {}
  const alertas = []
  const extra = {}
  const mk = (id, valor, detalle, path, grupo) => {
    kpis[id] = { id, grupo, ...metas[id], valor, detalle, path, estado: estadoDe(valor, metas[id].meta, metas[id].mejor) }
  }

  // ───────── Soldadura: cobertura y confiabilidad ─────────
  const modelos = d.modelos || []
  const tiemposSol = d.tiemposSol || {}
  let tTot = 0, tMed = 0, tConf = 0
  const porModelo = []
  for (const m of modelos) {
    const ts = tareasDe(m)
    if (!ts.length) continue
    let med = 0, conf = 0
    for (const t of ts) {
      const n = nMediciones(tiemposSol[m.id], t.storageKey)
      if (n >= 1) med++
      if (n >= 2) conf++
    }
    tTot += ts.length; tMed += med; tConf += conf
    porModelo.push({ nombre: `${m.modelo || m.id} · ${m.cap || ''}`.trim(), total: ts.length, medidas: med, pct: pct(med, ts.length) })
  }
  porModelo.sort((a, b) => a.pct - b.pct)
  extra.solPorModelo = porModelo
  mk('solCobertura', pct(tMed, tTot), `${tMed} de ${tTot} tareas medidas`, '/soldadura', 'proceso')
  mk('solConfiable', pct(tConf, tMed), `${tMed - tConf} con una sola medición`, '/soldadura/tiempos', 'proceso')

  // ───────── Soldadura: takt cargado ─────────
  const takt = d.takt || {}
  let lTot = 0, lConTakt = 0
  const sinTakt = []
  for (const m of modelos) {
    const lineas = [...new Set((m.subconjuntos || []).map(s => s.linea).filter(Boolean))]
    for (const l of lineas) {
      lTot++
      if (parseTakt(takt[`${m.id}||${l}`] || takt[m.id] || '') > 0) lConTakt++
      else sinTakt.push(`${m.modelo || m.id} ${m.cap || ''} ${l}`.replace(/\s+/g, ' ').trim())
    }
  }
  extra.sinTakt = sinTakt
  mk('solTakt', pct(lConTakt, lTot), `${sinTakt.length} líneas sin takt`, '/soldadura/takttime', 'proceso')

  // ───────── Soldadura: líneas armadas que llegan al takt ─────────
  const pasanTakt = []
  let armadas = 0, llegan = 0
  for (const [id, pd] of Object.entries(d.puestosDocs || {})) {
    if (!pd?.puestos?.length || !pd?.asignaciones?.length) continue
    const [docId, linea] = id.split('||')
    const md = modelos.find(m => m.id === docId)
    if (!md || !linea) continue
    const subs = (md.subconjuntos || []).filter(s => (!s.tipo || s.tipo === 'Completo') && norm(s.linea) === norm(linea))
    const tareas = buildTareas(subs, tiemposSol[docId] || {})
    const cants = pd.cantidades || {}
    const asigPorCode = {}
    pd.asignaciones.forEach(a => { (asigPorCode[a.code] = asigPorCode[a.code] || []).push(a) })
    let mayor = 0
    for (const p of pd.puestos) {
      let tc = 0
      for (const t of tareas) {
        const e = (asigPorCode[t.code] || []).find(x => x.puestoId === p.id)
        if (e) tc += t.tStd * (Number(cants[t.code]) || 1) * ((e.pct ?? 100) / 100)
      }
      if (tc > mayor) mayor = tc
    }
    const taktCs = parseTakt(takt[id] || takt[docId] || '')
    if (taktCs <= 0 || mayor <= 0) continue
    armadas++
    if (mayor <= taktCs) llegan++
    else pasanTakt.push({ nombre: `${md.modelo || md.id} ${md.cap || ''} ${linea}`.replace(/\s+/g, ' ').trim(), seg: Math.round((mayor - taktCs) / 100) })
  }
  pasanTakt.sort((a, b) => b.seg - a.seg)
  extra.pasanTakt = pasanTakt
  mk('solBalance', pct(llegan, armadas), armadas ? `${armadas} líneas armadas y con takt` : 'Todavía no hay puestos armados con takt', '/soldadura/puestos', 'proceso')

  // ───────── Tuberías: cobertura de planos plantilla ─────────
  const vigentes = d.tubMeta?.modelos ? new Set(d.tubMeta.modelos.map(m => m.nombre)) : null
  if (d.ppItems) {
    const vistos = new Set()
    let total = 0, medidos = 0
    const pm = {}
    for (const it of d.ppItems) {
      if (vigentes && !vigentes.has(it.modelo)) continue
      const plano = String(it.plano)
      const medido = PUESTOS_TUB.some(p => d.tiemposTub?.[plano]?.[p]?.mediciones?.length > 0)
      const k = pm[it.modelo] = pm[it.modelo] || { nombre: it.modelo, total: 0, medidas: 0, vistos: new Set() }
      if (!k.vistos.has(plano)) { k.vistos.add(plano); k.total++; if (medido) k.medidas++ }
      if (!vistos.has(plano)) { vistos.add(plano); total++; if (medido) medidos++ }
    }
    extra.tubPorModelo = Object.values(pm)
      .map(r => ({ nombre: r.nombre, total: r.total, medidas: r.medidas, pct: pct(r.medidas, r.total) }))
      .sort((a, b) => a.pct - b.pct)
    mk('tubCobertura', pct(medidos, total), `${medidos} de ${total} planos medidos`, '/tuberias/cobertura', 'proceso')
  } else {
    mk('tubCobertura', null, 'Cargando planos…', '/tuberias/cobertura', 'proceso')
  }

  // ───────── Plan del mes ─────────
  const sec = [...(d.secuencia || [])].sort((a, b) => a.id.localeCompare(b.id))
  const mesDoc = sec[sec.length - 1]
  if (mesDoc) {
    let totalQty = 0, qtyMed = 0, sinApp = 0
    const faltan = []
    for (const it of (mesDoc.items || [])) {
      const solLinea = PLAN_A_SOL[it.linea]
      const md = modelos.find(m => claveModelo(m.modelo || m.id) === claveModelo(it.plataforma) && norm(m.cap) === norm(it.cap))
      const subs = md ? (md.subconjuntos || []).filter(s => (!s.tipo || s.tipo === 'Completo') && norm(s.linea) === norm(solLinea)) : []
      const tareas = md && subs.length ? buildTareas(subs, tiemposSol[md.id] || {}) : []
      totalQty += it.qty
      if (tareas.length) qtyMed += it.qty
      else {
        if (!md) sinApp += it.qty
        faltan.push({ nombre: `${it.plataforma} ${it.cap} · ${it.linea}`, qty: it.qty, enApp: !!md })
      }
    }
    faltan.sort((a, b) => b.qty - a.qty)
    extra.plan = { mes: mesDoc.id, totalQty, qtyMed, faltan, sinApp }
    mk('planCobertura', pct(qtyMed, totalQty), `${totalQty.toLocaleString('es-AR')} equipos en ${mesDoc.id}`, '/soldadura/puestos', 'plan')
  } else {
    mk('planCobertura', null, 'Importá la Secuencia del mes', '/soldadura/puestos', 'plan')
  }

  // ───────── Calidad (últimos 30 días) ─────────
  const desde = keyDeHoyMenos(30)
  const enVentana = r => (r.fecha || '') >= desde
  const CTRL = ['planoPlantillaConformado', 'diametroInternoHolgado', 'diametroInternoAjustado', 'virolado', 'abocardado', 'reduccion', 'punzonado', 'aplastamiento', 'estrangulamiento']
  const CTRL_NOM = { planoPlantillaConformado: 'Plano plantilla', diametroInternoHolgado: 'Ø int. holgado', diametroInternoAjustado: 'Ø int. ajustado', virolado: 'Virolado', abocardado: 'Abocardado', reduccion: 'Reducción', punzonado: 'Punzonado', aplastamiento: 'Aplastamiento', estrangulamiento: 'Estrangulamiento' }
  let ok = 0, nook = 0
  const porMaq = {}, porCtrl = {}
  for (const r of (d.auditorias || []).filter(enVentana)) {
    for (const c of CTRL) {
      if (r[c] === 'OK') ok++
      else if (r[c] === 'NOOK') {
        nook++
        const mq = (r.maquina || 'Sin máquina').toString().trim().toUpperCase()
        porMaq[mq] = (porMaq[mq] || 0) + 1
        porCtrl[CTRL_NOM[c]] = (porCtrl[CTRL_NOM[c]] || 0) + 1
      }
    }
  }
  const top = o => Object.entries(o).map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n).slice(0, 4)
  extra.calTub = { ok, nook, maquinas: top(porMaq), controles: top(porCtrl) }
  mk('calTubOk', pct(ok, ok + nook), `${nook} NOOK en ${ok + nook} controles`, '/calidad/tuberia', 'calidad')

  let sOk = 0, sNok = 0, sNokFoto = 0
  const porCat = { 1: 0, 2: 0, 3: 0 }
  for (const r of (d.chkSol || []).filter(enVentana)) {
    for (const [qid, resp] of Object.entries(r.respuestas || {})) {
      if (resp?.resultado === 'OK') sOk++
      else if (resp?.resultado === 'NOK') {
        sNok++
        if (resp.fotoUrl) sNokFoto++
        const c = Number(String(qid).charAt(0))
        if (porCat[c] != null) porCat[c]++
      }
    }
  }
  extra.calSol = { ok: sOk, nok: sNok, sinFoto: sNok - sNokFoto, porCat }
  mk('calSolOk', pct(sOk, sOk + sNok), `${sNok} NOK en ${sOk + sNok} preguntas`, '/calidad/soldadura', 'calidad')
  mk('calEvidencia', sNok > 0 ? pct(sNokFoto, sNok) : null, sNok > 0 ? `${sNok - sNokFoto} NOK sin foto` : 'Sin NOK en 30 días', '/calidad/soldadura', 'calidad')

  let pOk = 0, pNok = 0
  for (const r of (d.chkPT || []).filter(enVentana)) {
    for (const l of Object.values(r.lineas || {})) {
      for (const m of (l || [])) {
        for (const resp of Object.values(m?.respuestas || {})) {
          if (resp?.resultado === 'OK') pOk++
          else if (resp?.resultado === 'NOK') pNok++
        }
      }
    }
  }
  mk('calPtOk', pct(pOk, pOk + pNok), `${pNok} NOK en ${pOk + pNok} preguntas`, '/calidad/producto-terminado', 'calidad')

  // ───────── Avisos ─────────
  const ahora = Date.now()
  const realizado = a => a.estado === 'realizado' || a.estado === 'hecho' || !!a.resolvedAt
  const creadoDe = a => toMs(a.creadoEn) || toMs(a.fecha)
  const pend = (d.avisos || []).filter(a => !realizado(a))
  const viejos = pend.filter(a => { const c = creadoDe(a); return c && ahora - c > 7 * DIA })
  const prio = a => a.prioridad || (['urgente', 'alta', 'atencion'].includes(a.estado) ? a.estado : 'normal')
  const porPrio = { urgente: 0, alta: 0, atencion: 0, normal: 0 }
  pend.forEach(a => { const p = prio(a); porPrio[p] = (porPrio[p] || 0) + 1 })
  const cierres = (d.avisos || []).filter(realizado).map(a => {
    const c = creadoDe(a), f = toMs(a.resolvedAt) || toMs(a.cerradoEn)
    return c && f && f >= c && ahora - f <= 30 * DIA ? (f - c) / DIA : null
  }).filter(x => x != null)
  const prom = cierres.length ? Math.round((cierres.reduce((a, b) => a + b, 0) / cierres.length) * 10) / 10 : null
  const diasViejos = viejos.map(a => Math.floor((ahora - creadoDe(a)) / DIA)).sort((a, b) => b - a)
  const masViejo = diasViejos[0]
  const avisoViejo = [...viejos].sort((a, b) => creadoDe(a) - creadoDe(b))[0]
  extra.avisos = { pendientes: pend.length, porPrio, masViejo, puestoViejo: avisoViejo?.puesto || '' }
  mk('avisosCierre', prom, cierres.length ? `${cierres.length} avisos cerrados en 30 días` : 'Sin avisos cerrados en 30 días', '/avisos', 'mejora')
  mk('avisosViejos', viejos.length, `${pend.length} pendientes en total`, '/avisos', 'mejora')

  // ───────── Actividad de mediciones ─────────
  const dias = {}
  const vistosMed = new Set()
  const sumar = f => { const k = diaKey(f); if (k) dias[k] = (dias[k] || 0) + 1 }
  for (const doc of Object.values(tiemposSol)) {
    for (const [sk, val] of Object.entries(doc || {})) {
      if (!val || typeof val !== 'object') continue
      for (const p of PUESTOS_MEDICION) {
        for (const med of (val[p]?.mediciones || [])) {
          // Un subconjunto compartido entre modelos se guarda en cada uno: se cuenta una sola vez
          const h = `${sk}|${p}|${med.tiempoObs}|${med.fecha}|${med.operario || ''}`
          if (vistosMed.has(h)) continue
          vistosMed.add(h)
          sumar(med.fecha)
        }
      }
    }
  }
  for (const doc of Object.values(d.tiemposTub || {})) {
    for (const p of PUESTOS_TUB) for (const med of (doc?.[p]?.mediciones || [])) sumar(med.fecha)
  }
  const serie = []
  for (let i = 13; i >= 0; i--) { const k = keyDeHoyMenos(i); serie.push({ dia: k, n: dias[k] || 0 }) }
  const ult7 = serie.slice(7).reduce((a, x) => a + x.n, 0)
  const ant7 = serie.slice(0, 7).reduce((a, x) => a + x.n, 0)
  extra.actividad = { serie, ult7, ant7 }
  mk('actividad', ant7 > 0 ? Math.round((ult7 / ant7) * 100) : (ult7 > 0 ? 100 : null), `${ult7} mediciones esta semana · ${ant7} la anterior`, '/soldadura/tiempos', 'proceso')

  // ───────── Atención hoy ─────────
  pasanTakt.slice(0, 3).forEach(l => alertas.push({ nivel: 'rojo', texto: `${l.nombre} pasa el takt por ${l.seg} s`, sub: 'Falta una persona o hay que mover una tarea', path: '/soldadura/puestos' }))
  if (extra.plan?.faltan?.length && kpis.planCobertura.estado !== 'verde') {
    const f = extra.plan.faltan[0]
    alertas.push({ nivel: kpis.planCobertura.estado === 'rojo' ? 'rojo' : 'naranja', texto: `Plan ${extra.plan.mes}: falta medir ${f.nombre}`, sub: `${f.qty.toLocaleString('es-AR')} equipos${f.enApp ? '' : ' · el modelo no está cargado en la app'}`, path: '/soldadura' })
  }
  if (sNok - sNokFoto > 0) alertas.push({ nivel: 'naranja', texto: `${sNok - sNokFoto} NOK sin foto de evidencia`, sub: 'Check List Soldadura, últimos 30 días', path: '/calidad/soldadura' })
  if (viejos.length) alertas.push({ nivel: masViejo > 14 ? 'rojo' : 'naranja', texto: `${viejos.length} aviso${viejos.length > 1 ? 's' : ''} con más de 7 días`, sub: `El más viejo lleva ${masViejo} días${extra.avisos.puestoViejo ? ' · ' + extra.avisos.puestoViejo : ''}`, path: '/avisos' })
  if (porPrio.urgente > 0) alertas.push({ nivel: 'rojo', texto: `${porPrio.urgente} aviso${porPrio.urgente > 1 ? 's' : ''} urgente${porPrio.urgente > 1 ? 's' : ''} pendiente${porPrio.urgente > 1 ? 's' : ''}`, sub: 'Tablón de avisos', path: '/avisos' })
  if (sinTakt.length) alertas.push({ nivel: 'naranja', texto: `${sinTakt.length} líneas sin Takt Time cargado`, sub: sinTakt.slice(0, 2).join(' · ') + (sinTakt.length > 2 ? '…' : ''), path: '/soldadura/takttime' })
  ;['solCobertura', 'tubCobertura', 'calTubOk', 'calSolOk', 'calPtOk'].forEach(id => {
    const k = kpis[id]
    if (k.estado === 'rojo') alertas.push({ nivel: 'rojo', texto: `${k.nombre}: ${k.valor}${k.unidad} (meta ${k.meta}${k.unidad})`, sub: k.detalle, path: k.path })
  })
  alertas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'rojo' ? -1 : 1))

  return { kpis, alertas, extra, metas }
}
