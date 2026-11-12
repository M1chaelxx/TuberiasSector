import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'

const PIEZA_STYLE = {
  PP: { color: '#e65100', bg: '#fff3e0', label: 'PP' },
  SP: { color: '#1565c0', bg: '#e3f2fd', label: 'SP' },
  AD: { color: '#2e7d32', bg: '#e8f5e9', label: 'AD' },
  C:  { color: '#b71c1c', bg: '#ffebee', label: 'C'  },
  T:  { color: '#616161', bg: '#f5f5f5', label: 'T'  },
}

export default function TuberiasSubconjuntos() {
  const { modeloKey, cap } = useParams()
  const navigate = useNavigate()
  const modelo = decodeURIComponent(modeloKey)
  const capDec = decodeURIComponent(cap)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'tuberia_bd'),
      where('modelo', '==', modelo),
      where('cap', '==', capDec)
    )
    const unsub = onSnapshot(q, snap => {
      if (snap.metadata.fromCache && snap.empty) return
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [modelo, capDec])

  const subcMap = {}
  for (const item of items) {
    const key = item.codIntSubcParcial || '-'
    if (!subcMap[key]) {
      subcMap[key] = {
        codInt: key,
        codComp: item.codIntSubcCompleto,
        nombre: item.descripcionGral || key,
        descSubcGral: item.descSubcGral,
        tipo: item.tipo,
        isPartial: item.codIntSubcCompleto && item.codIntSubcCompleto !== key,
        counts: { PP: 0, SP: 0, AD: 0, C: 0, T: 0 },
      }
    }
    const p = item.pieza
    if (p && subcMap[key].counts[p] !== undefined) subcMap[key].counts[p]++
    else if (p) subcMap[key].counts[p] = (subcMap[key].counts[p] || 0) + 1
  }

  // For parcial entries, use the completo's nombre so "Auxiliar Capilar (SC153)"
  // shows as "Tubo Capilar (SC153 · Parcial)" matching the old app display.
  for (const s of Object.values(subcMap)) {
    if (s.isPartial && s.codComp && subcMap[s.codComp]) {
      s.nombre = subcMap[s.codComp].nombre
    }
  }

  const subcs = Object.values(subcMap).sort((a, b) => a.nombre.localeCompare(b.nombre))
  const filtered = subcs.filter(s =>
    !search || s.nombre.toLowerCase().includes(search.toLowerCase()) ||
    s.codInt.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="app">
      <Header title={`${modelo} — ${capDec}`} back={`/tuberias/${encodeURIComponent(modeloKey)}`} />
      <div className="search-bar" style={{ position: 'relative', top: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar subconjunto..." />
      </div>
      <div className="content">
        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="empty"><div className="ei">🔍</div><p>Sin resultados</p></div>
        )}
        {filtered.map(s => {
          const subcKey = encodeURIComponent(s.codInt)
          const badges = Object.entries(s.counts).filter(([, v]) => v > 0)
          return (
            <div key={s.codInt} className="card"
              onClick={() => navigate(`/tuberias/${encodeURIComponent(modeloKey)}/${encodeURIComponent(cap)}/${subcKey}`)}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, background: '#f3e5f5',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0
              }}>📦</div>
              <div className="info">
                <h3>
                  {s.nombre}
                  {s.isPartial && (
                    <span style={{ marginLeft: 6, fontSize: 11, background: '#e3f2fd', color: '#1565c0', borderRadius: 8, padding: '1px 6px', fontWeight: 600 }}>
                      Parcial
                    </span>
                  )}
                </h3>
                <p style={{ fontSize: 12 }}>
                  {s.descSubcGral || '-'} ({s.codInt})
                </p>
                <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                  {badges.map(([tipo, cnt]) => {
                    const st = PIEZA_STYLE[tipo] || PIEZA_STYLE.T
                    return (
                      <span key={tipo} style={{
                        background: st.bg, color: st.color, border: `1px solid ${st.color}40`,
                        borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700
                      }}>
                        {tipo}: {cnt}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="arrow">›</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
