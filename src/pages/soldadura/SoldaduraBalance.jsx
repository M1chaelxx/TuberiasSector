import { useState, useEffect } from 'react'
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'

const PUESTOS_SOL = [
  'SOL-01', 'SOL-02', 'SOL-03', 'SOL-04', 'SOL-05', 'SOL-06',
  'SOL-07', 'SOL-08', 'SOL-09', 'SOL-10', 'SOL-11', 'SOL-12',
  'SOL-13', 'SOL-14', 'SOL-15', 'SOL-16', 'SOL-17', 'SOL-18',
  'Preformado',
]

function fmt(cs) {
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(c).padStart(2, '0')}`
}

function parseTakt(str) {
  if (!str) return 0
  const parts = str.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 6000 + parts[1] * 100 + parts[2]
  if (parts.length === 2) return parts[0] * 6000 + parts[1] * 100
  return 0
}

// n = cantidad de mediciones · dispersionPct = (máx-mín)/promedio, ambos sobre
// el tiempo normal por unidad. Solo informativo — no cambia loads/contribution.
function statsNorm(meds) {
  if (!meds?.length) return { avg: 0, n: 0, dispersionPct: 0 }
  const vals = meds.map(m => (m.tiempoNorm || 0) / (m.subconjuntosQty || 1))
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  const n = vals.length
  const dispersionPct = avg > 0 ? Math.round((Math.max(...vals) - Math.min(...vals)) / avg * 100) : 0
  return { avg, n, dispersionPct }
}

// Semáforo de confiabilidad de la muestra — no toca el cálculo, solo lo explica.
function MuestraBadge({ n, dispersionPct }) {
  if (n === 0) return null
  const cfg =
    n === 1 ? { bg: '#ffebee', color: '#c62828', label: 'n=1 · muestra insuficiente' }
    : dispersionPct > 15 ? { bg: '#fff3e0', color: '#e65100', label: `n=${n} · ±${dispersionPct}% dispersión` }
    : { bg: '#e8f5e9', color: '#2e7d32', label: `n=${n} · ±${dispersionPct}% estable` }
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 4, padding: '2px 6px', fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function hasMedicion(code, tiempos) {
  const t = tiempos[code]
  if (!t) return false
  return PUESTOS_SOL.some(p => t[p]?.mediciones?.length > 0)
}

function getPuestosConMed(code, tiempos) {
  return PUESTOS_SOL.filter(p => tiempos[code]?.[p]?.mediciones?.length > 0)
}

function computeBalance(subconjuntos, tiempos, taktCs) {
  const subcData = []
  for (const s of subconjuntos) {
    const code = s.codCompleto || s.codigo || ''
    if (code) {
      const puestoLoads = PUESTOS_SOL
        .map(p => ({ p, ...statsNorm(tiempos[code]?.[p]?.mediciones) }))
        .filter(x => x.avg > 0)
      if (puestoLoads.length) {
        const primary = [...puestoLoads].sort((a, b) => b.avg - a.avg)[0]
        subcData.push({
          code, desc: s.descGral || s.titulo || code, primary: primary.p, contribution: primary.avg,
          n: primary.n, dispersionPct: primary.dispersionPct,
        })
      }
    }

    // Un Parcial puede medirse por separado, en un puesto distinto al del
    // Completo (ej: "Auxiliar Capilar" armado en otro puesto que "Tubo
    // Capilar"). Antes computeBalance solo miraba el código del Completo, así
    // que esas mediciones quedaban afuera del cálculo — se suman acá como una
    // tarea más, solo si tienen mediciones propias bajo su propio código.
    for (const par of (s.parciales || [])) {
      const pcode = par.codParcial || ''
      if (!pcode || pcode === code) continue
      const puestoLoadsPar = PUESTOS_SOL
        .map(p => ({ p, ...statsNorm(tiempos[pcode]?.[p]?.mediciones) }))
        .filter(x => x.avg > 0)
      if (!puestoLoadsPar.length) continue
      const primaryPar = [...puestoLoadsPar].sort((a, b) => b.avg - a.avg)[0]
      subcData.push({
        code: pcode, desc: par.descSubc || pcode, primary: primaryPar.p, contribution: primaryPar.avg,
        n: primaryPar.n, dispersionPct: primaryPar.dispersionPct,
      })
    }
  }

  const loads = {}
  PUESTOS_SOL.forEach(p => { loads[p] = 0 })
  subcData.forEach(s => { loads[s.primary] = (loads[s.primary] || 0) + s.contribution })
  const activePuestos = PUESTOS_SOL.filter(p => loads[p] > 0)

  const suggestions = []
  const simLoads = { ...loads }
  if (taktCs > 0) {
    const overloaded = activePuestos.filter(p => simLoads[p] > taktCs)
    for (const fromP of overloaded) {
      const tasks = subcData.filter(s => s.primary === fromP).sort((a, b) => b.contribution - a.contribution)
      for (const task of tasks) {
        if (simLoads[fromP] <= taktCs) break
        const toP = activePuestos
          .filter(p => p !== fromP && simLoads[p] + task.contribution <= taktCs)
          .sort((a, b) => simLoads[b] - simLoads[a])[0]
        if (toP) {
          simLoads[fromP] -= task.contribution
          simLoads[toP] += task.contribution
          suggestions.push({ task, from: fromP, to: toP, freed: task.contribution, toFree: taktCs - simLoads[toP] })
        }
      }
    }
  }

  return { activePuestos, loads, simLoads, subcData, suggestions }
}

// ── Tab pill ──────────────────────────────────────────────────────────────────
function TabPill({ id, label, active, onClick }) {
  return (
    <button onClick={() => onClick(id)} style={{
      flexShrink: 0, padding: '8px 20px', borderRadius: 20, border: '1.5px solid',
      borderColor: active ? 'var(--primary)' : '#d0d0d0',
      background: active ? 'var(--primary)' : '#fff',
      color: active ? '#fff' : 'var(--text-primary)',
      fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{label}</button>
  )
}

// ── Balance tab ───────────────────────────────────────────────────────────────
function BalanceTab({ subconjuntos, tiempos, taktCs, savedTakt, selectedDocId, lineaFilter }) {
  const { activePuestos, loads, simLoads, subcData, suggestions } = computeBalance(subconjuntos, tiempos, taktCs)
  const maxLoad = Math.max(...activePuestos.map(p => simLoads[p]), taktCs || 1, 1)

  // Solo para mostrar los recuadros de "Estado Final": a qué puesto queda cada
  // subconjunto DESPUÉS de aplicar las sugerencias. No toca loads/simLoads/
  // suggestions — es un mapa derivado, puramente para el render de abajo.
  const finalPrimaryByCode = {}
  subcData.forEach(s => { finalPrimaryByCode[s.code] = s.primary })
  suggestions.forEach(s => { finalPrimaryByCode[s.task.code] = s.to })

  if (activePuestos.length === 0) {
    return (
      <div className="empty" style={{ paddingTop: 40 }}>
        <div className="ei">⚖️</div>
        <p>Sin tiempos registrados para calcular el balance</p>
      </div>
    )
  }

  const taktLabel = lineaFilter !== 'todas'
    ? savedTakt[`${selectedDocId}||${lineaFilter}`]
    : null

  return (
    <>
      {/* Takt */}
      {taktLabel && (
        <div className="detail-section" style={{ marginBottom: 0 }}>
          <div className="section-header">⏱ Takt Time</div>
          <div className="field-row">
            <span className="label">Takt — {lineaFilter}</span>
            <span className="value" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--warning)', fontFamily: 'monospace' }}>
              {taktLabel}
            </span>
          </div>
        </div>
      )}

      {/* Redistribution suggestions */}
      {taktCs > 0 && suggestions.length > 0 && (
        <div style={{ margin: '10px 12px', background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2e7d32', marginBottom: 4 }}>
            ✅ La línea puede quedar balanceada redistribuyendo las tareas sugeridas
          </div>
          <div style={{ fontSize: 12, color: '#388e3c' }}>
            Takt: {fmt(taktCs)} · {suggestions.length} movimiento{suggestions.length !== 1 ? 's' : ''} sugerido{suggestions.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
      {taktCs > 0 && suggestions.length === 0 && activePuestos.some(p => loads[p] > taktCs) && (
        <div style={{ margin: '10px 12px', background: '#ffebee', border: '1px solid #ffcdd2', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#c62828' }}>
            ⚠️ Puestos sobrecargados — no hay redistribución posible sin superar el takt
          </div>
        </div>
      )}

      {/* Suggestions list */}
      {suggestions.length > 0 && (
        <div className="detail-section" style={{ marginBottom: 0 }}>
          <div className="section-header">🔄 REDISTRIBUCIONES SUGERIDAS</div>
          {suggestions.map((s, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{s.task.code}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.task.desc}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#e53935', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace', marginLeft: 8, flexShrink: 0 }}>{fmt(s.task.contribution)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 }}>
                <span style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 4, padding: '3px 10px', fontWeight: 700, fontSize: 12 }}>{s.from}</span>
                <span style={{ fontSize: 16, color: '#999' }}>→</span>
                <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 4, padding: '3px 10px', fontWeight: 700, fontSize: 12 }}>{s.to}</span>
              </div>
              <div style={{ fontSize: 11, color: '#666', lineHeight: 1.5 }}>
                <div>✓ Libera <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{fmt(s.freed)}</span> en {s.from}</div>
                <div>✓ {s.to} queda con <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{fmt(s.toFree)}</span> libre</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Original state (if there are suggestions to compare) */}
      {suggestions.length > 0 && (
        <div className="detail-section" style={{ marginBottom: 0 }}>
          <div className="section-header" style={{ fontSize: 12, letterSpacing: 0.5 }}>
            📊 ESTADO ORIGINAL POR PUESTO
          </div>
          {activePuestos.map(p => {
            const load = loads[p]
            const isOver = taktCs > 0 && load > taktCs
            const pct = Math.min(Math.round(load / maxLoad * 100), 100)
            const barColor = taktCs > 0 ? (isOver ? '#e53935' : '#43a047') : '#1565c0'
            return (
              <div key={p} style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{p}</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: barColor, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
                      {fmt(load)}
                    </span>
                    {taktCs > 0 && (
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>
                        {isOver ? `+${fmt(load - taktCs)} sobre takt` : `libre: ${fmt(taktCs - load)}`}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ background: '#e0e0e0', borderRadius: 4, height: 8, overflow: 'hidden', position: 'relative', marginBottom: 8 }}>
                  <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${Math.max(pct, 3)}%`, transition: 'width 0.3s' }} />
                  {taktCs > 0 && (
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: `${Math.min(Math.round(taktCs / maxLoad * 100), 100)}%`,
                      width: 2, background: '#333', opacity: 0.4,
                    }} />
                  )}
                </div>
                {subcData.filter(t => t.primary === p).length > 0 && (
                  <div style={{ fontSize: 11, color: '#666', paddingLeft: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: 3 }}>Subconjuntos:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {subcData.filter(t => t.primary === p).map(t => (
                        <div key={t.code} style={{ background: '#f5f5f5', padding: '4px 8px', borderRadius: 4, fontSize: 10, borderLeft: '2px solid #999' }}>
                          <div style={{ fontWeight: 600 }}>{t.code}</div>
                          <div style={{ fontSize: 9, color: '#888', marginTop: 1, marginBottom: 3 }}>{t.desc}</div>
                          <MuestraBadge n={t.n} dispersionPct={t.dispersionPct} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Final state */}
      <div className="detail-section" style={{ marginBottom: 0 }}>
        <div className="section-header" style={{ fontSize: 12, letterSpacing: 0.5 }}>
          {suggestions.length > 0 ? '📊 ESTADO FINAL POR PUESTO (TRAS REDISTRIBUCIÓN)' : '📊 CARGA POR PUESTO'}
        </div>
        {activePuestos.map(p => {
          const load = simLoads[p]
          const isOver = taktCs > 0 && load > taktCs
          const isModified = suggestions.some(s => s.from === p || s.to === p)
          const pct = Math.min(Math.round(load / maxLoad * 100), 100)
          const barColor = taktCs > 0 ? (isOver ? '#e53935' : '#43a047') : '#1565c0'
          const tasksAqui = subcData.filter(t => finalPrimaryByCode[t.code] === p)
          return (
            <div key={p} style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{p}</span>
                  {isModified && (
                    <span style={{ fontSize: 10, background: '#fff9c4', color: '#f57f17', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>modificado</span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: barColor, fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
                    {fmt(load)}
                  </span>
                  {taktCs > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>
                      {isOver ? `+${fmt(load - taktCs)} sobre takt` : `libre: ${fmt(taktCs - load)}`}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ background: '#e0e0e0', borderRadius: 4, height: 8, overflow: 'hidden', position: 'relative', marginBottom: 8 }}>
                <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${Math.max(pct, 3)}%`, transition: 'width 0.3s' }} />
                {taktCs > 0 && (
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${Math.min(Math.round(taktCs / maxLoad * 100), 100)}%`,
                    width: 2, background: '#333', opacity: 0.4,
                  }} />
                )}
              </div>
              {tasksAqui.length > 0 && (
                <div style={{ fontSize: 11, color: '#666', paddingLeft: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>Subconjuntos:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {tasksAqui.map(t => {
                      const movido = t.primary !== p
                      return (
                        <div key={t.code} style={{
                          background: movido ? '#fff9c4' : '#f5f5f5', padding: '4px 8px', borderRadius: 4, fontSize: 10,
                          borderLeft: `2px solid ${movido ? '#f57f17' : '#999'}`,
                        }}>
                          <div style={{ fontWeight: 600 }}>
                            {t.code}{movido && <span style={{ color: '#f57f17', fontWeight: 700 }}> ↵ {t.primary}</span>}
                          </div>
                          <div style={{ fontSize: 9, color: '#888', marginTop: 1, marginBottom: 3 }}>{t.desc}</div>
                          <MuestraBadge n={t.n} dispersionPct={t.dispersionPct} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {taktCs > 0 && (
          <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            La línea vertical en la barra indica el takt time
          </div>
        )}
      </div>
    </>
  )
}

// ── Cobertura tab ─────────────────────────────────────────────────────────────
function CoberturaTab({ selectedDoc, tiempos, navigate, decodedId }) {
  const [pendingOnly, setPendingOnly] = useState(false)

  if (!selectedDoc) {
    return <div className="empty"><div className="ei">📋</div><p>Seleccioná un modelo</p></div>
  }

  const items = []
  for (const s of (selectedDoc.subconjuntos || [])) {
    const code = s.codCompleto || s.codigo || ''
    if (!code) continue
    const measured = hasMedicion(code, tiempos)
    const puestos = getPuestosConMed(code, tiempos)
    items.push({
      code, label: s.descGral || s.titulo || code,
      type: 'Completo', measured, puestos,
      navCode: code,
    })
    for (const p of (s.parciales || [])) {
      if (!p.codParcial) continue
      const pm = hasMedicion(p.codParcial, tiempos)
      const pp = getPuestosConMed(p.codParcial, tiempos)
      items.push({
        code: p.codParcial, label: p.descSubc || p.codParcial,
        type: 'Parcial', measured: pm, puestos: pp,
        navCode: p.codParcial,
      })
    }
  }

  const total = items.length
  const medidos = items.filter(i => i.measured).length
  const pendientes = total - medidos
  const pct = total > 0 ? Math.round(medidos / total * 100) : 0
  const barColor = pct < 50 ? '#e53935' : pct < 80 ? '#f57c00' : '#43a047'

  const displayed = pendingOnly ? items.filter(i => !i.measured) : items

  return (
    <>
      <div style={{ padding: '4px 16px 10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{medidos} de {total} subconjuntos medidos</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: barColor }}>{pct}%</span>
        </div>
        <div style={{ background: '#e0e0e0', borderRadius: 4, height: 7, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${pct}%`, transition: 'width 0.4s' }} />
        </div>
      </div>

      <div className="content" style={{ paddingTop: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0 12px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)} />
          Ver solo pendientes ({pendientes})
        </label>

        {displayed.length === 0 && pendingOnly && (
          <div className="empty"><div className="ei">✅</div><p>Todos los subconjuntos están medidos</p></div>
        )}
        {displayed.length === 0 && !pendingOnly && (
          <div className="empty"><div className="ei">🔧</div><p>Sin subconjuntos cargados</p></div>
        )}

        {displayed.map(item => (
          <div key={item.code} className="card"
            onClick={() => navigate(`/soldadura/${encodeURIComponent(decodedId)}/${item.navCode}`)}>
            <div style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: item.measured ? '#e8f5e9' : '#ffebee',
              color: item.measured ? '#2e7d32' : '#c62828',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 700,
            }}>
              {item.measured ? '✓' : '✕'}
            </div>
            <div className="info" style={{ gap: 2 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{item.label}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                {item.code} · <span style={{ color: item.type === 'Parcial' ? '#7b1fa2' : '#1565c0' }}>{item.type}</span>
              </p>
              {item.measured && (
                <p style={{ fontSize: 11, color: 'var(--primary)', margin: 0, fontWeight: 600 }}>
                  Medido en: {item.puestos.join(', ')}
                </p>
              )}
            </div>
            <div className="arrow">›</div>
          </div>
        ))}
      </div>
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SoldaduraBalance() {
  const navigate = useNavigate()
  const { isIngenieria } = useAuth()
  const [modelos, setModelos] = useState([])
  const [tiemposAll, setTiemposAll] = useState({})
  const [savedTakt, setSavedTakt] = useState({})
  const [selectedModeloName, setSelectedModeloName] = useState('')
  const [selectedDocId, setSelectedDocId] = useState('')
  const [lineaFilter, setLineaFilter] = useState('todas')
  const [activeTab, setActiveTab] = useState('balance')

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
      if (snap.exists()) setSavedTakt(snap.data())
    }, () => {})
    return () => { u1(); u2(); u3() }
  }, [])

  // Derived
  const modeloNames = [...new Set(modelos.map(m => m.modelo || m.id))].sort()
  const capsForModelo = modelos.filter(m => (m.modelo || m.id) === selectedModeloName)
  const selectedDoc = modelos.find(m => m.id === selectedDocId) || null
  const tiempos = tiemposAll[selectedDocId] || {}
  const allSubconjs = (selectedDoc?.subconjuntos || []).filter(s => !s.tipo || s.tipo === 'Completo')
  const lineas = [...new Set(allSubconjs.map(s => s.linea).filter(Boolean))].sort()
  const subconjuntos = lineaFilter === 'todas' ? allSubconjs : allSubconjs.filter(s => s.linea === lineaFilter)

  // Takt: prefer per-linea key, fall back to legacy docId key
  const taktKey = lineaFilter !== 'todas' ? `${selectedDocId}||${lineaFilter}` : selectedDocId
  const taktCs = parseTakt(savedTakt[taktKey] || savedTakt[selectedDocId] || '')

  function handleModeloChange(name) {
    setSelectedModeloName(name)
    setLineaFilter('todas')
    const caps = modelos.filter(m => (m.modelo || m.id) === name)
    if (caps.length) setSelectedDocId(caps[0].id)
    else setSelectedDocId('')
  }

  function handleCapChange(docId) {
    setSelectedDocId(docId)
    setLineaFilter('todas')
  }

  const selectStyle = {
    flex: 1, padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid #e0e0e0', fontSize: 14, background: '#fff', outline: 'none',
  }

  return (
    <div className="app">
      <Header title="Distribución de Línea" back="/soldadura" />

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 12px 4px', borderBottom: '1px solid var(--border)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <TabPill id="balance" label="⚖️ Balance" active={activeTab === 'balance'} onClick={setActiveTab} />
        <TabPill id="cobertura" label="✅ Cobertura" active={activeTab === 'cobertura'} onClick={setActiveTab} />
      </div>

      {/* Selectors */}
      <div style={{ padding: '10px 12px 6px', display: 'flex', gap: 8 }}>
        <select value={selectedModeloName} onChange={e => handleModeloChange(e.target.value)} style={selectStyle}>
          <option value="">— Modelo —</option>
          {modeloNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={selectedDocId} onChange={e => handleCapChange(e.target.value)} disabled={!selectedModeloName} style={{ ...selectStyle, opacity: selectedModeloName ? 1 : 0.45 }}>
          <option value="">— Cap —</option>
          {capsForModelo.map(c => <option key={c.id} value={c.id}>{c.cap || c.id}</option>)}
        </select>
      </div>

      {/* Linea filter tabs */}
      {lineas.length > 0 && (
        <div style={{ display: 'flex', gap: 6, padding: '0 12px 8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[{ id: 'todas', label: `Todas` }, ...lineas.map(l => ({ id: l, label: l }))].map(t => (
            <button key={t.id} onClick={() => setLineaFilter(t.id)} style={{
              flexShrink: 0, padding: '5px 14px', borderRadius: 16, border: '1.5px solid',
              borderColor: lineaFilter === t.id ? '#333' : '#d0d0d0',
              background: lineaFilter === t.id ? '#333' : '#fff',
              color: lineaFilter === t.id ? '#fff' : 'var(--text-primary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>{t.label}</button>
          ))}
        </div>
      )}

      {/* Takt display */}
      {selectedDocId && taktCs > 0 && (
        <div style={{ padding: '4px 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#f57c00' }}>🎯 Takt:</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f57c00', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
            {fmt(taktCs)}
          </span>
          {lineaFilter !== 'todas' && (
            <span style={{ fontSize: 11, color: '#aaa' }}>{lineaFilter}</span>
          )}
        </div>
      )}

      {/* Tab content */}
      {!selectedDocId ? (
        <div className="empty" style={{ paddingTop: 60 }}>
          <div className="ei">📊</div>
          <p>Seleccioná un modelo y capacidad</p>
        </div>
      ) : activeTab === 'balance' ? (
        <div className="content" style={{ paddingTop: 0 }}>
          <BalanceTab
            subconjuntos={subconjuntos}
            tiempos={tiempos}
            taktCs={taktCs}
            savedTakt={savedTakt}
            selectedDocId={selectedDocId}
            lineaFilter={lineaFilter}
          />
        </div>
      ) : (
        <CoberturaTab
          selectedDoc={selectedDoc}
          tiempos={tiempos}
          navigate={navigate}
          decodedId={selectedDocId}
        />
      )}
    </div>
  )
}
