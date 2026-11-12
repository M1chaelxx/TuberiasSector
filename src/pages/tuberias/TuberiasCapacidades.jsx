import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'

const LINEA_COLORS = {
  IDU:      { bg: '#e3f2fd', color: '#1565c0' },
  ODU:      { bg: '#e8f5e9', color: '#2e7d32' },
  PORTATIL: { bg: '#fff3e0', color: '#e65100' },
  WRAC:     { bg: '#f3e5f5', color: '#6a1b9a' },
}

export default function TuberiasCapacidades() {
  const { modeloKey } = useParams()
  const navigate = useNavigate()
  const modelo = decodeURIComponent(modeloKey)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'tuberia_bd'), where('modelo', '==', modelo))
    const unsub = onSnapshot(q, snap => {
      if (snap.metadata.fromCache && snap.empty) return
      const data = snap.docs.map(d => d.data())
      setItems(data)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [modelo])

  const capMap = {}
  for (const item of items) {
    const key = item.cap
    if (!capMap[key]) capMap[key] = { cap: key, lineas: new Set(), registros: 0 }
    capMap[key].lineas.add(item.linea)
    capMap[key].registros++
  }
  const caps = Object.values(capMap)
    .map(c => ({ ...c, lineas: [...c.lineas].filter(Boolean).sort() }))
    .sort((a, b) => a.cap.localeCompare(b.cap))

  const filtered = caps.filter(c =>
    !search || c.cap.toLowerCase().includes(search.toLowerCase())
  )

  function capIcon(cap) {
    if (cap.includes('FC')) return { bg: '#e3f2fd', color: '#1565c0', letter: cap }
    if (cap.includes('FS')) return { bg: '#e8f5e9', color: '#2e7d32', letter: cap }
    return { bg: '#f5f5f5', color: '#616161', letter: cap }
  }

  return (
    <div className="app">
      <Header title={modelo} back="/tuberias" />
      <div className="search-bar" style={{ position: 'relative', top: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar capacidad..." />
      </div>
      <div className="content">
        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="empty"><div className="ei">🔍</div><p>Sin resultados</p></div>
        )}
        {filtered.map(c => {
          const ic = capIcon(c.cap)
          return (
            <div key={c.cap} className="card"
              onClick={() => navigate(`/tuberias/${encodeURIComponent(modeloKey)}/${encodeURIComponent(c.cap)}`)}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: ic.bg, color: ic.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, flexShrink: 0, textAlign: 'center', lineHeight: 1.2
              }}>
                {c.cap}
              </div>
              <div className="info">
                <h3>{c.cap}</h3>
                <p>{c.lineas.join(', ')} — {c.registros} registros</p>
              </div>
              <div className="arrow">›</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
