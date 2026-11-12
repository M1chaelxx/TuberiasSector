import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'

const LINEA_COLOR = { IDU: '#1976d2', ODU: '#e65100' }

export default function SoldaduraList() {
  const { modeloId } = useParams()
  const navigate = useNavigate()
  const [modelo, setModelo] = useState(null)
  const [tiempos, setTiempos] = useState({})
  const [search, setSearch] = useState('')
  const [lineaTab, setLineaTab] = useState('todos')
  const [loading, setLoading] = useState(true)

  const decodedId = decodeURIComponent(modeloId)

  useEffect(() => {
    const unsub1 = onSnapshot(doc(db, 'soldadura_modelos', decodedId), snap => {
      if (snap.exists()) setModelo({ id: snap.id, ...snap.data() })
      setLoading(false)
    }, () => setLoading(false))
    const unsub2 = onSnapshot(doc(db, 'soldadura_tiempos', decodedId), snap => {
      setTiempos(snap.exists() ? snap.data() : {})
    }, () => {})
    return () => { unsub1(); unsub2() }
  }, [decodedId])

  if (loading) return <div className="app"><div className="spinner"><div className="spin" /></div></div>
  if (!modelo) return <div className="app"><div className="empty"><p>Modelo no encontrado</p></div></div>

  // Only show Completo subconjuntos in the list
  const subconjs = (modelo.subconjuntos || []).filter(s => !s.tipo || s.tipo === 'Completo')
  const lineas = [...new Set(subconjs.map(s => s.linea).filter(Boolean))]

  function getId(s) { return s.codCompleto || s.codigo || '' }

  function hasMediciones(s) {
    const t = tiempos[getId(s)]
    if (!t) return false
    return Object.entries(t).some(([k, v]) => !k.startsWith('_') && v?.mediciones?.length > 0)
  }

  const filtered = subconjs.filter(s => {
    const id = getId(s)
    const desc = s.descGral || s.titulo || ''
    const matchSearch = !search || `${id} ${desc}`.toLowerCase().includes(search.toLowerCase())
    const matchLinea = lineaTab === 'todos' || s.linea === lineaTab
    return matchSearch && matchLinea
  })

  const backUrl = modelo.modelo ? `/soldadura/m/${encodeURIComponent(modelo.modelo)}` : '/soldadura'
  const tabs = [
    { id: 'todos', label: `Todos (${subconjs.length})` },
    ...lineas.map(l => ({ id: l, label: `${l} (${subconjs.filter(s => s.linea === l).length})` })),
  ]

  return (
    <div className="app">
      <Header title={`${modelo.modelo || ''} · ${modelo.cap || ''}`} back={backUrl} />

      <div className="search-bar">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar subconjunto..." />
      </div>

      {/* Linea pill tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '4px 12px 8px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setLineaTab(t.id)} style={{
            flexShrink: 0, padding: '6px 16px', borderRadius: 20, border: '1.5px solid',
            borderColor: lineaTab === t.id ? 'var(--primary)' : '#d0d0d0',
            background: lineaTab === t.id ? 'var(--primary)' : '#fff',
            color: lineaTab === t.id ? '#fff' : 'var(--text-primary)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      <div className="content" style={{ paddingTop: 0 }}>
        {filtered.length === 0 && (
          <div className="empty"><div className="ei">🔍</div><p>Sin resultados</p></div>
        )}
        {filtered.map(s => {
          const id = getId(s)
          const descGral = s.descGral || s.titulo || 'Sin descripción'
          const descSubc = s.descSubc || descGral
          const linea = s.linea || ''
          const lineaColor = LINEA_COLOR[linea] || 'var(--text-secondary)'
          const tiene = hasMediciones(s)
          return (
            <div key={id} className="card"
              onClick={() => navigate(`/soldadura/${encodeURIComponent(decodedId)}/${id}`)}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: tiene ? '#e8f5e9' : '#ede7f6',
                color: tiene ? '#2e7d32' : '#512da8',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>🔧</div>
              <div className="info">
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>{descGral}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {descSubc}
                  {linea && <> · <span style={{ color: lineaColor, fontWeight: 600 }}>{linea}</span></>}
                </p>
                <p style={{ fontSize: 11, color: '#aaa', marginTop: 1 }}>
                  {id}{s.codSubconjunto ? ` · Cod: ${s.codSubconjunto}` : ''}
                </p>
              </div>
              <div className="arrow">›</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
