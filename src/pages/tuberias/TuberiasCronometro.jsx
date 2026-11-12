import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useWakeLock } from '../../hooks/useWakeLock'

const PUESTOS = ['OMS-1', 'OMS-2', 'TJ-1', 'TJ-2', 'TJ-3', 'TJ-4', 'BLM', 'CC', 'CTDA']

function fmt(cs) {
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(c).padStart(2,'0')}`
}

function prom(meds) {
  if (!meds?.length) return 0
  return Math.round(meds.reduce((a, m) => a + m.tiempoObs, 0) / meds.length)
}

// Promedio de velocidad — solo entre las mediciones que la tienen cargada,
// ya que es un campo nuevo y las mediciones viejas no la tienen.
function promVel(meds) {
  const conVel = (meds || []).filter(m => m.velocidad != null)
  if (!conVel.length) return null
  return Math.round(conVel.reduce((a, m) => a + m.velocidad, 0) / conVel.length)
}

// ── PuestoTimer ────────────────────────────────────────────────────────────
function PuestoTimer({ puesto, plano, planoTiempos }) {
  const [open, setOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [manualSecs, setManualSecs] = useState('')
  const [useManual, setUseManual] = useState(false)
  const [comentario, setComentario] = useState('')
  // Velocidad de la máquina (%) al momento de medir — a diferencia del
  // comentario, NO se resetea al guardar ni al cerrar el panel: se mantiene
  // hasta que se cambia de pantalla (se pierde solo porque el componente se
  // desmonta), así no hay que reingresarla en cada medición si la máquina
  // sigue al mismo ritmo.
  const [velocidad, setVelocidad] = useState('100')
  const startRef = useRef(null)
  const rafRef = useRef(null)
  const baseRef = useRef(0)
  const elapsedRef = useRef(0)
  const wakeLock = useWakeLock()

  const tick = useCallback(() => {
    const cs = Math.floor((performance.now() - startRef.current) / 10) + baseRef.current
    elapsedRef.current = cs
    setElapsed(cs)
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  function startTimer() {
    startRef.current = performance.now()
    setRunning(true)
    setUseManual(false)
    setManualSecs('')
    rafRef.current = requestAnimationFrame(tick)
    wakeLock.request()
  }

  function pauseTimer() {
    cancelAnimationFrame(rafRef.current)
    baseRef.current = elapsedRef.current
    setRunning(false)
    wakeLock.release()
  }

  function resetTimer() {
    cancelAnimationFrame(rafRef.current)
    baseRef.current = 0
    elapsedRef.current = 0
    setElapsed(0)
    setRunning(false)
    setUseManual(false)
    setManualSecs('')
    wakeLock.release()
  }

  function toggleOpen() {
    if (open) {
      cancelAnimationFrame(rafRef.current)
      setRunning(false)
      wakeLock.release()
      baseRef.current = 0
      elapsedRef.current = 0
      setElapsed(0)
      setUseManual(false)
      setManualSecs('')
      setComentario('')
    }
    setOpen(o => !o)
  }

  async function guardarYContinuar() {
    const manualCs = useManual ? (parseInt(manualSecs) || 0) * 100 : 0
    const tiempoObs = useManual ? manualCs : elapsedRef.current
    if (tiempoObs === 0) return

    // Auto-restart immediately — zero gap
    if (!useManual) {
      startRef.current = performance.now()
      baseRef.current = 0
      elapsedRef.current = 0
    } else {
      setManualSecs('')
      setUseManual(false)
      baseRef.current = 0
      elapsedRef.current = 0
      setElapsed(0)
      startRef.current = performance.now()
      if (!running) {
        setRunning(true)
        rafRef.current = requestAnimationFrame(tick)
        wakeLock.request()
      }
    }
    const com = comentario.trim()
    setComentario('')
    const vel = velocidad !== '' ? Number(velocidad) : null

    const medicion = { tiempoObs, fecha: new Date().toISOString(), comentario: com, velocidad: vel }
    const docRef = doc(db, 'tuberia_tiempos', String(plano))
    const snap = await getDoc(docRef)
    const current = snap.exists() ? snap.data() : {}
    const currentMeds = current[puesto]?.mediciones || []
    await setDoc(docRef, { ...current, [puesto]: { mediciones: [...currentMeds, medicion] } })
  }

  async function deleteMedicion(idx) {
    if (!confirm('¿Eliminar esta medición?')) return
    const docRef = doc(db, 'tuberia_tiempos', String(plano))
    const snap = await getDoc(docRef)
    if (!snap.exists()) return
    const current = snap.data()
    const meds = [...(current[puesto]?.mediciones || [])]
    meds.splice(idx, 1)
    await setDoc(docRef, { ...current, [puesto]: { mediciones: meds } })
  }

  const meds = planoTiempos[puesto]?.mediciones || []
  const hasData = meds.length > 0
  const avg = prom(meds)
  const avgVel = promVel(meds)
  const manualCs = useManual ? (parseInt(manualSecs) || 0) * 100 : 0
  const displayCs = useManual ? manualCs : elapsed

  const circle = running && open
    ? { bg: '#4caf50', color: '#fff', icon: '●' }
    : hasData
    ? { bg: '#b3e5fc', color: '#0277bd', icon: '✓' }
    : { bg: '#e0e0e0', color: '#9e9e9e', icon: '○' }

  return (
    <div style={{ borderBottom: '1px solid #f0f0f0' }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: circle.bg, color: circle.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: running && open ? 13 : 16, fontWeight: 700, transition: 'background .25s'
        }}>
          {circle.icon}
        </div>
        <div style={{ flex: 1, cursor: 'pointer' }} onClick={toggleOpen}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{puesto}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
            {hasData
              ? `${meds.length} medición${meds.length !== 1 ? 'es' : ''} · Promedio: ${fmt(avg)}${avgVel != null ? ` · Vel. prom: ${avgVel}%` : ''}`
              : 'Sin mediciones'}
          </div>
        </div>
        <button onClick={toggleOpen} style={{
          background: open ? '#e0e0e0' : 'var(--primary)',
          color: open ? '#444' : '#fff',
          border: 'none', borderRadius: 20, padding: '7px 18px',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0
        }}>
          {open ? 'Cerrar' : hasData ? 'Medir' : '+ Medir'}
        </button>
      </div>

      {/* Expanded timer panel */}
      {open && (
        <div style={{ background: '#f8f9fa', borderTop: '1px solid #eee', padding: '20px 16px 16px' }}>

          {/* Clock display */}
          <div style={{
            fontSize: 58, fontWeight: 700, textAlign: 'center', letterSpacing: 3,
            fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace',
            color: running ? 'var(--success)' : 'var(--primary)', lineHeight: 1,
          }}>
            {fmt(displayCs)}
          </div>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)', letterSpacing: 1, marginTop: 6, marginBottom: 18 }}>
            MM : SS : cc
          </div>

          {/* Start / Pause / Reset */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {!running
              ? <button className="btn btn-success" style={{ flex: 1, fontSize: 16 }} onClick={startTimer}>
                  ▶ {elapsed > 0 && !useManual ? 'Reanudar' : 'Iniciar'}
                </button>
              : <button className="btn btn-warning" style={{ flex: 1, fontSize: 16 }} onClick={pauseTimer}>
                  ⏸ Pausar
                </button>
            }
            <button className="btn btn-grey" style={{ fontSize: 15 }} onClick={resetTimer}>↺ Reset</button>
          </div>

          {/* Manual seconds */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>O ingresá los segundos manualmente:</span>
            <input
              type="number" inputMode="numeric" min="0" step="1"
              value={manualSecs}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '')
                setManualSecs(v)
                setUseManual(true)
                if (running) { cancelAnimationFrame(rafRef.current); setRunning(false) }
              }}
              placeholder="ej: 145"
              style={{
                width: 150, border: '2px solid var(--primary)', borderRadius: 10,
                padding: '9px 14px', fontSize: 20, textAlign: 'center',
                fontVariantNumeric: 'tabular-nums', outline: 'none', fontWeight: 600,
              }}
            />
            {useManual && manualSecs !== '' && (
              <div style={{ fontSize: 14, color: 'var(--primary)', fontWeight: 700 }}>→ {fmt(manualCs)}</div>
            )}
          </div>

          {/* Velocidad de máquina */}
          <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>⚡ Velocidad de máquina (%)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number" inputMode="numeric" min="0" max="150" step="1"
                value={velocidad}
                onChange={e => setVelocidad(e.target.value.replace(/\D/g, ''))}
                style={{
                  width: 90, border: '2px solid var(--primary)', borderRadius: 10,
                  padding: '9px 10px', fontSize: 20, textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums', outline: 'none', fontWeight: 600, color: 'var(--primary)',
                }}
              />
              <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--primary)' }}>%</span>
            </div>
          </div>

          {/* Comment */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>💬 Comentario (opcional)</div>
            <textarea
              value={comentario} onChange={e => setComentario(e.target.value)}
              placeholder="Ej: material diferente, interrupción..."
              rows={2}
              style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* Save */}
          <button className="btn btn-success btn-full" onClick={guardarYContinuar}
            disabled={displayCs === 0} style={{ fontSize: 15, padding: '13px' }}>
            + Guardar y continuar
          </button>

          {/* Mediciones list */}
          {meds.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>
                📊 Mediciones — Promedio: {fmt(avg)}
                <span style={{ marginLeft: 8, background: 'var(--primary)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                  {meds.length}
                </span>
              </div>
              {[...meds].reverse().map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #e9e9e9' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums', minWidth: 88, fontFamily: 'monospace' }}>
                    {fmt(m.tiempoObs)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>
                    {new Date(m.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                    {m.velocidad != null ? ` · Vel. ${m.velocidad}%` : ''}
                    {m.comentario ? ` · ${m.comentario}` : ''}
                  </span>
                  <button onClick={() => deleteMedicion(meds.length - 1 - i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 19, padding: '2px 4px', lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main screen ─────────────────────────────────────────────────────────────
export default function TuberiasCronometro() {
  const { modeloKey, cap, subcKey, docId, plano: planoParam } = useParams()
  const location = useLocation()
  const [plano, setPlano] = useState(planoParam ?? null)
  const [planoTiempos, setPlanoTiempos] = useState({})
  const [loading, setLoading] = useState(!planoParam)

  // Only fetch from tuberia_bd when coming from the full item route (no planoParam)
  useEffect(() => {
    if (planoParam || !docId) return
    const unsub = onSnapshot(doc(db, 'tuberia_bd', docId), snap => {
      if (snap.exists()) setPlano(snap.data().plano ?? null)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [docId, planoParam])

  // Real-time listener — all users/devices stay in sync automatically
  useEffect(() => {
    if (!plano) return
    const unsub = onSnapshot(doc(db, 'tuberia_tiempos', String(plano)), snap => {
      setPlanoTiempos(snap.exists() ? snap.data() : {})
    }, () => {})
    return unsub
  }, [plano])

  // Si vino con un origen explícito (ej: Cobertura), vuelve ahí — si no, al
  // listado general de Tiempos como antes.
  const backPath = planoParam
    ? (location.state?.back || '/tuberias/tiempos')
    : `/tuberias/${encodeURIComponent(modeloKey)}/${encodeURIComponent(cap)}/${encodeURIComponent(subcKey)}/${docId}`

  if (loading) return <div className="app"><div className="spinner"><div className="spin" /></div></div>

  if (!plano) {
    return (
      <div className="app">
        <Header title="Tiempos" back={backPath} backState={location.state} />
        <div className="empty"><div className="ei">⏱</div><p>Este ítem no tiene número de plano.</p></div>
      </div>
    )
  }

  const totalMeds = PUESTOS.reduce((a, p) => a + (planoTiempos[p]?.mediciones?.length || 0), 0)

  return (
    <div className="app">
      <Header title={`Tiempos — Plano ${plano}`} back={backPath} backState={location.state} />

      {totalMeds > 0 && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', padding: '6px 0 2px' }}>
          {totalMeds} medición{totalMeds !== 1 ? 'es' : ''} guardadas · sincronizado en tiempo real
        </div>
      )}

      <div className="content" style={{ paddingTop: 8 }}>
        <div className="detail-section">
          {PUESTOS.map(p => (
            <PuestoTimer
              key={p}
              puesto={p}
              plano={plano}
              planoTiempos={planoTiempos}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
