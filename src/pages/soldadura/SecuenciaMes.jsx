import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import { claveModelo } from './secuenciaExcel'
import { importarSecuencia } from './secuenciaImport'
import { buildTareas, parseTakt, fmtDuracionSeg, fmtNum } from './puestosCalc'

// "Secuencia del mes": toma el Excel de Secuencia de producción (cuántos
// equipos de cada modelo y capacidad entran en el mes) y calcula la dotación
// con la mezcla real, además de mostrar el takt/personas de cada modelo por
// separado. Es solo información: no cambia los puestos ni lo ya guardado.

const norm = s => String(s || '').toUpperCase().replace(/\s+/g, '')
const ent = n => (isFinite(n) ? Math.round(n).toLocaleString('es-AR') : '—')
const PLAN_A_SOL = { 'IDU': 'IDU', 'ODU I': 'ODU', 'ODU II': 'ODU2' }
const PLAN_LINEAS = ['IDU', 'ODU I', 'ODU II']

function lineaPlanDe(lineaSol) {
  const l = norm(lineaSol)
  if (l === 'ODU') return 'ODU I'
  if (l === 'ODU2') return 'ODU II'
  return 'IDU'
}

function nombreMes(id) {
  const [y, m] = String(id).split('-').map(Number)
  if (!y || !m) return id
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export default function SecuenciaMes({
  lineaFilter, selectedModeloName, selectedCap, modelos, tiemposAll, savedTakt,
  params, unDiaArmado, readOnly, onUsarMeta,
}) {
  const [docs, setDocs] = useState([])
  const [puestosAll, setPuestosAll] = useState({})
  const [mes, setMes] = useState('')
  const [planLinea, setPlanLinea] = useState(lineaPlanDe(lineaFilter))
  const [abierto, setAbierto] = useState(true)
  const [importando, setImportando] = useState(false)

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'soldadura_secuencia'), snap => {
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)))
    }, () => {})
    const u2 = onSnapshot(collection(db, 'soldadura_puestos'), snap => {
      const m = {}
      snap.docs.forEach(d => { m[d.id] = d.data() })
      setPuestosAll(m)
    }, () => {})
    return () => { u1(); u2() }
  }, [])

  // El mes de interés es el último cargado (ej: octubre)
  useEffect(() => {
    if (docs.length && !docs.some(d => d.id === mes)) setMes(docs[docs.length - 1].id)
  }, [docs, mes])

  useEffect(() => { setPlanLinea(lineaPlanDe(lineaFilter)) }, [lineaFilter])

  async function importar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportando(true)
    try {
      const ids = await importarSecuencia(file)
      alert(`✅ Secuencia importada: ${ids.length} meses (${nombreMes(ids[0])} a ${nombreMes(ids[ids.length - 1])})`)
    } catch (err) {
      alert('Error al importar la secuencia: ' + err.message)
    }
    setImportando(false)
    if (e.target) e.target.value = ''
  }

  const mesDoc = docs.find(d => d.id === mes) || null
  const horas = Number(params.horasTurno) || 0
  const turnos = Number(params.turnosDia) || 0
  const efic = (Number(params.eficPct) || 0) / 100

  const calc = useMemo(() => {
    if (!mesDoc) return null
    const solLinea = PLAN_A_SOL[planLinea]
    const filas = (mesDoc.items || []).filter(i => i.linea === planLinea).map(it => {
      const md = modelos.find(m => claveModelo(m.modelo || m.id) === claveModelo(it.plataforma) && norm(m.cap) === norm(it.cap))
      const subs = md ? (md.subconjuntos || []).filter(s => (!s.tipo || s.tipo === 'Completo') && norm(s.linea) === norm(solLinea)) : []
      const lineaExacta = subs[0]?.linea || solLinea
      const tareas = md && subs.length ? buildTareas(subs, tiemposAll[md.id] || {}) : []
      const cants = puestosAll[`${md?.id}||${lineaExacta}`]?.cantidades || {}
      const trabajoSeg = tareas.reduce((a, t) => a + (t.tStd * (Number(cants[t.code]) || 1)) / 100, 0)
      const taktSeg = md ? parseTakt(savedTakt[`${md.id}||${lineaExacta}`] || savedTakt[md.id] || '') / 100 : 0
      return {
        ...it, enApp: !!md, sinDatos: trabajoSeg <= 0, trabajoSeg, taktSeg,
        personas: taktSeg > 0 && trabajoSeg > 0 ? Math.max(1, Math.ceil(trabajoSeg / taktSeg - 1e-9)) : null,
      }
    })
    const totalQty = filas.reduce((a, f) => a + f.qty, 0)
    const qtyDatos = filas.filter(f => !f.sinDatos).reduce((a, f) => a + f.qty, 0)
    const trabajoTotal = filas.filter(f => !f.sinDatos).reduce((a, f) => a + f.qty * f.trabajoSeg, 0)
    const dias = mesDoc.dias?.[planLinea] || 0
    const eqDia = dias > 0 ? totalQty / dias : 0
    const tiempoUtilDia = horas * turnos * 3600 * efic
    const taktMensual = eqDia > 0 && tiempoUtilDia > 0 ? tiempoUtilDia / eqDia : 0
    const trabajoMedio = qtyDatos > 0 ? trabajoTotal / qtyDatos : 0
    const minPersonas = taktMensual > 0 && trabajoMedio > 0 ? Math.max(1, Math.ceil(trabajoMedio / taktMensual - 1e-9)) : null
    return { filas, totalQty, qtyDatos, dias, eqDia, taktMensual, trabajoMedio, minPersonas }
  }, [mesDoc, planLinea, modelos, tiemposAll, savedTakt, puestosAll, horas, turnos, efic])

  const chip = (activo) => ({
    padding: '5px 12px', borderRadius: 16, border: '1.5px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer',
    borderColor: activo ? '#333' : '#d0d0d0', background: activo ? '#333' : '#fff', color: activo ? '#fff' : 'var(--text-primary)',
  })
  const th = { textAlign: 'left', padding: '6px 8px', fontSize: 10.5, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }
  const td = { padding: '6px 8px', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

  const resumen = calc && mesDoc
    ? `${nombreMes(mes)} · ${planLinea} · ${ent(calc.totalQty)} equipos${calc.minPersonas ? ` · ≈ ${calc.minPersonas} personas` : ''}`
    : 'importá el Excel de Secuencia'

  return (
    <div className="detail-section" style={{ marginBottom: 12 }}>
      <button onClick={() => setAbierto(!abierto)} className="section-header" style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontSize: 18 }}>📅</span>
        <span style={{ flex: 1 }}>
          Secuencia del mes (mezcla de modelos)
          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 2 }}>{resumen}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>{abierto ? 'Cerrar ▲' : 'Ver ▼'}</span>
      </button>

      {abierto && (
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {docs.length > 0 && (
              <select value={mes} onChange={e => setMes(e.target.value)} style={{
                padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 13, background: '#fff',
              }}>
                {docs.map(d => <option key={d.id} value={d.id}>{nombreMes(d.id)}</option>)}
              </select>
            )}
            {docs.length > 0 && PLAN_LINEAS.map(l => (
              <button key={l} onClick={() => setPlanLinea(l)} style={chip(planLinea === l)}>{l}</button>
            ))}
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
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Todavía no hay secuencia cargada. Importá el Excel de <b>Secuencia de producción</b> y esta sección calcula la
              dotación con los modelos y cantidades que entran cada mes.
            </div>
          )}

          {calc && mesDoc && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Archivo: {mesDoc.archivo || '—'}{mesDoc.importadoEn ? ` · importado ${new Date(mesDoc.importadoEn).toLocaleDateString('es-AR')}` : ''}.
                Línea del plan <b>{planLinea}</b> = línea de soldadura <b>{PLAN_A_SOL[planLinea]}</b>. Usa las horas, turnos y eficiencia del paso 1.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginBottom: 10 }}>
                {[
                  { l: 'Equipos del mes', v: ent(calc.totalQty), s: `${calc.dias} días con producción` },
                  { l: 'Equipos por día', v: fmtNum(calc.eqDia), s: `≈ ${ent(calc.eqDia * 5)} por semana` },
                  { l: 'Takt del mes', v: calc.taktMensual ? fmtDuracionSeg(calc.taktMensual) : '—', s: 'tiempo útil ÷ equipos/día' },
                  { l: 'Personas con la mezcla', v: calc.minPersonas ?? '—', s: calc.trabajoMedio ? `${fmtDuracionSeg(calc.trabajoMedio)} de trabajo promedio` : 'sin tiempos medidos', c: '#2e7d32' },
                ].map(k => (
                  <div key={k.l} style={{ background: '#fff', borderRadius: 10, padding: '8px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{k.l}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.c || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{k.v}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>{k.s}</div>
                  </div>
                ))}
              </div>

              {calc.totalQty > 0 && calc.qtyDatos < calc.totalQty && (
                <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#e65100', marginBottom: 8 }}>
                  ⚠️ Solo el {Math.round((calc.qtyDatos / calc.totalQty) * 100)}% de los equipos del mes tiene tiempos medidos en esta línea
                  ({ent(calc.qtyDatos)} de {ent(calc.totalQty)}). Las personas con la mezcla se estiman con el promedio de los modelos medidos.
                </div>
              )}

              {unDiaArmado > 0 && calc.eqDia > 0 && (
                <div style={{
                  borderRadius: 8, padding: '6px 10px', fontSize: 12, marginBottom: 8,
                  background: unDiaArmado >= calc.eqDia ? '#e8f5e9' : '#ffebee', color: unDiaArmado >= calc.eqDia ? '#2e7d32' : '#c62828',
                }}>
                  Con el armado actual de <b>{selectedModeloName} {selectedCap}</b> se harían <b>{ent(unDiaArmado)}</b> equipos por día
                  ({ent(unDiaArmado * 5)} por semana, {ent(unDiaArmado * calc.dias)} en el mes) — el plan pide {fmtNum(calc.eqDia)} por día en total.
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr style={{ borderBottom: '1.5px solid #e0e0e0' }}>
                      <th style={th}>Modelo · Cap</th><th style={th}>Equipos</th><th style={th}>% mezcla</th>
                      <th style={th}>Trabajo/equipo</th><th style={th}>Takt del modelo</th><th style={th}>Personas (solo él)</th>
                      {!readOnly && <th style={th} />}
                    </tr>
                  </thead>
                  <tbody>
                    {calc.filas.map(f => {
                      const esActual = claveModelo(f.plataforma) === claveModelo(selectedModeloName) && norm(f.cap) === norm(selectedCap)
                      return (
                        <tr key={f.plataforma + f.cap} style={{ borderBottom: '1px solid #f0f0f0', background: esActual ? '#e3f2fd' : 'transparent' }}>
                          <td style={{ ...td, whiteSpace: 'normal', minWidth: 150 }}>
                            <b>{f.plataforma} {f.cap}</b>
                            <div style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>
                              {Object.entries(f.marcas || {}).map(([m, q]) => `${m[0]}${m.slice(1).toLowerCase()} ${ent(q)}`).join(' · ')}
                              {!f.enApp && ' · no está en soldadura'}
                            </div>
                          </td>
                          <td style={td}>{ent(f.qty)}</td>
                          <td style={td}>{calc.totalQty ? Math.round((f.qty / calc.totalQty) * 100) : 0}%</td>
                          <td style={td}>{f.sinDatos ? <span style={{ color: '#e65100' }}>sin medir</span> : fmtDuracionSeg(f.trabajoSeg)}</td>
                          <td style={td}>{f.taktSeg ? fmtDuracionSeg(f.taktSeg) : '—'}</td>
                          <td style={td}>{f.personas ?? '—'}</td>
                          {!readOnly && (
                            <td style={td}>
                              {esActual && (
                                <button onClick={() => onUsarMeta(f.qty, calc.dias)} style={{
                                  padding: '3px 8px', borderRadius: 6, border: '1.5px solid var(--primary)', background: '#fff',
                                  color: 'var(--primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                }}>Usar como meta</button>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                    {!calc.filas.length && (
                      <tr><td colSpan={7} style={{ ...td, color: 'var(--text-secondary)' }}>Sin equipos de {planLinea} en {nombreMes(mes)}.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 6 }}>
                "Personas con la mezcla" es el mínimo teórico: trabajo promedio ponderado por la mezcla ÷ takt del mes. "Personas (solo él)" usa el Takt Time cargado de ese modelo.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
