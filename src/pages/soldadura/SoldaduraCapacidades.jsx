import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'

export default function SoldaduraCapacidades() {
  const { modeloName } = useParams()
  const navigate = useNavigate()
  const modelo = decodeURIComponent(modeloName)
  const [caps, setCaps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'soldadura_modelos'), where('modelo', '==', modelo))
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.cap || '').localeCompare(b.cap || ''))
      setCaps(data)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [modelo])

  return (
    <div className="app">
      <Header title={modelo} back="/soldadura" />
      <div className="content">
        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && caps.length === 0 && (
          <div className="empty"><div className="ei">📦</div><p>Sin capacidades</p></div>
        )}
        {caps.map(c => {
          const subconjs = c.subconjuntos || []
          const lineas = [...new Set(subconjs.map(s => s.linea || s.linea).filter(Boolean))]
          return (
            <div key={c.id} className="card"
              onClick={() => navigate(`/soldadura/${encodeURIComponent(c.id)}`)}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: '#e8f5e9', color: '#2e7d32',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
              }}>{c.cap}</div>
              <div className="info">
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>{c.cap}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                  {lineas.join(', ')} · {subconjs.length} subconjunto{subconjs.length !== 1 ? 's' : ''}
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
