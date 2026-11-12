import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'

// Vista de solo lectura para el perfil Externo: navega los modelos de
// Soldadura (mismos datos que /soldadura) pero sin tiempos ni mediciones,
// terminando en las piezas de Tuberías del mismo subconjunto.
export default function ExternoModelos() {
  const navigate = useNavigate()
  const [docs, setDocs] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'soldadura_modelos'), snap => {
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  const groups = docs.reduce((acc, d) => {
    const key = d.modelo || d.id
    if (!acc[key]) acc[key] = []
    acc[key].push(d)
    return acc
  }, {})

  const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  const filtered = !search
    ? sorted
    : sorted.filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="app">
      <Header title="Modelos" back="/" />

      <div className="search-bar">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo..." />
      </div>

      <div className="content">
        {loading && <div className="spinner"><div className="spin" /></div>}

        {!loading && filtered.length === 0 && (
          <div className="empty">
            <div className="ei">🔧</div>
            <p>No hay modelos cargados.</p>
          </div>
        )}

        {filtered.map(([modeloName, caps]) => {
          const totalSubc = caps.reduce((a, c) => a + (c.subconjuntos?.length || 0), 0)
          const capNames = [...new Set(caps.map(c => c.cap).filter(Boolean))].sort()
          return (
            <div key={modeloName} className="card"
              onClick={() => navigate(`/externo/modelos/${encodeURIComponent(modeloName)}`)}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: '#e3f2fd', color: '#1565c0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              }}>🔧</div>
              <div className="info">
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>{modeloName}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                  {caps.length} capacidad{caps.length !== 1 ? 'es' : ''}: {capNames.join(', ')}
                </p>
                <p style={{ fontSize: 12, marginTop: 2 }}>{totalSubc} subconjuntos</p>
              </div>
              <div className="arrow">›</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
