import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { doc, onSnapshot, setDoc, getDoc, collection } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import PhotoGrid from '../../components/PhotoGrid'
import PdfViewerModal from '../../components/PdfViewerModal'
import { useAuth } from '../../context/AuthContext'
import { useWakeLock } from '../../hooks/useWakeLock'
import OperarioSelect from '../../components/OperarioSelect'

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

// Mini cronómetro para cargar los segundos de una parte sin tipearlos: ▶ arranca
// (sigue desde lo que ya haya escrito), ⏹ frena. Va escribiendo los segundos
// en el campo mientras corre, así se puede corregir a mano igual que antes.
function MiniCrono({ valor, onChange }) {
  const [corre, setCorre] = useState(false)
  const t0 = useRef(0)
  const base = useRef(0)
  const timer = useRef(null)
  const cb = useRef(onChange)
  cb.current = onChange
  useEffect(() => () => clearInterval(timer.current), [])
  function toggle() {
    if (corre) {
      clearInterval(timer.current)
      setCorre(false)
      return
    }
    base.current = parseFloat(String(valor).replace(',', '.')) || 0
    t0.current = performance.now()
    timer.current = setInterval(() => {
      cb.current(((performance.now() - t0.current) / 1000 + base.current).toFixed(2))
    }, 100)
    setCorre(true)
  }
  return (
    <button type="button" onClick={toggle} title={corre ? 'Frenar' : 'Medir con cronómetro'}
      style={{ flexShrink: 0, border: 'none', borderRadius: 6, padding: '5px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        background: corre ? '#d32f2f' : '#e3f2fd', color: corre ? '#fff' : '#1565c0' }}>
      {corre ? '⏹' : '⏱'}
    </button>
  )
}

function prom(meds) {
  if (!meds?.length) return 0
  return Math.round(meds.reduce((a, m) => a + m.tiempoObs, 0) / meds.length)
}

// n = cantidad de mediciones · dispersionPct = (máx-mín)/promedio del tiempo
// observado. Solo informativo, no cambia ningún cálculo existente.
function dispersionObs(meds) {
  if (!meds?.length) return 0
  const vals = meds.map(m => m.tiempoObs)
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return avg > 0 ? Math.round((Math.max(...vals) - Math.min(...vals)) / avg * 100) : 0
}

function MuestraBadge({ n, dispersionPct }) {
  if (n === 0) return null
  const cfg =
    n === 1 ? { bg: '#ffebee', color: '#c62828', label: 'n=1 · muestra insuficiente' }
    : dispersionPct > 15 ? { bg: '#fff3e0', color: '#e65100', label: `±${dispersionPct}% dispersión` }
    : { bg: '#e8f5e9', color: '#2e7d32', label: `±${dispersionPct}% estable` }
  return (
    <span style={{ background: cfg.bg, color: cfg.color, borderRadius: 4, padding: '1px 6px', fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 6 }}>
      {cfg.label}
    </span>
  )
}

function parseTakt(str) {
  if (!str) return 0
  const parts = str.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 6000 + parts[1] * 100 + parts[2]
  if (parts.length === 2) return parts[0] * 6000 + parts[1] * 100
  return 0
}

// ── PuestoRow — clickeable para abrir/cerrar cronómetro ──────────────────
function PuestoRow({ puesto, puestoData, onMedir, isExpanded, isRunning }) {
  const meds = puestoData?.mediciones || []
  const hasData = meds.length > 0
  const avg = prom(meds)

  const circle = isRunning
    ? { bg: '#4caf50', color: '#fff', icon: '●' }
    : hasData
    ? { bg: '#b3e5fc', color: '#0277bd', icon: '✓' }
    : { bg: '#e0e0e0', color: '#9e9e9e', icon: '○' }

  return (
    <div
      onClick={() => onMedir(puesto)}
      style={{
        display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12,
        borderBottom: '1px solid #f0f0f0',
        cursor: 'pointer',
        background: isExpanded ? '#f5f5f5' : 'transparent',
        transition: 'background 0.2s',
      }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: circle.bg, color: circle.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: isRunning ? 13 : 16, fontWeight: 700, transition: 'background .25s',
      }}>
        {circle.icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{puesto}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
          {hasData
            ? <>
                {meds.length} medición{meds.length !== 1 ? 'es' : ''} · Promedio: {fmt(avg)}
                <MuestraBadge n={meds.length} dispersionPct={dispersionObs(meds)} />
              </>
            : 'Sin mediciones'}
        </div>
      </div>
      <div style={{ fontSize: 18, color: '#999', transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>›</div>
    </div>
  )
}

const LINEA_COLOR = { IDU: '#1976d2', ODU: '#e65100' }

function FieldRow({ label, value, colored }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: 13, color: colored ? LINEA_COLOR[value] || 'var(--text-secondary)' : 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: colored ? (LINEA_COLOR[value] || 'var(--text-primary)') : 'var(--text-primary)', textAlign: 'right', maxWidth: '60%' }}>{value || '—'}</span>
    </div>
  )
}

// Dado el código "crudo" de un subconjunto (el mismo que viaja en la URL,
// sin el sufijo ||P) y su tipo, busca bajo qué storageKey vive ese mismo
// código en OTRO modelo — mismo criterio que ya usa este componente para el
// propio modelo (||P solo cuando el Completo y el Parcial de ESE modelo
// comparten exactamente el mismo código). Devuelve null si ese modelo no
// tiene un subconjunto con ese código.
function storageKeyEnModelo(subconjuntos, codigoBuscado, esParcial) {
  if (!esParcial) {
    const s = (subconjuntos || []).find(sc => (sc.codCompleto || sc.codigo) === codigoBuscado)
    return s ? codigoBuscado : null
  }
  for (const s of (subconjuntos || [])) {
    const par = (s.parciales || []).find(p => p.codParcial === codigoBuscado)
    if (par) {
      const parentCode = s.codCompleto || s.codigo
      return parentCode === codigoBuscado ? `${codigoBuscado}||P` : codigoBuscado
    }
  }
  return null
}

// Una parte de preformado es { tipo, cant, obs }: obs = tiempo observado del
// tramo (cs) y cant = cuántas unidades de ese tipo se hicieron en él. Las
// partes guardadas en V287/V288 eran solo un número (cs) — se las lee con la
// cantidad del subconjunto de esa medición, que es como se las había dividido.
function normParte(pt, med) {
  if (typeof pt === 'number') return { tipo: '', cant: med?.subconjuntosQty || 1, obs: pt }
  return { tipo: pt.tipo || '', cant: Math.max(1, pt.cant || 1), obs: pt.obs || 0 }
}
// Un preformado completo lleva una unidad de cada tipo: el tiempo de la pieza
// es la suma del tiempo POR UNIDAD de cada parte (obs ÷ cant).
function totalesPartes(partes, valoracion) {
  const tiempoObs = partes.reduce((a, x) => a + Math.round(x.obs / x.cant), 0)
  return { tiempoObs, tiempoNorm: Math.round(tiempoObs * (valoracion || 100) / 100) }
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function SoldaduraDetail() {
  const { modeloId, codigo } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin, isProduccion, user } = useAuth()
  const [modelo, setModelo] = useState(null)
  const [tiempos, setTiempos] = useState({})
  const [loading, setLoading] = useState(true)
  const [tiemposOpen, setTiemposOpen] = useState(false)
  const [ciclosData, setCiclosData] = useState({})
  const [taktData, setTaktData] = useState({})
  const [visualizadores, setVisualizadores] = useState([])
  const [pdfModal, setPdfModal] = useState(null)
  const [selectedPuesto, setSelectedPuesto] = useState(null)
  const [running, setRunning] = useState(false)
  const [manualSecs, setManualSecs] = useState('')
  const [useManual, setUseManual] = useState(false)
  const [operario, setOperario] = useState('')
  const [subcQty, setSubcQty] = useState('1')
  const [valoracion, setValoracion] = useState('100')
  const [comentario, setComentario] = useState('')
  const [todosLosModelos, setTodosLosModelos] = useState([])
  // Preformado por partes: tiempos (cs) de cada tramo ya medido, todavía sin
  // sumar en una medición completa. Se guarda en localStorage para no perder
  // los tramos si se recarga la pantalla a mitad del preformado.
  const [partesPend, setPartesPend] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tubysol_partes_preformado')) || {} } catch { return {} }
  })
  const [tiposPref, setTiposPref] = useState([]) // tipos de preformado (lista editable, compartida)
  const [tiposSold, setTiposSold] = useState([]) // tipos de pieza para la medición por partes en los puestos SOL (mismo doc de config)
  const [partesOpen, setPartesOpen] = useState({}) // por puesto: bloque de partes desplegado
  const [parteTipo, setParteTipo] = useState('')
  const [parteCant, setParteCant] = useState('1')
  const [parteSec, setParteSec] = useState('') // segundos de la parte medidos con el mini cronómetro (o tipeados)
  const [parteReset, setParteReset] = useState(0) // cambia al guardar para frenar/reiniciar el mini cronómetro
  const [showTipos, setShowTipos] = useState(false)
  const [edicion, setEdicion] = useState(null) // { idx, sk, puesto, partes:[{tipo,cant,sec}] }
  const startRef = useRef(null)
  const rafRef = useRef(null)
  const baseRef = useRef(0)
  const elapsedRef = useRef(0)
  const clockRef = useRef(null)
  const wakeLock = useWakeLock()

  const decodedId = decodeURIComponent(modeloId)

  useEffect(() => {
    const unsub1 = onSnapshot(doc(db, 'soldadura_modelos', decodedId), snap => {
      if (snap.exists()) setModelo({ id: snap.id, ...snap.data() })
      setLoading(false)
    }, () => setLoading(false))
    const unsub2 = onSnapshot(doc(db, 'soldadura_tiempos', decodedId), snap => {
      setTiempos(snap.exists() ? snap.data() : {})
    }, () => {})
    const unsub3 = onSnapshot(doc(db, 'config', 'ciclos_soldadura'), snap => {
      if (snap.exists()) setCiclosData(snap.data())
    }, () => {})
    const unsub4 = onSnapshot(doc(db, 'config', 'takt_soldadura'), snap => {
      if (snap.exists()) setTaktData(snap.data())
    }, () => {})
    const unsub5 = onSnapshot(collection(db, 'soldadura_visualizadores'), snap => {
      setVisualizadores(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {})
    // Lista completa de modelos — para encontrar, en otros modelos, un
    // subconjunto que comparte el mismo código (ej: SC187 en "Inverter EZ
    // R32" y en "Inverter GP R32") y propagarle las mediciones nuevas.
    const unsub6 = onSnapshot(collection(db, 'soldadura_modelos'), snap => {
      setTodosLosModelos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {})
    const unsub7 = onSnapshot(doc(db, 'config', 'preformado_tipos'), snap => {
      setTiposPref(snap.exists() ? (snap.data().tipos || []) : [])
      setTiposSold(snap.exists() ? (snap.data().tiposSold || []) : [])
    }, () => {})
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6(); unsub7() }
  }, [decodedId])

  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  const tick = useCallback(() => {
    const cs = Math.floor((performance.now() - startRef.current) / 10) + baseRef.current
    elapsedRef.current = cs
    if (clockRef.current) clockRef.current.textContent = fmt(cs)
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  function setClockDisplay(cs) {
    if (clockRef.current) clockRef.current.textContent = fmt(cs)
    elapsedRef.current = cs
  }

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
    setClockDisplay(0)
    setRunning(false)
    setUseManual(false)
    setManualSecs('')
    wakeLock.release()
  }

  function selectPuesto(puesto) {
    // Al cambiar de puesto (o cerrar), detener y limpiar el cronómetro para
    // que el estado compartido no se filtre entre puestos distintos.
    cancelAnimationFrame(rafRef.current)
    setRunning(false)
    wakeLock.release()
    baseRef.current = 0
    elapsedRef.current = 0
    setClockDisplay(0)
    setUseManual(false)
    setManualSecs('')

    if (selectedPuesto === puesto) {
      setSelectedPuesto(null)
    } else {
      // Puesto distinto: además de resetear el timer, limpiar el formulario
      // completo para que no arrastre datos del puesto anterior.
      setOperario('')
      setSubcQty('1')
      setValoracion('100')
      setComentario('')
      setSelectedPuesto(puesto)
    }
  }

  function setPartes(key, arr) {
    setPartesPend(prev => {
      const next = { ...prev }
      if (arr.length) next[key] = arr; else delete next[key]
      try { localStorage.setItem('tubysol_partes_preformado', JSON.stringify(next)) } catch { /* sin storage */ }
      return next
    })
  }

  // Guarda el tiempo actual del cronómetro (o el manual) como un tramo más del
  // preformado, con su tipo y la cantidad de unidades que se hicieron en él.
  // No crea todavía una medición — se combinan después con "Completar".
  function guardarParte(key) {
    const manualCs = useManual ? (parseInt(manualSecs) || 0) * 100 : 0
    // Prioridad: segundos de la propia parte (mini cronómetro o tipeados); si no, el reloj grande de arriba
    const miniCs = Math.round((parseFloat(String(parteSec).replace(',', '.')) || 0) * 100)
    const obs = miniCs > 0 ? miniCs : (useManual ? manualCs : elapsedRef.current)
    const cant = Math.max(1, parseInt(parteCant) || 1)
    if (obs === 0 || !parteTipo) return
    setPartes(key, [...(partesPend[key] || []).map(x => normParte(x)), { tipo: parteTipo, cant, obs }])
    setParteTipo('')
    setParteCant('1')
    setParteSec('')
    setParteReset(n => n + 1)
    if (miniCs > 0) return // la parte salió del mini cronómetro: el reloj grande no se toca
    if (!useManual) {
      startRef.current = performance.now()
      baseRef.current = 0
      setClockDisplay(0)
    } else {
      setManualSecs('')
      setUseManual(false)
      baseRef.current = 0
      setClockDisplay(0)
    }
  }

  // Preformado usa `tipos`; los demás puestos usan `tiposSold` (mismo documento,
  // se guarda con merge para no pisar la otra lista).
  async function guardarTiposPref(arr, esPref = true) {
    await setDoc(doc(db, 'config', 'preformado_tipos'), esPref ? { tipos: arr } : { tiposSold: arr }, { merge: true })
  }
  async function agregarTipoPref(esPref = true) {
    const lista = esPref ? tiposPref : tiposSold
    const nombre = (prompt(esPref
      ? 'Nombre del tipo de preformado (ej: Colocar precinto, Colocar damping, Colocar butil):'
      : 'Nombre del tipo de pieza (ej: Soldar codo, Soldar soporte):') || '').trim()
    if (!nombre) return
    const existente = lista.find(t => t.toLowerCase() === nombre.toLowerCase())
    if (existente) { setParteTipo(existente); return }
    await guardarTiposPref([...lista, nombre], esPref)
    setParteTipo(nombre)
  }
  async function quitarTipoPref(t, esPref = true) {
    if (!confirm(`¿Sacar "${t}" de la lista? Las mediciones ya guardadas con ese tipo no se modifican.`)) return
    await guardarTiposPref((esPref ? tiposPref : tiposSold).filter(x => x !== t), esPref)
  }

  // Edición posguardado: reemplaza las partes de una medición y recalcula sus
  // totales. Se refleja también en los otros modelos que comparten el subconjunto
  // (se ubica la copia por fecha + operario, que no cambian al editar).
  async function guardarEdicion() {
    const ed = edicion
    if (!ed) return
    const partes = ed.partes
      .map(x => ({ tipo: (x.tipo || '').trim(), cant: Math.max(1, parseInt(x.cant) || 1), obs: Math.round((parseFloat(String(x.sec).replace(',', '.')) || 0) * 100) }))
      .filter(x => x.obs > 0)
    if (!partes.length) { alert('Dejá al menos una parte con tiempo'); return }
    if (partes.some(x => !x.tipo)) { alert('Elegí el tipo de cada parte'); return }

    const reemplazar = async (docId, key) => {
      const ref = doc(db, 'soldadura_tiempos', docId)
      const snap = await getDoc(ref)
      if (!snap.exists()) return
      const cur = snap.data()
      const meds = [...(cur[key]?.[ed.puesto]?.mediciones || [])]
      const i = docId === decodedId ? ed.idx : meds.findIndex(x => x.fecha === ed.fecha && x.operario === ed.operario)
      if (i < 0 || !meds[i]) return
      const t = totalesPartes(partes, meds[i].valoracion)
      meds[i] = { ...meds[i], partes, tiempoObs: t.tiempoObs, tiempoNorm: t.tiempoNorm, subconjuntosQty: 1 }
      await setDoc(ref, { ...cur, [key]: { ...(cur[key] || {}), [ed.puesto]: { mediciones: meds } } })
    }
    await reemplazar(decodedId, ed.sk)
    for (const sib of todosLosModelos) {
      if (sib.id === decodedId) continue
      const sibKey = storageKeyEnModelo(sib.subconjuntos, codigo, isPartial)
      if (sibKey) await reemplazar(sib.id, sibKey)
    }
    setEdicion(null)
  }

  // partesCs: si viene, la medición es la SUMA de esos tramos (no lee el
  // cronómetro ni lo resetea).
  async function guardarYContinuar(storageKey, partesCs = null) {
    if (!operario.trim()) { alert('Ingresá el nombre del operario'); return }
    const manualCs = useManual ? (parseInt(manualSecs) || 0) * 100 : 0
    const tiempoObs = partesCs ? totalesPartes(partesCs, 100).tiempoObs : (useManual ? manualCs : elapsedRef.current)
    if (tiempoObs === 0) return

    const val = isProduccion ? 100 : (parseInt(valoracion) || 100)
    const tiempoNorm = Math.round(tiempoObs * val / 100)

    if (!partesCs) {
      if (!useManual) {
        startRef.current = performance.now()
        baseRef.current = 0
        setClockDisplay(0)
      } else {
        setManualSecs('')
        setUseManual(false)
        baseRef.current = 0
        setClockDisplay(0)
      }
    }

    // La nota queda solo con lo que escribió el usuario — el desglose por
    // parte viaja en el campo `partes` y se muestra aparte en la lista.
    const com = comentario.trim()
    setComentario('')

    const medicion = {
      tiempoObs,
      tiempoNorm,
      valoracion: val,
      operario: operario.trim(),
      supervisor: user?.display || '',
      subconjuntosQty: partesCs ? 1 : (parseInt(subcQty) || 1),
      fecha: new Date().toISOString(),
      ...(com ? { comentario: com } : {}),
      ...(partesCs ? { partes: partesCs } : {}),
    }

    const docRef = doc(db, 'soldadura_tiempos', decodedId)
    const snap = await getDoc(docRef)
    const current = snap.exists() ? snap.data() : {}
    await setDoc(docRef, {
      ...current,
      [storageKey]: {
        ...(current[storageKey] || {}),
        [selectedPuesto]: { mediciones: [...(current[storageKey]?.[selectedPuesto]?.mediciones || []), medicion] },
      },
    })

    // Propaga la medición a otros modelos que comparten este mismo
    // subconjunto (ej: SC187 "Entrada Distribuidor Bronce" existe igual en
    // "Inverter EZ R32" y en "Inverter GP R32") — mismo criterio que ya se
    // usa en Tuberías para SP/AD/PP compartidos entre modelos.
    for (const sib of todosLosModelos) {
      if (sib.id === decodedId) continue
      const sibKey = storageKeyEnModelo(sib.subconjuntos, codigo, isPartial)
      if (!sibKey) continue
      const sibRef = doc(db, 'soldadura_tiempos', sib.id)
      const sibSnap = await getDoc(sibRef)
      const sibCurrent = sibSnap.exists() ? sibSnap.data() : {}
      await setDoc(sibRef, {
        ...sibCurrent,
        [sibKey]: {
          ...(sibCurrent[sibKey] || {}),
          [selectedPuesto]: { mediciones: [...(sibCurrent[sibKey]?.[selectedPuesto]?.mediciones || []), medicion] },
        },
      })
    }
  }

  async function updatePhotos(photos, sk) {
    await setDoc(doc(db, 'soldadura_tiempos', decodedId), {
      ...tiempos,
      [sk]: { ...(tiempos[sk] || {}), _fotos: photos },
    })
  }

  if (loading) return <div className="app"><div className="spinner"><div className="spin" /></div></div>

  // Find subconjunto — could be a Completo or a Parcial inside a Completo.
  // When navigation passes forcePartial=true (click desde sub-componentes),
  // buscamos Parcial primero para evitar conflictos cuando Completo y Parcial comparten código.
  const { forcePartial, partialParentCode } = location.state || {}

  let subconj = null
  let isPartial = false
  let parentSubconj = null

  if (!forcePartial) {
    for (const s of (modelo?.subconjuntos || [])) {
      if ((s.codCompleto || s.codigo) === codigo) { subconj = s; break }
    }
  }
  if (!subconj) {
    for (const s of (modelo?.subconjuntos || [])) {
      if (partialParentCode && (s.codCompleto || s.codigo) !== partialParentCode) continue
      const found = (s.parciales || []).find(p => p.codParcial === codigo)
      if (found) { subconj = found; parentSubconj = s; isPartial = true; break }
    }
  }
  // Fallback: si forcePartial pero no encontró parcial, buscar como completo
  if (!subconj && forcePartial) {
    for (const s of (modelo?.subconjuntos || [])) {
      if ((s.codCompleto || s.codigo) === codigo) { subconj = s; break }
    }
  }

  // Cuando Parcial y Completo comparten el mismo código, usar clave separada en Firestore
  const storageKey = (isPartial && partialParentCode && partialParentCode === codigo)
    ? `${codigo}||P`
    : codigo

  const photos = tiempos[storageKey]?._fotos || []
  const backUrl = location.state?.from
    || (isPartial
      ? `/soldadura/${encodeURIComponent(decodedId)}/${parentSubconj?.codCompleto || ''}`
      : `/soldadura/${encodeURIComponent(decodedId)}`)
  const title = isPartial
    ? (subconj?.descSubc || codigo)
    : (subconj?.descGral || subconj?.titulo || codigo)

  const parciales = (!isPartial && subconj?.parciales?.length > 0) ? subconj.parciales : []

  const puestosConMediciones = PUESTOS_SOL.filter(p => tiempos[storageKey]?.[p]?.mediciones?.length > 0)

  const cicloCs = parseTakt(ciclosData[`${decodedId}||${storageKey}`])
  const linea = subconj?.linea || ''
  const taktCs = linea ? parseTakt(taktData[`${decodedId}||${linea}`]) : 0

  const visMatches = visualizadores.filter(v =>
    (v.targets || []).some(t => t.modelo === modelo?.modelo && t.cap === modelo?.cap && t.codigo === storageKey)
  )

  return (
    <div className="app">
      <Header title={title} back={backUrl} backState={location.state?.filtro ? { filtro: location.state.filtro } : undefined} />

      <div className="content" style={{ paddingTop: 0 }}>

        {/* ── Información General ── */}
        <div className="detail-section" style={{ marginBottom: 0 }}>
          <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            🔧 Información General
          </div>
          <FieldRow label="Marca" value={modelo?.marca} />
          <FieldRow label="Modelo" value={modelo?.modelo} />
          <FieldRow label="Capacidad" value={modelo?.cap} />
          <FieldRow label="Línea" value={subconj?.linea} colored />
          {isPartial ? (
            <>
              <FieldRow label="Cod. Parcial" value={subconj?.codParcial} />
              <FieldRow label="Cod. Subconjunto" value={subconj?.codSubconjunto} />
              <FieldRow label="Descripción" value={subconj?.descSubc} />
            </>
          ) : (
            <>
              <FieldRow label="Cod. Completo" value={subconj?.codCompleto || subconj?.codigo} />
              <FieldRow label="Cod. Subconjunto" value={subconj?.codSubconjunto} />
              <FieldRow label="Descripción" value={subconj?.descGral || subconj?.titulo} />
            </>
          )}
        </div>

        {/* ── Fotos ── */}
        <div className="detail-section" style={{ marginBottom: 0 }}>
          <div className="section-header">📷 Fotos ({photos.length})</div>
          <PhotoGrid
            photos={photos}
            onUpdate={(photos) => updatePhotos(photos, storageKey)}
            canEdit={isAdmin}
            folder={`soldadura_fotos/${decodedId}/${storageKey}`}
          />
        </div>

        {/* ── Visualizador (PDF de montaje) ── */}
        {visMatches.length > 0 && (
          <div className="detail-section" style={{ marginBottom: 0 }}>
            <div className="section-header">📎 Visualizador</div>
            {visMatches.map(v => (
              <div key={v.id} onClick={() => setPdfModal(v.url)}
                style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                  background: '#ffebee', color: '#c62828',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                }}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{v.nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Conformación de montaje y piezas</div>
                </div>
                <div style={{ fontSize: 18, color: '#999' }}>↗</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Sub-componentes (Parciales) ── */}
        {parciales.length > 0 && (
          <div className="detail-section" style={{ marginBottom: 0 }}>
            <div className="section-header">🔧 Sub-componentes ({parciales.length}) — toca para medir</div>
            {parciales.map(p => (
              <div key={p.codParcial}
                onClick={() => navigate(
                  `/soldadura/${encodeURIComponent(decodedId)}/${p.codParcial}`,
                  { state: { forcePartial: true, partialParentCode: subconj?.codCompleto || subconj?.codigo } }
                )}
                style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.descSubc || p.codParcial}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {p.codParcial} · <span style={{ color: '#7b1fa2' }}>Parcial</span>
                  </div>
                </div>
                <div className="arrow">›</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tiempos de Producción (colapsable) ── */}
        <div className="detail-section" style={{ marginBottom: 0 }}>
          <div
            className="section-header"
            onClick={() => setTiemposOpen(o => !o)}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <span>⏱ Tiempos de Producción</span>
            <span style={{ fontSize: 18, transform: tiemposOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderBottom: tiemposOpen ? '1px solid #f0f0f0' : 'none' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Puestos con mediciones</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: puestosConMediciones.length > 0 ? 'var(--success)' : '#aaa' }}>
              {puestosConMediciones.length > 0 ? puestosConMediciones.join(', ') : 'Ninguno aún'}
            </span>
          </div>
          {tiemposOpen && PUESTOS_SOL.map(p => (
            <div key={p}>
              <PuestoRow
                puesto={p}
                puestoData={tiempos[storageKey]?.[p]}
                onMedir={selectPuesto}
                isExpanded={selectedPuesto === p}
                isRunning={selectedPuesto === p && running}
              />

              {/* Cronómetro inline bajo el puesto */}
              {selectedPuesto === p && (
                <div style={{ background: '#f9f9f9', padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>⏱ Medir: {p}</div>

                  {/* Clock */}
                  <div style={{
                    background: 'linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%)',
                    borderRadius: 12, padding: '20px 16px', marginBottom: 12,
                    textAlign: 'center', position: 'relative',
                  }}>
                    {(cicloCs > 0 || taktCs > 0) && (
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                        {cicloCs > 0 && (
                          <div style={{ textAlign: 'center', background: '#c8e6c9', borderRadius: 6, padding: '3px 8px' }}>
                            <div style={{ fontSize: 8, color: '#1b5e20', fontWeight: 800 }}>CICLO</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#1b5e20' }}>{fmt(cicloCs)}</div>
                          </div>
                        )}
                        {taktCs > 0 && (
                          <div style={{ textAlign: 'center', background: '#bbdefb', borderRadius: 6, padding: '3px 8px' }}>
                            <div style={{ fontSize: 8, color: '#0d47a1', fontWeight: 800 }}>TAKT</div>
                            <div style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: '#0d47a1' }}>{fmt(taktCs)}</div>
                          </div>
                        )}
                      </div>
                    )}

                    <div ref={clockRef} style={{
                      fontSize: 'clamp(32px, 12vw, 64px)', fontWeight: 700, textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace',
                      color: running ? '#4caf50' : '#1976d2', lineHeight: 1, marginBottom: 4,
                      whiteSpace: 'nowrap', WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%',
                    }}>
                      {useManual ? fmt((parseInt(manualSecs) || 0) * 100) : fmt(elapsedRef.current)}
                    </div>
                    <div style={{ fontSize: 10, color: '#999' }}>mm : ss : cc</div>
                  </div>

                  {/* Controls */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    {!running
                      ? <button
                          className="btn btn-success"
                          style={{ flex: 1, fontSize: 14, padding: '8px', opacity: operario.trim() ? 1 : 0.5, cursor: operario.trim() ? 'pointer' : 'not-allowed' }}
                          onClick={startTimer}
                          disabled={!operario.trim()}
                        >
                          ▶ {elapsedRef.current > 0 && !useManual ? 'Reanudar' : 'Iniciar'}
                        </button>
                      : <button className="btn btn-warning" style={{ flex: 1, fontSize: 14, padding: '8px' }} onClick={pauseTimer}>
                          ⏸ Pausar
                        </button>
                    }
                    <button className="btn btn-grey" style={{ fontSize: 12, padding: '8px 12px' }} onClick={resetTimer}>Reset</button>
                  </div>

                  {/* Manual input */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>O ingresá los segundos manualmente:</span>
                    <input
                      type="number" inputMode="numeric" min="0"
                      value={manualSecs}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '')
                        setManualSecs(v)
                        setUseManual(true)
                        if (running) { cancelAnimationFrame(rafRef.current); setRunning(false) }
                      }}
                      placeholder="ej: 145"
                      style={{
                        width: 110, border: '1px solid var(--primary)', borderRadius: 6,
                        padding: '6px 8px', fontSize: 14, textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums', outline: 'none', fontWeight: 600,
                      }}
                    />
                    {useManual && manualSecs !== '' && (
                      <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700 }}>→ {fmt((parseInt(manualSecs) || 0) * 100)}</div>
                    )}
                  </div>

                  {/* Operario */}
                  <OperarioSelect value={operario} onChange={setOperario} disabled={running} />

                  {/* Subconjuntos + Valoración */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>🔧 Subc.</div>
                      <input type="number" min="1" value={subcQty} onChange={e => setSubcQty(e.target.value)} style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px', fontSize: 13, textAlign: 'center', boxSizing: 'border-box', fontWeight: 600 }} />
                    </div>
                    {!isProduccion && (
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 2 }}>⚡ Val %</div>
                        <input type="number" min="1" max="200" value={valoracion} onChange={e => setValoracion(e.target.value)} style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px', fontSize: 13, textAlign: 'center', boxSizing: 'border-box', fontWeight: 600 }} />
                      </div>
                    )}
                  </div>

                  {/* Comentario */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 600 }}>📝 Nota (opcional)</div>
                    <textarea
                      value={comentario}
                      onChange={e => setComentario(e.target.value)}
                      placeholder="Ej: operario nuevo, material diferente, interrupción..."
                      rows={3}
                      style={{
                        width: '100%',
                        border: '1.5px solid #e0e0e0',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: 13,
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                        background: '#fafafa',
                        color: '#333',
                        transition: 'border 0.2s, background 0.2s',
                        outline: 'none',
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = 'var(--primary)'
                        e.target.style.background = '#fff'
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = '#e0e0e0'
                        e.target.style.background = '#fafafa'
                      }}
                    ></textarea>
                  </div>

                  {/* Medición por partes — Preformado siempre visible; en los puestos SOL se despliega a pedido */}
                  {(() => {
                    const esPref = p === 'Preformado'
                    const tiposDe = esPref ? tiposPref : tiposSold
                    const pKey = `${decodedId}||${storageKey}||${p}`
                    const partes = (partesPend[pKey] || []).map(x => normParte(x))
                    const total = totalesPartes(partes, 100).tiempoObs
                    const miniOk = (parseFloat(String(parteSec).replace(',', '.')) || 0) > 0
                    const puedeParte = !!operario.trim() && !!parteTipo && (parseInt(parteCant) || 0) >= 1 &&
                      (miniOk || (useManual ? parseInt(manualSecs) > 0 : (running || elapsedRef.current > 0)))
                    if (!esPref && !partesOpen[pKey] && partes.length === 0) {
                      return (
                        <button className="btn btn-grey btn-full" onClick={() => setPartesOpen(o => ({ ...o, [pKey]: true }))}
                          style={{ fontSize: 12, padding: '8px', marginBottom: 10 }}>
                          🧩 Medir por partes (varias piezas, una medición)
                        </button>
                      )
                    }
                    return (
                      <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#e65100' }}>🧩 {esPref ? 'Preformado por partes' : 'Medición por partes'}</span>
                          {!esPref && partes.length === 0 && (
                            <button onClick={() => setPartesOpen(o => ({ ...o, [pKey]: false }))} style={{ background: 'none', border: 'none', color: '#8d6e63', cursor: 'pointer', fontSize: 11 }}>Cerrar ✕</button>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: '#8d6e63', lineHeight: 1.4, marginBottom: 8 }}>
                          {esPref
                            ? 'Cada tramo es un tipo de trabajo con su cantidad (ej: 5 precintos en 30 s). Se calcula el tiempo por unidad de cada tipo y el preformado completo es una unidad de cada uno. En este modo el campo "Subc." de arriba no se usa.'
                            : 'Medí cada pieza o tramo con el cronómetro de arriba y guardalo como parte. Cada parte es un tipo de pieza con su cantidad; al completar se suma el tiempo por unidad de cada una en UNA sola medición. En este modo el campo "Subc." de arriba no se usa.'}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <select value={parteTipo} onChange={e => setParteTipo(e.target.value)}
                            style={{ flex: 1, minWidth: 0, borderRadius: 6, padding: '8px 10px', fontSize: 13, border: parteTipo ? '1px solid #ddd' : '2px solid #d32f2f', background: '#fff' }}>
                            <option value="">{esPref ? 'Tipo de preformado *' : 'Tipo de pieza *'}</option>
                            {tiposDe.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <button onClick={() => agregarTipoPref(esPref)} style={{ flexShrink: 0, background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9', borderRadius: 6, padding: '0 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ Nuevo</button>
                          <input type="number" min="1" value={parteCant} onChange={e => setParteCant(e.target.value)} title="Cantidad de unidades en este tramo"
                            style={{ width: 64, flexShrink: 0, border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px', fontSize: 13, textAlign: 'center', fontWeight: 600 }} />
                        </div>
                        <div style={{ fontSize: 10, color: '#8d6e63', marginBottom: 6 }}>
                          El número de la derecha es la <b>cantidad</b> de unidades hechas en este tramo.{' '}
                          {!isProduccion && tiposDe.length > 0 && (
                            <button onClick={() => setShowTipos(o => !o)} style={{ background: 'none', border: 'none', color: '#1565c0', cursor: 'pointer', fontSize: 10, padding: 0, textDecoration: 'underline' }}>
                              {showTipos ? 'Ocultar lista de tipos' : 'Editar lista de tipos'}
                            </button>
                          )}
                        </div>
                        {showTipos && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            {tiposDe.map(t => (
                              <span key={t} style={{ background: '#fff', border: '1px solid #ffe082', borderRadius: 12, padding: '3px 8px', fontSize: 11 }}>
                                {t} <button onClick={() => quitarTipoPref(t, esPref)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 12, padding: 0 }}>✕</button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: '#8d6e63', flexShrink: 0 }}>⏱ Tiempo de esta parte:</span>
                          <MiniCrono key={parteReset} valor={parteSec} onChange={setParteSec} />
                          <input type="text" inputMode="decimal" value={parteSec} placeholder="seg"
                            onChange={e => setParteSec(e.target.value.replace(/[^0-9.,]/g, ''))}
                            style={{ width: 80, border: '1px solid #ddd', borderRadius: 6, padding: '6px 8px', fontSize: 13, textAlign: 'center', fontWeight: 600, boxSizing: 'border-box' }} />
                          <span style={{ fontSize: 10, color: '#999' }}>s</span>
                          <span style={{ fontSize: 10, color: '#8d6e63', lineHeight: 1.3 }}>Si lo dejás vacío se usa el reloj de arriba.</span>
                        </div>
                        <button className="btn btn-grey btn-full" onClick={() => guardarParte(pKey)} disabled={!puedeParte}
                          style={{ fontSize: 12, padding: '8px', opacity: puedeParte ? 1 : 0.5 }}>
                          ➕ Guardar como parte
                        </button>
                        {partes.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            {partes.map((pt, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: '1px dashed #ffe082' }}>
                                <span>{pt.tipo || `Parte ${i + 1}`} <span style={{ color: '#999' }}>× {pt.cant}</span></span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
                                    {fmt(pt.obs)} → <b>{fmt(Math.round(pt.obs / pt.cant))}</b>/u
                                  </span>
                                  <button onClick={() => setPartes(pKey, partes.filter((_, j) => j !== i))}
                                    style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
                                </span>
                              </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, margin: '8px 0' }}>
                              <span>{esPref ? 'Preformado completo' : 'Subconjunto completo'} ({partes.length} tipo{partes.length !== 1 ? 's' : ''})</span>
                              <span style={{ fontFamily: 'monospace', color: '#1565c0' }}>{fmt(total)}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-grey" style={{ fontSize: 12, padding: '8px 10px' }}
                                onClick={() => { if (confirm('¿Descartar las partes cargadas?')) setPartes(pKey, []) }}>Descartar</button>
                              <button className="btn btn-success" style={{ flex: 1, fontSize: 13, padding: '8px', opacity: operario.trim() ? 1 : 0.5 }}
                                disabled={!operario.trim()}
                                onClick={async () => { await guardarYContinuar(storageKey, partes); setPartes(pKey, []) }}>
                                ✅ {esPref ? 'Completar preformado' : 'Completar medición'} (sumar partes)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Save */}
                  <button className="btn btn-success btn-full" onClick={() => guardarYContinuar(storageKey)} disabled={!operario.trim() || (useManual ? parseInt(manualSecs) === 0 : (!running && elapsedRef.current === 0))} style={{ fontSize: 13, padding: '10px' }}>
                    + Guardar y continuar
                  </button>

                  {/* Mediciones guardadas */}
                  {(() => {
                    const meds = tiempos[storageKey]?.[p]?.mediciones || []
                    if (meds.length === 0) return null
                    const avgNorm = Math.round(meds.reduce((a, m) => a + (m.tiempoNorm || 0) / (m.subconjuntosQty || 1), 0) / meds.length)
                    return (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8 }}>
                          📊 Mediciones guardadas — T. Normal Prom: {fmt(avgNorm)}
                          <span style={{ marginLeft: 6, background: 'var(--primary)', color: '#fff', borderRadius: 10, padding: '2px 7px', fontSize: 12 }}>
                            {meds.length}
                          </span>
                        </div>
                        {[...meds].reverse().map((m, i) => {
                          const tNorm = Math.round(m.tiempoNorm / (m.subconjuntosQty || 1))
                          return (
                            <div key={i} style={{ padding: '10px 0', borderTop: '1px solid #e9e9e9' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <div style={{ minWidth: 116 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ fontSize: 10, color: '#999', fontWeight: 600, width: 30 }}>Obs</span>
                                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
                                      {fmt(m.tiempoObs)}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                                    <span style={{ fontSize: 10, color: '#999', fontWeight: 600, width: 30 }}>Norm</span>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: '#6a1b9a', fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}>
                                      {fmt(tNorm)}
                                    </span>
                                  </div>
                                  {m.subconjuntosQty > 1 && (
                                    <div style={{ fontSize: 9, color: '#bbb', marginTop: 2, paddingLeft: 35 }}>
                                      ÷{m.subconjuntosQty} subc.
                                    </div>
                                  )}
                                </div>
                                <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)' }}>
                                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{m.operario}</div>
                                  <div style={{ marginTop: 2 }}>Val: {m.valoracion}%{m.subconjuntosQty > 1 ? ` · ${m.subconjuntosQty} subc.` : ''}</div>
                                  <div style={{ color: '#aaa' }}>{new Date(m.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</div>
                                </div>
                                <button
                                  onClick={async () => {
                                    if (!confirm('¿Eliminar esta medición?')) return
                                    const idx = meds.length - 1 - i
                                    const docRef = doc(db, 'soldadura_tiempos', decodedId)
                                    const snap = await getDoc(docRef)
                                    if (!snap.exists()) return
                                    const current = snap.data()
                                    const updated = [...(current[storageKey]?.[p]?.mediciones || [])]
                                    updated.splice(idx, 1)
                                    await setDoc(docRef, {
                                      ...current,
                                      [storageKey]: { ...(current[storageKey] || {}), [p]: { mediciones: updated } },
                                    })
                                  }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 19, padding: '2px 4px', lineHeight: 1 }}>×</button>
                              </div>
                              {(() => {
                                const val = m.valoracion || 100
                                const tienePartes = Array.isArray(m.partes) && m.partes.length > 0
                                const partesN = tienePartes ? m.partes.map(pt => normParte(pt, m)) : []
                                const realIdx = meds.length - 1 - i
                                const editando = edicion && edicion.sk === storageKey && edicion.puesto === p && edicion.idx === realIdx
                                const inputS = { border: '1px solid #ddd', borderRadius: 6, padding: '5px 6px', fontSize: 12, boxSizing: 'border-box' }
                                if (editando) {
                                  const setP = (k, campo, v) => setEdicion(e => ({ ...e, partes: e.partes.map((x, j) => j === k ? { ...x, [campo]: v } : x) }))
                                  return (
                                    <div style={{ marginTop: 7, background: '#fff8e1', border: '1.5px solid #ffb300', borderRadius: 8, padding: '8px 10px' }}>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: '#e65100', marginBottom: 6 }}>✏️ Editando partes</div>
                                      {!tienePartes && (
                                        <div style={{ fontSize: 10.5, color: '#8d6e63', lineHeight: 1.4, marginBottom: 6 }}>
                                          La medición que ya tenías pasó a ser la <b>primera parte</b> (su tiempo y su cantidad de subconjuntos no se pierden). Agregá abajo las otras piezas con "+ Agregar parte"; el total de la medición pasa a ser la suma del tiempo por unidad de cada parte.
                                        </div>
                                      )}
                                      {edicion.partes.map((x, k) => (
                                        <div key={k} style={{ display: 'flex', gap: 5, marginBottom: 5, alignItems: 'center' }}>
                                          <select value={x.tipo} onChange={e => setP(k, 'tipo', e.target.value)} style={{ ...inputS, flex: 1, minWidth: 0, background: '#fff' }}>
                                            <option value="">Tipo *</option>
                                            {[...new Set([...(p === 'Preformado' ? tiposPref : tiposSold), ...(x.tipo ? [x.tipo] : [])])].map(t => <option key={t} value={t}>{t}</option>)}
                                          </select>
                                          <input type="number" min="1" value={x.cant} onChange={e => setP(k, 'cant', e.target.value)} title="Cantidad" style={{ ...inputS, width: 48, textAlign: 'center' }} />
                                          <input type="text" inputMode="decimal" value={x.sec} onChange={e => setP(k, 'sec', e.target.value.replace(/[^0-9.,]/g, ''))} title="Segundos observados" style={{ ...inputS, width: 62, textAlign: 'center' }} />
                                          <MiniCrono valor={x.sec} onChange={v => setP(k, 'sec', v)} />
                                          <span style={{ fontSize: 10, color: '#999' }}>s</span>
                                          <button onClick={() => setEdicion(e => ({ ...e, partes: e.partes.filter((_, j) => j !== k) }))}
                                            style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 14, padding: 0 }}>✕</button>
                                        </div>
                                      ))}
                                      <div style={{ fontSize: 10, color: '#8d6e63', marginBottom: 6 }}>Tipo · cantidad de unidades · segundos observados del tramo</div>
                                      <button onClick={() => setEdicion(e => ({ ...e, partes: [...e.partes, { tipo: '', cant: '1', sec: '' }] }))}
                                        style={{ background: '#fff', border: '1px dashed #ffb300', color: '#e65100', borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>+ Agregar parte</button>
                                      <div style={{ display: 'flex', gap: 6 }}>
                                        <button className="btn btn-grey" style={{ fontSize: 12, padding: '7px 10px' }} onClick={() => setEdicion(null)}>Cancelar</button>
                                        <button className="btn btn-success" style={{ flex: 1, fontSize: 12, padding: '7px' }} onClick={guardarEdicion}>Guardar cambios</button>
                                      </div>
                                    </div>
                                  )
                                }
                                if (!tienePartes) {
                                  return (
                                    <div style={{ marginTop: 6 }}>
                                      <button onClick={() => setEdicion({
                                        idx: realIdx, sk: storageKey, puesto: p, fecha: m.fecha, operario: m.operario,
                                        partes: [
                                          { tipo: title, cant: String(m.subconjuntosQty || 1), sec: String(m.tiempoObs / 100) },
                                          { tipo: '', cant: '1', sec: '' },
                                        ],
                                      })} style={{ background: 'none', border: 'none', color: '#1565c0', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}>
                                        🧩 Agregar partes a esta medición
                                      </button>
                                    </div>
                                  )
                                }
                                return (
                                  <div style={{ marginTop: 7, background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '6px 10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: '#e65100' }}>
                                        🧩 Desglose — {partesN.length} parte{partesN.length !== 1 ? 's' : ''}
                                      </span>
                                      <button onClick={() => setEdicion({
                                        idx: realIdx, sk: storageKey, puesto: p, fecha: m.fecha, operario: m.operario,
                                        partes: partesN.map(x => ({ tipo: x.tipo, cant: String(x.cant), sec: String(x.obs / 100) })),
                                      })} style={{ background: 'none', border: 'none', color: '#1565c0', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}>✏️ Editar partes</button>
                                    </div>
                                    {partesN.map((x, j) => (
                                      <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, padding: '2px 0', fontVariantNumeric: 'tabular-nums' }}>
                                        <span style={{ color: '#795548' }}>{x.tipo || `Parte ${j + 1}`} <span style={{ color: '#aaa' }}>× {x.cant}</span></span>
                                        <span style={{ fontFamily: 'monospace', textAlign: 'right' }}>
                                          Obs {fmt(x.obs)} · <b style={{ color: '#6a1b9a' }}>Norm {fmt(Math.round(x.obs * val / 100 / x.cant))}</b>/u
                                        </span>
                                      </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, borderTop: '1px dashed #ffe082', marginTop: 3, paddingTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                                      <span>{p === 'Preformado' ? 'Preformado completo' : 'Subconjunto completo'}</span>
                                      <span style={{ fontFamily: 'monospace' }}>
                                        Obs {fmt(m.tiempoObs)} · <span style={{ color: '#6a1b9a' }}>Norm {fmt(tNorm)}</span>
                                      </span>
                                    </div>
                                  </div>
                                )
                              })()}
                              {m.comentario && (
                                <div style={{
                                  marginTop: 7,
                                  background: '#fffde7', borderLeft: '3px solid #ffc107',
                                  borderRadius: '0 6px 6px 0', padding: '5px 11px',
                                  fontSize: 12, color: '#5d4037', fontStyle: 'italic',
                                }}>
                                  💬 {m.comentario}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>

      </div>

      <PdfViewerModal url={pdfModal} onClose={() => setPdfModal(null)} />
    </div>
  )
}
