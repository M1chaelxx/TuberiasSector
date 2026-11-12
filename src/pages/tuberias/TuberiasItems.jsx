import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'

const IconTriangle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 3v18h18L3 3z"/>
  </svg>
)

const IconWrench = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/>
  </svg>
)

const IconPlus = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
  </svg>
)

const IconDot = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="8"/>
  </svg>
)

const IconBolt = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/>
  </svg>
)

const PIEZA_CONFIG = {
  PP: { color: '#e65100', bg: '#fff3e0', label: 'Plano Plantilla', Icon: IconTriangle },
  SP: { color: '#37474f', bg: '#eceff1', label: 'Pieza Exportación', Icon: IconWrench },
  AD: { color: '#7b1fa2', bg: '#f3e5f5', label: 'Agregado', Icon: IconPlus },
  C:  { color: '#b71c1c', bg: '#ffebee', label: 'Consumible', Icon: IconDot },
  T:  { color: '#616161', bg: '#f5f5f5', label: 'Tornillo', Icon: IconBolt },
}

const FILTER_ORDER = ['Todos', 'PP', 'SP', 'AD', 'C', 'T']

function codigoLabel(it) {
  if (it.codigoCano) return { label: 'Cañería', code: it.codigoCano }
  if (it.descripSAP) return { label: 'Cod. SAP', code: it.descripSAP }
  if (it.codCobre) return { label: 'Cobre', code: it.codCobre }
  return null
}

export default function TuberiasItems() {
  const { modeloKey, cap, subcKey } = useParams()
  const navigate = useNavigate()
  const modelo = decodeURIComponent(modeloKey)
  const capDec = decodeURIComponent(cap)
  const subcDec = decodeURIComponent(subcKey)
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('Todos')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'tuberia_bd'),
      where('modelo', '==', modelo),
      where('cap', '==', capDec),
      where('codIntSubcParcial', '==', subcDec)
    )
    const unsub = onSnapshot(q, snap => {
      if (snap.metadata.fromCache && snap.empty) return
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [modelo, capDec, subcDec])

  const counts = { PP: 0, SP: 0, AD: 0, C: 0, T: 0 }
  for (const it of items) {
    if (it.pieza && counts[it.pieza] !== undefined) counts[it.pieza]++
  }

  const filtered = items.filter(it => {
    if (filter !== 'Todos' && it.pieza !== filter) return false
    if (!search) return true
    const s = search.toLowerCase()
    return (
      (it.plano && String(it.plano).toLowerCase().includes(s)) ||
      (it.titulo && it.titulo.toLowerCase().includes(s)) ||
      (it.codigoCano && it.codigoCano.toLowerCase().includes(s)) ||
      (it.descripSAP && it.descripSAP.toLowerCase().includes(s)) ||
      (it.modelo && it.modelo.toLowerCase().includes(s))
    )
  }).sort((a, b) => {
    const pa = a.pieza || 'Z'
    const pb = b.pieza || 'Z'
    if (pa !== pb) return pa.localeCompare(pb)
    return String(a.plano || '').localeCompare(String(b.plano || ''))
  })

  const backPath = `/tuberias/${encodeURIComponent(modeloKey)}/${encodeURIComponent(cap)}`

  return (
    <div className="app">
      <Header title={subcDec} back={backPath} />

      <div style={{ padding: '8px 12px 0', overflowX: 'auto', display: 'flex', gap: 6, flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch' }}>
        {FILTER_ORDER.map(f => {
          const cnt = f === 'Todos' ? items.length : counts[f] || 0
          if (f !== 'Todos' && cnt === 0) return null
          const cfg = PIEZA_CONFIG[f]
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`tab${filter === f ? ' active' : ''}`}
              style={{ flexShrink: 0 }}>
              {f === 'Todos' ? 'Todos' : cfg?.label || f}
              <span className="tab-count" style={{ marginLeft: 5 }}>{cnt}</span>
            </button>
          )
        })}
      </div>

      <div className="search-bar" style={{ position: 'relative', top: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por plano, modelo, código..." />
      </div>

      <div className="content">
        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="empty"><div className="ei">🔍</div><p>Sin resultados</p></div>
        )}
        {filtered.map(it => {
          const cfg = PIEZA_CONFIG[it.pieza] || PIEZA_CONFIG.T
          const { Icon } = cfg
          const cod = codigoLabel(it)
          return (
            <div key={it.id} className="card"
              onClick={() => navigate(`/tuberias/${encodeURIComponent(modeloKey)}/${encodeURIComponent(cap)}/${encodeURIComponent(subcKey)}/${it.id}`)}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: cfg.bg, color: cfg.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon />
              </div>
              <div className="info">
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>
                  {it.plano ? `Plano: ${it.plano}` : (it.codigoCano || '—')}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                  {modelo} | {capDec}
                </p>
                <p style={{ fontSize: 12, marginTop: 2 }}>
                  {it.titulo && <span style={{ color: '#444' }}>{it.titulo}</span>}
                  {it.titulo && cod && <span>{'  '}</span>}
                  {cod && (
                    <span style={{ color: '#1565c0', fontWeight: 600 }}>
                      {cod.label}: {cod.code}
                    </span>
                  )}
                  {!it.titulo && !cod && <span style={{ color: '#999' }}>—</span>}
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
