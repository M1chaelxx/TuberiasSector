import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, doc, onSnapshot, getDocs, query, where, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import { calcularTablero, METAS_DEFAULT } from './tableroCalc'

// Tablero (cuadro de mando integral): junta en una sola pantalla los
// indicadores (KPIs) de lo que ya está cargado en la app. Es solo lectura —
// no cambia ningún dato ni cálculo de las otras pantallas. Lo único que se
// guarda son las METAS (config/tablero_metas), editables por Ingeniería/Admin.

const COLOR = { verde: '#2e9e5b', naranja: '#f29900', rojo: '#d93025', gris: '#9aa5b1' }
const ETIQUETA = { verde: 'En meta', naranja: 'Revisar', rojo: 'Bajo la meta', gris: 'Sin datos' }

// La lectura de planos de Tuberías es grande: se hace una vez por sesión
let ppCache = null

function KpiCard({ k, onClick }) {
  const c = COLOR[k.estado]
  const val = k.valor == null ? '—' : `${k.valor.toLocaleString('es-AR')}${k.unidad}`
  return (
    <div onClick={onClick} style={{
      background: '#fff', borderRadius: 14, padding: '11px 12px 10px', boxShadow: '0 1px 3px #0002',
      borderTop: `5px solid ${c}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', minHeight: 118,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.3, textTransform: 'uppercase' }}>{k.nombre}</div>
      <div style={{ fontSize: 29, fontWeight: 800, margin: '3px 0 1px', color: k.estado === 'gris' ? '#9aa5b1' : '#1c2733', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.3, flex: 1 }}>{k.detalle}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: c, marginTop: 6 }}>
        ● {ETIQUETA[k.estado]}{k.valor != null ? ` · meta ${k.mejor === 'menor' ? '≤ ' : ''}${k.meta}${k.unidad}` : ''}
      </div>
    </div>
  )
}

function Perspectiva({ icon, titulo, sub, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ padding: '0 2px 8px' }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: '#33414f', textTransform: 'uppercase', letterSpacing: 0.5 }}>{icon} {titulo}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>{sub}</div>
      </div>
      {children}
    </div>
  )
}

function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>
}

function Caja({ titulo, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '10px 12px', boxShadow: '0 1px 3px #0002', marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#33414f', marginBottom: 6 }}>{titulo}</div>
      {children}
    </div>
  )
}

function Barra({ nombre, valor, texto, color }) {
  return (
    <div style={{ margin: '7px 0', fontSize: 12.5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
        <b style={{ flexShrink: 0 }}>{texto}</b>
      </div>
      <div style={{ height: 10, background: '#e6eaf0', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, valor))}%`, height: '100%', background: color, borderRadius: 6 }} />
      </div>
    </div>
  )
}

const colorPct = (p, meta = 90) => (p >= meta ? COLOR.verde : p >= meta * 0.85 ? COLOR.naranja : COLOR.rojo)

function Spark({ serie }) {
  const max = Math.max(1, ...serie.map(s => s.n))
  const w = 340, h = 70, bw = w / serie.length
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 16}`}>
      <line x1="0" y1={h} x2={w} y2={h} stroke="#e6eaf0" />
      {serie.map((s, i) => {
        const bh = (s.n / max) * (h - 8)
        const hoy = i === serie.length - 1
        return (
          <g key={s.dia}>
            <rect x={i * bw + 3} y={h - bh} width={bw - 6} height={Math.max(bh, s.n ? 2 : 0)} rx="3" fill={i >= 7 ? '#1a73e8' : '#a9c7f5'} />
            {s.n > 0 && <text x={i * bw + bw / 2} y={h - bh - 3} fontSize="8.5" textAnchor="middle" fill="#5f6b7a">{s.n}</text>}
            <text x={i * bw + bw / 2} y={h + 12} fontSize="8" textAnchor="middle" fill={hoy ? '#d93025' : '#9aa5b1'} fontWeight={hoy ? 700 : 400}>{s.dia.slice(8)}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Tablero() {
  const navigate = useNavigate()
  const { user, isIngenieria } = useAuth()
  const soloCalidad = user?.role === 'calidad'
  const permitido = isIngenieria || soloCalidad

  const [datos, setDatos] = useState({ ppItems: ppCache })
  const [metasGuardadas, setMetasGuardadas] = useState({})
  const [showMetas, setShowMetas] = useState(false)
  const [metasForm, setMetasForm] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const set = (k, v) => setDatos(prev => ({ ...prev, [k]: v }))

  useEffect(() => { if (!permitido) navigate('/', { replace: true }) }, [permitido, navigate])

  useEffect(() => {
    if (!permitido) return
    const lista = (col, key, mapear) => onSnapshot(collection(db, col), snap => {
      if (snap.metadata.fromCache && snap.empty) return
      set(key, mapear ? mapear(snap) : snap.docs.map(x => ({ id: x.id, ...x.data() })))
    }, () => {})
    const mapa = snap => { const m = {}; snap.docs.forEach(x => { m[x.id] = x.data() }); return m }
    const unsubs = [
      lista('calidad_auditorias', 'auditorias'),
      lista('calidad_checklist_soldadura', 'chkSol'),
      lista('calidad_checklist_producto_terminado', 'chkPT'),
      lista('avisos', 'avisos'),
      onSnapshot(doc(db, 'config', 'tablero_metas'), s => setMetasGuardadas(s.exists() ? s.data() : {}), () => {}),
    ]
    if (isIngenieria) {
      unsubs.push(
        lista('soldadura_modelos', 'modelos'),
        lista('soldadura_tiempos', 'tiemposSol', mapa),
        lista('soldadura_puestos', 'puestosDocs', mapa),
        lista('soldadura_secuencia', 'secuencia'),
        lista('tuberia_tiempos', 'tiemposTub', mapa),
        onSnapshot(doc(db, 'config', 'takt_soldadura'), s => set('takt', s.exists() ? s.data() : {}), () => {}),
        onSnapshot(doc(db, 'config', 'tuberia_meta'), s => set('tubMeta', s.exists() ? s.data() : null), () => {}),
      )
      if (!ppCache) {
        getDocs(query(collection(db, 'tuberia_bd'), where('pieza', '==', 'PP'))).then(snap => {
          ppCache = snap.docs.map(x => { const r = x.data(); return { plano: r.plano, modelo: r.modelo } }).filter(r => r.plano)
          set('ppItems', ppCache)
        }).catch(() => {})
      }
    }
    const t = setTimeout(() => setCargando(false), 1500)
    return () => { unsubs.forEach(u => u()); clearTimeout(t) }
  }, [permitido, isIngenieria])

  const r = useMemo(() => calcularTablero(datos, metasGuardadas), [datos, metasGuardadas])
  const { kpis, alertas, extra } = r

  const visibles = Object.values(kpis).filter(k => isIngenieria || ['calidad', 'mejora'].includes(k.grupo))
  const cuenta = { verde: 0, naranja: 0, rojo: 0, gris: 0 }
  visibles.forEach(k => { cuenta[k.estado]++ })
  const conDato = visibles.length - cuenta.gris
  const alertasVisibles = alertas.filter(a => isIngenieria || ['/calidad', '/avisos'].some(p => a.path.startsWith(p)))
  const grupo = g => visibles.filter(k => k.grupo === g)
  const go = k => navigate(k.path)

  function abrirMetas() {
    const f = {}
    Object.keys(METAS_DEFAULT).forEach(id => { f[id] = String(r.metas[id].meta) })
    setMetasForm(f)
    setShowMetas(true)
  }
  async function guardarMetas() {
    setGuardando(true)
    try {
      const out = {}
      Object.entries(metasForm).forEach(([id, v]) => { const n = Number(v); if (v !== '' && !Number.isNaN(n)) out[id] = n })
      await setDoc(doc(db, 'config', 'tablero_metas'), out)
      setShowMetas(false)
    } catch (e) {
      alert('No se pudieron guardar las metas: ' + e.message)
    }
    setGuardando(false)
  }

  if (!permitido) return null

  return (
    <div className="app">
      <Header
        title="📊 Tablero"
        back="/"
        actions={isIngenieria && (
          <button onClick={abrirMetas} style={{ background: 'rgba(255,255,255,.18)', border: '1.5px solid rgba(255,255,255,.6)', color: '#fff', borderRadius: 8, padding: '5px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>⚙️ Metas</button>
        )}
      />
      <div className="content">
        {/* Resumen general */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 3px #0002' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Estado general</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              {cargando && conDato === 0 ? 'Cargando datos…' : `${cuenta.verde} de ${conDato} indicadores en meta`}
            </div>
          </div>
          <div style={{ display: 'flex', height: 12, borderRadius: 7, overflow: 'hidden', margin: '9px 0 8px', background: '#e6eaf0' }}>
            {['verde', 'naranja', 'rojo'].map(e => cuenta[e] > 0 && <div key={e} style={{ flex: cuenta[e], background: COLOR[e] }} />)}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, fontWeight: 700 }}>
            <span style={{ color: COLOR.verde }}>● {cuenta.verde} en meta</span>
            <span style={{ color: COLOR.naranja }}>● {cuenta.naranja} a revisar</span>
            <span style={{ color: COLOR.rojo }}>● {cuenta.rojo} bajo la meta</span>
          </div>
        </div>

        {/* Atención hoy */}
        <Perspectiva icon="🚨" titulo="Atención hoy" sub="Lo que conviene mirar primero. Tocá una fila para ir a esa pantalla.">
          <div style={{ background: '#fff', borderRadius: 14, padding: '2px 12px', boxShadow: '0 1px 3px #0002' }}>
            {alertasVisibles.length === 0 && (
              <div style={{ padding: '14px 0', fontSize: 13, color: COLOR.verde, fontWeight: 700 }}>✓ Sin alertas por ahora</div>
            )}
            {alertasVisibles.map((a, i) => (
              <div key={i} onClick={() => navigate(a.path)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < alertasVisibles.length - 1 ? '1px solid #eef0f3' : 'none', cursor: 'pointer' }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: COLOR[a.nivel], flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: 13, lineHeight: 1.3 }}>
                  <b>{a.texto}</b>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{a.sub}</div>
                </div>
                <span style={{ color: 'var(--primary)', fontSize: 18 }}>›</span>
              </div>
            ))}
          </div>
        </Perspectiva>

        {/* Procesos */}
        {isIngenieria && (
          <Perspectiva icon="🏭" titulo="Procesos" sub="¿Tenemos datos y líneas listas para trabajar? (Soldadura y Tuberías)">
            <Grid>{grupo('proceso').map(k => <KpiCard key={k.id} k={k} onClick={() => go(k)} />)}</Grid>

            {extra.solPorModelo?.length > 0 && (
              <Caja titulo="🔩 Soldadura: modelos con menos tiempos medidos">
                {extra.solPorModelo.slice(0, 5).map(m => (
                  <Barra key={m.nombre} nombre={m.nombre} valor={m.pct} texto={`${m.pct}% · ${m.medidas}/${m.total}`} color={colorPct(m.pct, r.metas.solCobertura.meta)} />
                ))}
              </Caja>
            )}
            {extra.pasanTakt?.length > 0 && (
              <Caja titulo="⏱️ Líneas que pasan el takt">
                {extra.pasanTakt.slice(0, 5).map(l => (
                  <div key={l.nombre} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
                    <span>{l.nombre}</span><b style={{ color: COLOR.rojo }}>+{l.seg} s</b>
                  </div>
                ))}
              </Caja>
            )}
            {extra.tubPorModelo?.length > 0 && (
              <Caja titulo="🔧 Tuberías: modelos con menos planos medidos">
                {extra.tubPorModelo.slice(0, 5).map(m => (
                  <Barra key={m.nombre} nombre={m.nombre} valor={m.pct} texto={`${m.pct}% · ${m.medidas}/${m.total}`} color={colorPct(m.pct, r.metas.tubCobertura.meta)} />
                ))}
              </Caja>
            )}
            <Caja titulo="📈 Mediciones por día (últimos 14 días)">
              <Spark serie={extra.actividad.serie} />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Azul oscuro: esta semana · azul claro: la anterior. Suma Soldadura y Tuberías.</div>
            </Caja>
          </Perspectiva>
        )}

        {/* Planificación */}
        {isIngenieria && (
          <Perspectiva icon="📅" titulo="Planificación" sub="¿Alcanzan los tiempos medidos para lo que se va a producir?">
            <Grid>
              {grupo('plan').map(k => <KpiCard key={k.id} k={k} onClick={() => go(k)} />)}
              {extra.plan && (
                <div style={{ background: '#fff', borderRadius: 14, padding: '11px 12px', boxShadow: '0 1px 3px #0002', borderTop: '5px solid #1a73e8', minHeight: 118 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3 }}>Equipos del mes</div>
                  <div style={{ fontSize: 29, fontWeight: 800, margin: '3px 0 1px', fontVariantNumeric: 'tabular-nums' }}>{extra.plan.totalQty.toLocaleString('es-AR')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Secuencia {extra.plan.mes}</div>
                </div>
              )}
            </Grid>
            {extra.plan?.faltan?.length > 0 && (
              <Caja titulo="Falta medir (por equipos del plan)">
                {extra.plan.faltan.slice(0, 5).map(f => (
                  <div key={f.nombre} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '4px 0' }}>
                    <span>{f.nombre}{!f.enApp && <span style={{ color: COLOR.naranja, fontSize: 11 }}> · no está en la app</span>}</span>
                    <b>{f.qty.toLocaleString('es-AR')}</b>
                  </div>
                ))}
              </Caja>
            )}
          </Perspectiva>
        )}

        {/* Calidad */}
        <Perspectiva icon="✅" titulo="Calidad" sub="Últimos 30 días, según las auditorías y check lists cargados.">
          <Grid>{grupo('calidad').map(k => <KpiCard key={k.id} k={k} onClick={() => go(k)} />)}</Grid>
          {extra.calTub && extra.calTub.nook > 0 && (
            <Caja titulo="Tuberías: dónde aparecen los NOOK">
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700 }}>POR MÁQUINA</div>
                  {extra.calTub.maquinas.map(m => <Barra key={m.nombre} nombre={m.nombre} valor={(m.n / extra.calTub.maquinas[0].n) * 100} texto={m.n} color={COLOR.rojo} />)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700 }}>POR CONTROL</div>
                  {extra.calTub.controles.map(m => <Barra key={m.nombre} nombre={m.nombre} valor={(m.n / extra.calTub.controles[0].n) * 100} texto={m.n} color={COLOR.naranja} />)}
                </div>
              </div>
            </Caja>
          )}
          {extra.calSol && extra.calSol.nok > 0 && (
            <Caja titulo="Check List Soldadura: NOK por categoría">
              {[[1, 'Documentación'], [2, 'Herramientas'], [3, 'Orden y limpieza']].map(([c, n]) => (
                <Barra key={c} nombre={n} valor={extra.calSol.nok ? (extra.calSol.porCat[c] / extra.calSol.nok) * 100 : 0} texto={extra.calSol.porCat[c]} color={COLOR.naranja} />
              ))}
            </Caja>
          )}
        </Perspectiva>

        {/* Mejora continua */}
        <Perspectiva icon="📢" titulo="Mejora continua" sub="¿Se resuelven rápido los problemas que se avisan?">
          <Grid>{grupo('mejora').map(k => <KpiCard key={k.id} k={k} onClick={() => go(k)} />)}</Grid>
          <Caja titulo="Avisos pendientes por prioridad">
            <div style={{ display: 'flex', textAlign: 'center' }}>
              {[['urgente', 'Urgente', '#d32f2f'], ['alta', 'Alta', '#e65100'], ['atencion', 'Atención', '#f9a825'], ['normal', 'Normal', '#1565c0']].map(([id, n, c]) => (
                <div key={id} style={{ flex: 1 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: extra.avisos.porPrio[id] ? c : '#c5ccd5' }}>{extra.avisos.porPrio[id] || 0}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{n}</div>
                </div>
              ))}
            </div>
          </Caja>
        </Perspectiva>

        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', margin: '18px 8px 4px', lineHeight: 1.5 }}>
          Los indicadores se calculan solos con lo que ya está cargado en la app. Verde: cumple la meta · Naranja: hasta 15% por debajo (o algo por encima si menos es mejor) · Rojo: más lejos. Las metas se pueden cambiar con ⚙️ Metas.
        </div>
      </div>

      {showMetas && (
        <div className="modal-overlay" onClick={() => !guardando && setShowMetas(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: '86vh', overflowY: 'auto' }}>
            <div className="modal-drag" />
            <h2>⚙️ Metas de los indicadores</h2>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.4 }}>
              Definí qué valor querés alcanzar en cada indicador. Se guardan para todos y el semáforo se recalcula solo.
            </p>
            {Object.entries(METAS_DEFAULT).filter(([id]) => isIngenieria || ['calTubOk', 'calSolOk', 'calEvidencia', 'calPtOk', 'avisosCierre', 'avisosViejos'].includes(id)).map(([id, m]) => (
              <div className="modal-field" key={id}>
                <label>{m.nombre} {m.mejor === 'menor' ? '(máximo' : '(mínimo'}{m.unidad.trim() ? ` en ${m.unidad.trim() === 'd' ? 'días' : m.unidad.trim()}` : ''})</label>
                <input type="number" inputMode="decimal" value={metasForm[id] ?? ''} onChange={e => setMetasForm({ ...metasForm, [id]: e.target.value })} disabled={guardando} />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{m.ayuda}</div>
              </div>
            ))}
            <div className="modal-actions">
              <button className="btn btn-grey" onClick={() => setMetasForm(Object.fromEntries(Object.entries(METAS_DEFAULT).map(([id, m]) => [id, String(m.meta)])))} disabled={guardando}>Valores sugeridos</button>
              <button className="btn btn-grey" onClick={() => setShowMetas(false)} disabled={guardando}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarMetas} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
