import { useState, useEffect } from 'react'
import { collection, doc, onSnapshot, getDocs, query, where } from 'firebase/firestore'
import { useNavigate, useLocation } from 'react-router-dom'
import { db } from '../../firebase'
import Header from '../../components/Header'

const PUESTOS = ['OMS-1', 'OMS-2', 'TJ-1', 'TJ-2', 'TJ-3', 'TJ-4', 'BLM', 'CC', 'CTDA']

export default function TuberiasCobertura() {
  const navigate = useNavigate()
  const location = useLocation()
  const [meta, setMeta] = useState(null)
  // Si venimos de "volver" desde medir un plano, restauramos el filtro que
  // tenía esta pantalla antes de salir — así no hay que reelegirlo cada vez.
  // Si se entra de cero (desde el menú), arranca vacío como siempre.
  const [selectedModelo, setSelectedModelo] = useState(() => location.state?.filtro?.modelo || '')
  const [selectedCap, setSelectedCap] = useState(() => location.state?.filtro?.cap || '')
  const [ppItems, setPpItems] = useState([])
  const [tiempos, setTiempos] = useState({})
  const [loading, setLoading] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'tuberia_meta'), snap => {
      if (snap.exists()) setMeta(snap.data())
    }, () => {})
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tuberia_tiempos'), snap => {
      if (snap.metadata.fromCache && snap.empty) return
      const data = {}
      snap.docs.forEach(d => { data[d.id] = d.data() })
      setTiempos(data)
    }, () => {})
    return unsub
  }, [])

  useEffect(() => {
    if (!selectedModelo) { setPpItems([]); return }
    setLoading(true)
    setPendingOnly(false)
    getDocs(query(
      collection(db, 'tuberia_bd'),
      where('modelo', '==', selectedModelo),
      where('pieza', '==', 'PP')
    )).then(snap => {
      const seen = new Set()
      const items = []
      snap.docs.forEach(d => {
        const r = d.data()
        if (!r.plano || seen.has(r.plano)) return
        seen.add(r.plano)
        items.push({ plano: String(r.plano), titulo: r.titulo || r.codigoCano || null, cap: r.cap || '' })
      })
      items.sort((a, b) => Number(a.plano) - Number(b.plano))
      setPpItems(items)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selectedModelo])

  const modelos = meta?.modelos || []
  const modeloData = modelos.find(m => m.nombre === selectedModelo)
  const caps = modeloData?.caps || []

  const filteredItems = ppItems.filter(item => !selectedCap || item.cap === selectedCap)

  const items = filteredItems.map(item => {
    const t = tiempos[item.plano] || {}
    const puestosConDatos = PUESTOS.filter(p => t[p]?.mediciones?.length > 0)
    return { ...item, isMedido: puestosConDatos.length > 0, puestosConDatos }
  })

  const medidos = items.filter(i => i.isMedido).length
  const total = items.length
  const pendientes = total - medidos
  const pct = total > 0 ? Math.round(medidos / total * 100) : 0
  const barColor = pct < 50 ? '#e53935' : pct < 80 ? '#f57c00' : '#43a047'

  const displayed = pendingOnly ? items.filter(i => !i.isMedido) : items

  return (
    <div className="app">
      <Header title="Cobertura Tuberías" back="/tuberias" />

      <div style={{ padding: '12px 16px 8px', display: 'flex', gap: 8 }}>
        <select
          value={selectedModelo}
          onChange={e => { setSelectedModelo(e.target.value); setSelectedCap('') }}
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, background: '#fff' }}
        >
          <option value="">— Modelo —</option>
          {modelos.map(m => <option key={m.nombre} value={m.nombre}>{m.nombre}</option>)}
        </select>
        <select
          value={selectedCap}
          onChange={e => setSelectedCap(e.target.value)}
          disabled={!selectedModelo}
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, background: '#fff', opacity: selectedModelo ? 1 : 0.45 }}
        >
          <option value="">— Capacidad (todas) —</option>
          {caps.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {!selectedModelo && (
        <div className="empty" style={{ paddingTop: 60 }}>
          <div className="ei">📋</div>
          <p>Seleccioná un modelo para ver la cobertura de planos</p>
        </div>
      )}

      {selectedModelo && !loading && (
        <>
          <div style={{ padding: '4px 16px 10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{medidos} de {total} planos medidos</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: barColor }}>{pct}%</span>
            </div>
            <div style={{ background: '#e0e0e0', borderRadius: 4, height: 7, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${pct}%`, transition: 'width 0.4s' }} />
            </div>
          </div>

          <div className="content" style={{ paddingTop: 0 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '2px 0 12px', fontSize: 13,
              color: 'var(--text-secondary)', cursor: 'pointer'
            }}>
              <input type="checkbox" checked={pendingOnly} onChange={e => setPendingOnly(e.target.checked)} />
              Ver solo pendientes ({pendientes})
            </label>

            {displayed.length === 0 && !pendingOnly && (
              <div className="empty"><div className="ei">📊</div><p>Sin planos PP para este modelo</p></div>
            )}
            {displayed.length === 0 && pendingOnly && (
              <div className="empty"><div className="ei">✅</div><p>Todos los planos están medidos</p></div>
            )}

            {displayed.map(item => (
              <div key={item.plano} className="card"
                onClick={() => navigate(`/tuberias/tiempos/${item.plano}`, { state: { back: '/tuberias/cobertura', filtro: { modelo: selectedModelo, cap: selectedCap } } })}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: item.isMedido ? '#e8f5e9' : '#ffebee',
                  color: item.isMedido ? '#2e7d32' : '#c62828',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 700,
                }}>
                  {item.isMedido ? '✓' : '✕'}
                </div>
                <div className="info" style={{ gap: 2 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Plano {item.plano}</h3>
                  {item.titulo && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{item.titulo}</p>
                  )}
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0 }}>Cap: {item.cap}</p>
                  {item.isMedido && (
                    <p style={{ fontSize: 11, color: 'var(--primary)', margin: 0, fontWeight: 600 }}>
                      Medido en: {item.puestosConDatos.join(', ')}
                    </p>
                  )}
                </div>
                <div className="arrow">›</div>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedModelo && loading && (
        <div className="spinner"><div className="spin" /></div>
      )}
    </div>
  )
}
