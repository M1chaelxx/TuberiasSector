import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, doc, setDoc, FieldPath } from 'firebase/firestore'
import Header from '../../components/Header'
import { db } from '../../firebase'
import { useAuth } from '../../context/AuthContext'
import { fmtDuracionSeg, fmtNum } from './puestosCalc'
import { importarSecuencia } from './secuenciaImport'
import {
  PLAN_LINEAS, PLAN_A_SOL, calcularPlan, semanasDe, mesesDe, diasDeMes, unirDiario, lunesDe,
  gruposDias, celdaGrupo, tareasDePuesto, cascadaDePuesto, nivel, pctTexto, faltaTexto,
} from './planSemanalCalc'
import { exportPlanSemanalPdf } from './exportPlanSemanalPdf'

// Plan semanal / mensual: toma los puestos ya armados de cada modelo (pantalla
// Puestos) y la secuencia de producción por día, y muestra cuánto tiempo
// necesita cada puesto cada día contra el tiempo disponible del turno. Es solo
// lectura: no cambia puestos ni mediciones; lo único que se guarda son las horas
// y la eficiencia de cada línea/período y los turnos cargados a mano
// (config/plan_semanal).

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const fechaCorta = f => { const [, m, d] = f.split('-'); return `${d}/${m}` }
const diaNombre = f => DIAS[new Date(f + 'T00:00:00Z').getUTCDay()]
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const ent = n => (isFinite(n) ? Math.round(n).toLocaleString('es-AR') : '—')
function nombreMes(id) {
  const [y, m] = String(id).split('-').map(Number)
  if (!y || !m) return id
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const TONOS = {
  vacio: { bg: '#f5f5f5', fg: '#999', bd: '#e0e0e0' },
  rojo: { bg: '#ffebee', fg: '#c62828', bd: '#ef9a9a' },
  naranja: { bg: '#fff3e0', fg: '#e65100', bd: '#ffcc80' },
  verde: { bg: '#e8f5e9', fg: '#2e7d32', bd: '#a5d6a7' },
}
const tono = pct => TONOS[nivel(pct)]

// Gráfico de cascada horizontal: una fila por tarea; cada barra arranca donde
// terminó la anterior. La línea punteada marca el fin del tiempo disponible y
// lo que queda a la derecha (rojo) no entra en el turno.
function Cascada({ cas }) {
  const escala = Math.max(cas.total, cas.disp, 1)
  const pos = v => `${(v / escala) * 100}%`
  const linea = cas.disp > 0 && (
    <div style={{ position: 'absolute', top: -2, bottom: -2, left: pos(cas.disp), borderLeft: '2px dashed #263238', zIndex: 2 }} />
  )
  const barra = (inicio, seg, base) => {
    const fin = inicio + seg
    const dentro = Math.max(0, Math.min(fin, cas.disp || 0) - inicio)
    const fuera = seg - dentro
    return (
      <>
        {dentro > 0 && <div style={{ position: 'absolute', top: 3, bottom: 3, left: pos(inicio), width: pos(dentro), background: base, borderRadius: 3 }} />}
        {fuera > 0 && <div style={{ position: 'absolute', top: 3, bottom: 3, left: pos(inicio + dentro), width: pos(fuera), background: '#e53935', borderRadius: 3 }} />}
      </>
    )
  }
  const fila = (k, label, sub, inicio, seg, texto, base, negrita) => (
    <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 34%) 1fr 72px', gap: 8, alignItems: 'center', minHeight: 30 }}>
      <div style={{ fontSize: 11.5, lineHeight: 1.25, overflow: 'hidden', fontWeight: negrita ? 800 : 500 }}>
        {label}{sub && <div style={{ color: 'var(--text-secondary)', fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>
      <div style={{ position: 'relative', height: 24, background: '#f5f7fa', borderRadius: 4 }}>
        {barra(inicio, seg, base)}
        {linea}
      </div>
      <div style={{ fontSize: 11, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: negrita ? 800 : 600, whiteSpace: 'nowrap' }}>{texto}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {cas.filas.map(f => fila(
        `${f.plataforma}${f.cap}${f.code}`,
        <><b>{f.code}</b> · {f.desc}</>,
        `${f.plataforma} ${f.cap} · ${fmtNum(f.units)} u`,
        f.inicio, f.seg, fmtDuracionSeg(f.seg), '#1e88e5',
      ))}
      {fila('total', 'Total del puesto', cas.disp > 0 ? `disponible ${fmtDuracionSeg(cas.disp)}` : 'sin turno', 0, cas.total, fmtDuracionSeg(cas.total), '#455a64', true)}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 34%) 1fr 72px', gap: 8 }}>
        <div />
        <div style={{ position: 'relative', height: 14, fontSize: 9.5, color: 'var(--text-secondary)' }}>
          <span style={{ position: 'absolute', left: 0 }}>0</span>
          {cas.disp > 0 && <span style={{ position: 'absolute', left: pos(cas.disp), transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontWeight: 700, color: '#263238' }}>fin del turno</span>}
        </div>
        <div />
      </div>
    </div>
  )
}

export default function SoldaduraPlanSemanal() {
  const { isProduccion } = useAuth()
  const readOnly = isProduccion
  const [docs, setDocs] = useState([])
  const [modelos, setModelos] = useState([])
  const [tiemposAll, setTiemposAll] = useState({})
  const [puestosAll, setPuestosAll] = useState({})
  const [guardados, setGuardados] = useState({})
  const [planLinea, setPlanLinea] = useState('IDU')
  const [modo, setModo] = useState('semana') // 'semana' | 'mes'
  const [lunes, setLunes] = useState('')
  const [mes, setMes] = useState('')
  const [horasIn, setHorasIn] = useState(null) // null = usar guardado/sugerido
  const [eficIn, setEficIn] = useState(null)
  const [turnosIn, setTurnosIn] = useState({}) // { fecha: texto } mientras se edita
  const [verTareas, setVerTareas] = useState(true)
  const [alcance, setAlcance] = useState({}) // puesto -> 'todo' | índice de día (cascada)
  const [verDetalle, setVerDetalle] = useState({}) // puesto -> bool (tabla de cantidades)
  const [importando, setImportando] = useState(false)

  useEffect(() => {
    const us = [
      onSnapshot(collection(db, 'soldadura_secuencia'), s => setDocs(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id))), () => {}),
      onSnapshot(collection(db, 'soldadura_modelos'), s => setModelos(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => {}),
      onSnapshot(collection(db, 'soldadura_tiempos'), s => { const m = {}; s.docs.forEach(d => { m[d.id] = d.data() }); setTiemposAll(m) }, () => {}),
      onSnapshot(collection(db, 'soldadura_puestos'), s => { const m = {}; s.docs.forEach(d => { m[d.id] = d.data() }); setPuestosAll(m) }, () => {}),
      onSnapshot(doc(db, 'config', 'plan_semanal'), s => setGuardados(s.exists() ? s.data() : {}), () => {}),
    ]
    return () => us.forEach(u => u())
  }, [])

  const diario = useMemo(() => unirDiario(docs), [docs])
  const semanas = useMemo(() => semanasDe(diario), [diario])
  const meses = useMemo(() => mesesDe(diario), [diario])

  // Arranque: la semana/mes de hoy o el próximo con producción; si ya pasaron todos, el último
  useEffect(() => {
    if (!semanas.length || semanas.includes(lunes)) return
    const hoy = lunesDe(hoyISO())
    setLunes(semanas.find(s => s >= hoy) || semanas[semanas.length - 1])
  }, [semanas, lunes])
  useEffect(() => {
    if (!meses.length || meses.includes(mes)) return
    const hoy = hoyISO().slice(0, 7)
    setMes(meses.find(m => m >= hoy) || meses[meses.length - 1])
  }, [meses, mes])

  const esMes = modo === 'mes'
  const periodo = esMes ? mes : lunes
  useEffect(() => { setHorasIn(null); setEficIn(null); setTurnosIn({}); setAlcance({}) }, [planLinea, periodo, modo])

  const fechasMes = useMemo(() => (esMes && mes ? diasDeMes(diario, mes, planLinea) : null), [esMes, mes, diario, planLinea])
  const clave = `${planLinea}|${periodo}`
  const claveTurnos = `${planLinea}|turnos`
  const g = guardados[clave] || {}

  // Turnos cargados a mano: valen por fecha para la semana y el mes. Los de
  // versiones anteriores (guardados dentro de cada semana) se siguen leyendo;
  // `null` en la lista de la línea = volver al valor del Excel.
  const turnosGuardados = useMemo(() => {
    const o = {}
    Object.entries(guardados).forEach(([k, v]) => {
      if (k.startsWith(`${planLinea}|`) && k !== claveTurnos && v?.turnos) Object.assign(o, v.turnos)
    })
    Object.entries(guardados[claveTurnos] || {}).forEach(([f, v]) => { if (v === null) delete o[f]; else o[f] = v })
    return o
  }, [guardados, planLinea, claveTurnos])

  const turnosOverride = useMemo(() => {
    const o = { ...turnosGuardados }
    Object.entries(turnosIn).forEach(([f, v]) => { if (v !== '' && isFinite(Number(v))) o[f] = Number(v) })
    return o
  }, [turnosGuardados, turnosIn])

  const baseArgs = { diario, lunes, fechas: fechasMes || undefined, planLinea, modelos, tiemposAll, puestosAll }
  const listo = esMes ? !!(mes && fechasMes) : !!lunes
  const base = useMemo(() => (listo ? calcularPlan({ ...baseArgs, horas: 8, efic: 0.9 }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listo, diario, lunes, fechasMes, planLinea, modelos, tiemposAll, puestosAll])

  const sug = base?.sugerencia
  const horas = Number(horasIn ?? g.horas ?? sug?.horas ?? 8) || 0
  const eficPct = Number(eficIn ?? g.efic ?? sug?.efic ?? 90) || 0

  const plan = useMemo(() => (listo ? calcularPlan({ ...baseArgs, horas, efic: eficPct / 100, turnosOverride }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listo, diario, lunes, fechasMes, planLinea, modelos, tiemposAll, puestosAll, horas, eficPct, turnosOverride])

  // Columnas de las tablas de tareas: días en la semana, semanas en el mes
  const grupos = useMemo(() => (plan ? gruposDias(plan.dias, esMes) : []), [plan, esMes])

  async function guardarParam(patch) {
    if (readOnly || !periodo) return
    const entrada = { ...g, horas, efic: eficPct, ...patch } // conserva turnos de versiones anteriores
    try {
      await setDoc(doc(db, 'config', 'plan_semanal'), { [clave]: entrada }, { mergeFields: [new FieldPath(clave)] })
    } catch { /* sin permiso: queda solo en pantalla */ }
  }
  async function guardarTurnos(cambios) {
    if (readOnly) return
    const t = { ...(guardados[claveTurnos] || {}), ...cambios }
    try {
      await setDoc(doc(db, 'config', 'plan_semanal'), { [claveTurnos]: t }, { mergeFields: [new FieldPath(claveTurnos)] })
    } catch { /* sin permiso */ }
  }
  function guardarTurno(fecha) {
    const v = turnosIn[fecha]
    if (v === undefined) return
    if (v === '') { setTurnosIn(x => { const n = { ...x }; delete n[fecha]; return n }); guardarTurnos({ [fecha]: null }) }
    else if (isFinite(Number(v)) && Number(v) >= 0) guardarTurnos({ [fecha]: Number(v) })
  }
  function turnosDelExcel() {
    setTurnosIn({})
    const c = {}
    plan.dias.forEach(d => { c[d.fecha] = null })
    guardarTurnos(c)
  }
  function irAPuesto(key) {
    setVerTareas(true)
    setTimeout(() => document.getElementById(`plan-puesto-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  async function importar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    try {
      const ids = await importarSecuencia(file)
      alert(`✅ Secuencia importada: ${ids.length} mes(es).`)
    } catch (err) { alert('Error al importar la secuencia: ' + err.message) }
    setImportando(false)
    if (e.target) e.target.value = ''
  }

  const lista = esMes ? meses : semanas
  const idx = lista.indexOf(periodo)
  const setPeriodo = v => (esMes ? setMes(v) : setLunes(v))
  const periodoTxt = esMes ? 'del mes' : 'de la semana'
  const totalTxt = esMes ? 'Mes' : 'Semana'
  const rango = gr => {
    const f1 = plan.dias[gr.idxs[0]].fecha
    const f2 = plan.dias[gr.idxs[gr.idxs.length - 1]].fecha
    return f1 === f2 ? fechaCorta(f1) : `${fechaCorta(f1)}–${fechaCorta(f2)}`
  }
  const tituloGrupo = gr => (esMes ? rango(gr) : `${diaNombre(gr.key)} ${fechaCorta(gr.key)}`)

  const chip = activo => ({
    padding: '5px 12px', borderRadius: 16, border: '1.5px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    borderColor: activo ? '#333' : '#d0d0d0', background: activo ? '#333' : '#fff', color: activo ? '#fff' : 'var(--text-primary)',
  })
  const inp = { width: 64, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, textAlign: 'center', background: '#fff' }
  const card = { background: '#fff', borderRadius: 10, padding: '8px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
  const th = { padding: '6px 6px', fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center', whiteSpace: 'nowrap' }
  const sel = { padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, background: '#fff' }

  const sinDiario = docs.length > 0 && !semanas.length

  return (
    <div>
      <Header title="Plan semanal y mensual" back="/soldadura" />
      <div className="content" style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {PLAN_LINEAS.map(l => <button key={l} onClick={() => setPlanLinea(l)} style={chip(planLinea === l)}>{l}</button>)}
          <span style={{ width: 1, height: 22, background: '#ddd', margin: '0 2px' }} />
          <button onClick={() => setModo('semana')} style={chip(!esMes)}>Semana</button>
          <button onClick={() => setModo('mes')} style={chip(esMes)}>Mes</button>
          {!readOnly && (
            <label style={{
              marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--primary)',
              color: 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: importando ? 'wait' : 'pointer', background: '#fff',
            }}>
              {importando ? 'Importando…' : '📥 Importar secuencia (Excel)'}
              <input type="file" accept=".xlsx,.xls" onChange={importar} disabled={importando} style={{ display: 'none' }} />
            </label>
          )}
        </div>

        {!docs.length && (
          <div className="detail-section" style={{ padding: 16, fontSize: 13, lineHeight: 1.6 }}>
            Todavía no hay secuencia cargada. Importá el Excel de <b>Secuencia de producción</b> y acá se arma el plan.
          </div>
        )}
        {sinDiario && (
          <div className="detail-section" style={{ padding: 16, fontSize: 13, lineHeight: 1.6 }}>
            La secuencia cargada es de una versión anterior y no tiene las cantidades por día. <b>Volvé a importar el Excel</b> con el botón de arriba.
          </div>
        )}

        {plan && periodo && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <button onClick={() => idx > 0 && setPeriodo(lista[idx - 1])} disabled={idx <= 0} style={chip(false)}>‹</button>
              <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={sel}>
                {lista.map(s => <option key={s} value={s}>{esMes ? nombreMes(s) : `Semana del ${fechaCorta(s)}`}</option>)}
              </select>
              <button onClick={() => idx < lista.length - 1 && setPeriodo(lista[idx + 1])} disabled={idx >= lista.length - 1} style={chip(false)}>›</button>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Línea {planLinea} = soldadura {PLAN_A_SOL[planLinea]}</span>
              <button disabled={!plan.puestos.length} onClick={() => exportPlanSemanalPdf({ plan, planLinea, lineaSol: PLAN_A_SOL[planLinea], periodo, esMes, horas, eficPct })} style={{
                marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1.5px solid #2e7d32', color: '#2e7d32',
                background: '#fff', fontSize: 12, fontWeight: 700, cursor: plan.puestos.length ? 'pointer' : 'not-allowed', opacity: plan.puestos.length ? 1 : 0.5,
              }}>🖨 Imprimir (PDF)</button>
            </div>

            <div className="detail-section" style={{ padding: '10px 14px', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 12.5, fontWeight: 700 }}>Horas por turno{' '}
                  <input type="number" step="0.1" style={inp} value={horasIn ?? horas} disabled={readOnly}
                    onChange={e => setHorasIn(e.target.value)} onBlur={() => horasIn !== null && Number(horasIn) > 0 && guardarParam({ horas: Number(horasIn) })} />
                </label>
                <label style={{ fontSize: 12.5, fontWeight: 700 }}>Eficiencia %{' '}
                  <input type="number" style={inp} value={eficIn ?? eficPct} disabled={readOnly}
                    onChange={e => setEficIn(e.target.value)} onBlur={() => eficIn !== null && Number(eficIn) > 0 && guardarParam({ efic: Number(eficIn) })} />
                </label>
                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', flex: 1, minWidth: 180 }}>
                  {sug ? <>Sugerido por <b>{sug.modelo}</b>: {sug.horas} h · {sug.efic}%.</> : `Sin sugerencia: ningún modelo ${periodoTxt} tiene puestos armados.`}
                </span>
              </div>
              <div style={{ marginTop: 10, borderTop: '1px solid #eee', paddingTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>Turnos por día</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>salen del Excel; si cambiás uno queda en azul (vale igual para la semana y el mes)</span>
                  {!readOnly && plan.dias.some(d => d.turnosEditado) && (
                    <button onClick={turnosDelExcel} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--primary)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                      ↺ Volver a los del Excel
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {plan.dias.map(d => (
                    <label key={d.fecha} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10.5, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                      {diaNombre(d.fecha)} {fechaCorta(d.fecha)}
                      <input type="number" min="0" step="1" disabled={readOnly}
                        value={turnosIn[d.fecha] ?? d.turnos}
                        onChange={e => setTurnosIn(t => ({ ...t, [d.fecha]: e.target.value }))}
                        onBlur={() => guardarTurno(d.fecha)}
                        title={`Excel: ${d.turnosExcel || 0} turno(s)`}
                        style={{ ...inp, width: 52, borderColor: d.turnosEditado ? 'var(--primary)' : '#e0e0e0', color: d.turnosEditado ? 'var(--primary)' : 'inherit', fontWeight: 700 }} />
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 10 }}>
              <div style={card}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Equipos {periodoTxt}</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{ent(plan.equipos)}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{plan.modelos.length} modelo(s){esMes ? ` · ${plan.dias.length} días con producción` : ''}</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Puestos sobrecargados</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: plan.alertas.length ? '#c62828' : '#2e7d32' }}>{plan.alertas.length}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>puesto-día que pasa el turno</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Lo que falta {periodoTxt}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: plan.faltaSeg > 0 ? '#c62828' : '#2e7d32' }}>{plan.faltaSeg > 0 ? fmtDuracionSeg(plan.faltaSeg) : '0'}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{plan.faltaSeg > 0 ? `horas-persona extra · ≈ ${ent(plan.faltaEq)} equipos no salen` : 'todo entra en los turnos'}</div>
              </div>
              <div style={card}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Modelos sin armar</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: plan.modelos.some(m => !m.ok) ? '#e65100' : '#2e7d32' }}>{plan.modelos.filter(m => !m.ok).length}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>no cuentan en la carga</div>
              </div>
            </div>

            {plan.alertas.length > 0 && (
              <div style={{ background: '#ffebee', border: '1.5px solid #ef9a9a', borderRadius: 10, padding: '10px 12px', marginBottom: 10, maxHeight: esMes ? 260 : 'none', overflowY: 'auto' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#c62828', marginBottom: 4 }}>🚨 Alertas de sobrecarga ({plan.alertas.length})</div>
                {plan.alertas.map((a, i) => (
                  <div key={i} style={{ fontSize: 12.5, lineHeight: 1.5, color: '#b71c1c' }}>
                    <b>{a.puesto}</b> · {diaNombre(a.fecha)} {fechaCorta(a.fecha)}: {pctTexto(a.pct)} — <b>{faltaTexto(a.faltaSeg, a.faltaEq, fmtDuracionSeg)}</b> (necesita {fmtDuracionSeg(a.seg)}, hay {fmtDuracionSeg(a.dispSeg)})
                    {a.top.length > 0 && <span style={{ color: '#7f0000' }}> (más carga: {a.top.map(t => `${t.plataforma} ${t.cap} ${t.code}`).join(' · ')})</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="detail-section" style={{ marginBottom: 10 }}>
              <div className="section-header">Puestos por día</div>
              <div style={{ overflowX: 'auto', padding: '8px 8px 12px' }}>
                {!plan.puestos.length ? (
                  <div style={{ padding: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    Ningún modelo {periodoTxt} en esta línea tiene puestos armados. Armalos en <b>Puestos</b>.
                  </div>
                ) : (
                  <table style={{ borderCollapse: 'separate', borderSpacing: 3, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>Puesto</th>
                        {plan.dias.map(d => (
                          <th key={d.fecha} style={th}>
                            {diaNombre(d.fecha)} {fechaCorta(d.fecha)}
                            <div style={{ textTransform: 'none', fontWeight: 500, letterSpacing: 0 }}>
                              {d.equipos > 0 ? `${ent(d.equipos)} eq · ${d.turnos}T${d.turnosEstimados ? '*' : ''}` : 'sin prod.'}
                              {d.turnosEditado && <span style={{ color: 'var(--primary)' }}> ✎</span>}
                            </div>
                            {d.equipos > 0 && <div style={{ textTransform: 'none', fontWeight: 500, letterSpacing: 0 }}>disp. {fmtDuracionSeg(d.dispSeg)}</div>}
                            {d.faltaEq > 0 && <div style={{ textTransform: 'none', fontWeight: 800, letterSpacing: 0, color: '#c62828' }}>no salen {ent(d.faltaEq)} eq</div>}
                          </th>
                        ))}
                        <th style={th}>{totalTxt}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.puestos.map(p => (
                        <tr key={p.key} onClick={() => irAPuesto(p.key)} style={{ cursor: 'pointer' }}>
                          <td style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', padding: '4px 6px', color: 'var(--primary)', position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>{p.label}</td>
                          {[...p.celdas, { pct: p.pctTotal, seg: p.totalSeg, faltaSeg: p.faltaSeg, faltaEq: 0 }].map((c, i) => {
                            const t = tono(c.pct)
                            return (
                              <td key={i} style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 8, textAlign: 'center', padding: '5px 6px', minWidth: 74 }}>
                                {c.pct == null ? <span style={{ color: '#bbb' }}>—</span> : (
                                  <>
                                    <div style={{ fontSize: 14, fontWeight: 800, color: t.fg, fontVariantNumeric: 'tabular-nums' }}>{pctTexto(c.pct)}</div>
                                    <div style={{ fontSize: 10.5, color: t.fg, fontVariantNumeric: 'tabular-nums' }}>{fmtDuracionSeg(c.seg)}</div>
                                    {c.faltaSeg > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: '#b71c1c', fontVariantNumeric: 'tabular-nums' }}>{faltaTexto(c.faltaSeg, c.faltaEq, fmtDuracionSeg)}</div>}
                                  </>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {plan.dias.some(d => d.turnosEstimados) && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 6px' }}>* El Excel no trae turnos ese día: se usó 1 turno.</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 6px' }}>
                  Verde hasta 90% · naranja hasta 100% · rojo si pasa el turno. En rojo se indica cuánto tiempo falta y cuántos equipos no saldrían ese día (a la mezcla del día). Tocá un puesto para ir a sus tareas.
                  {esMes && ' En el mes se muestran solo los días con producción de la línea.'}
                </div>
              </div>
            </div>

            {plan.puestos.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', margin: '4px 2px 8px' }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>Tareas de cada puesto</span>
                <button onClick={() => setVerTareas(!verTareas)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {verTareas ? 'Ocultar ▲' : `Ver las de los ${plan.puestos.length} puestos ▼`}
                </button>
              </div>
            )}
            {verTareas && plan.puestos.map(p => {
              const t = tono(p.pctTotal)
              const a = alcance[p.key] ?? 'todo'
              const idxs = a === 'todo' ? plan.dias.map((_, i) => i) : [Number(a)]
              const cas = cascadaDePuesto(p, idxs, plan.dias)
              const cel = a === 'todo' ? { pct: p.pctTotal, seg: p.totalSeg, faltaSeg: p.faltaSeg, faltaEq: 0 } : p.celdas[Number(a)]
              const tc = tono(cel.pct)
              const filas = verDetalle[p.key] ? tareasDePuesto(p, grupos) : []
              return (
                <div key={p.key} id={`plan-puesto-${p.key}`} className="detail-section" style={{ marginBottom: 10, scrollMarginTop: 70 }}>
                  <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ flex: 1 }}>{p.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: t.fg, background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 10, padding: '2px 8px' }}>
                      {totalTxt.toLowerCase()} {pctTexto(p.pctTotal)} · {fmtDuracionSeg(p.totalSeg)}{p.faltaSeg > 0 ? ` · falta ${fmtDuracionSeg(p.faltaSeg)}` : ''}
                    </span>
                  </div>
                  <div style={{ padding: '8px 12px 12px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                      <select value={a} onChange={e => setAlcance(x => ({ ...x, [p.key]: e.target.value }))} style={{ ...sel, fontSize: 12.5, padding: '4px 8px' }}>
                        <option value="todo">{esMes ? 'Todo el mes' : 'Toda la semana'}</option>
                        {plan.dias.map((d, i) => p.celdas[i].seg > 0 && (
                          <option key={d.fecha} value={i}>{diaNombre(d.fecha)} {fechaCorta(d.fecha)} · {pctTexto(p.celdas[i].pct)}</option>
                        ))}
                      </select>
                      {cel.pct != null && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: tc.fg }}>
                          {pctTexto(cel.pct)} del tiempo disponible{cel.faltaSeg > 0 ? ` · ${faltaTexto(cel.faltaSeg, cel.faltaEq, fmtDuracionSeg)}` : ''}
                        </span>
                      )}
                    </div>
                    {cas.filas.length ? <Cascada cas={cas} /> : <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Sin tareas ese día.</div>}

                    <button onClick={() => setVerDetalle(x => ({ ...x, [p.key]: !x[p.key] }))} style={{ marginTop: 8, border: 'none', background: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                      {verDetalle[p.key] ? 'Ocultar cantidades ▲' : `Ver cantidades por ${esMes ? 'semana' : 'día'} ▼`}
                    </button>
                    {verDetalle[p.key] && (
                      <div style={{ overflowX: 'auto', marginTop: 6 }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                          <thead>
                            <tr>
                              <th style={{ ...th, textAlign: 'left' }}>Modelo · tarea</th>
                              {grupos.map(gr => {
                                const c = celdaGrupo(p, gr)
                                return (
                                  <th key={gr.key} style={th}>
                                    {tituloGrupo(gr)}
                                    {c.pct != null && <div style={{ color: tono(c.pct).fg, fontWeight: 800, letterSpacing: 0 }}>{pctTexto(c.pct)}</div>}
                                  </th>
                                )
                              })}
                              <th style={th}>Tiempo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filas.map(r => (
                              <tr key={`${r.plataforma}${r.cap}${r.code}`} style={{ borderTop: '1px solid #eee' }}>
                                <td style={{ fontSize: 12, padding: '5px 6px' }}>
                                  <b>{r.plataforma} {r.cap}</b><br />
                                  <span style={{ color: 'var(--text-secondary)' }}>{r.code} · {r.desc}</span>
                                </td>
                                {r.porDia.map((x, i) => (
                                  <td key={i} style={{ textAlign: 'center', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', padding: '5px 6px' }}>
                                    {x ? <><b>{fmtNum(x.units)}</b><div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{fmtDuracionSeg(x.seg)}</div></> : <span style={{ color: '#ccc' }}>—</span>}
                                  </td>
                                ))}
                                <td style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, padding: '5px 6px', whiteSpace: 'nowrap' }}>{fmtDuracionSeg(r.segTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            {verTareas && plan.puestos.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '-4px 4px 10px' }}>
                En la cascada cada tarea arranca donde termina la anterior; la línea punteada es el fin del tiempo disponible y lo rojo es lo que no entra.
                Cantidad = unidades de la tarea (equipos × cantidad por equipo). Si una tarea de Preformado está dividida entre dos puestos, el número es el mismo en los dos y el tiempo se reparte según su %.
              </div>
            )}

            <div className="detail-section" style={{ marginBottom: 10 }}>
              <div className="section-header">Modelos {periodoTxt}</div>
              <div style={{ padding: '6px 12px 12px' }}>
                {plan.modelos.map(m => (
                  <div key={`${m.plataforma}${m.cap}`} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '5px 0', borderTop: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{m.plataforma} {m.cap}</span>
                    <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{ent(m.qty)} equipos</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: m.ok ? (m.estado ? '#e65100' : '#2e7d32') : '#c62828' }}>
                      {m.ok ? (m.estado || '✓ en el plan') : m.estado}
                    </span>
                  </div>
                ))}
                {!plan.modelos.length && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Sin producción en esta línea {periodoTxt}.</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
