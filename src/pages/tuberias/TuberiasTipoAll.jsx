import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, doc, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'

const IconTriangle = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3v18h18L3 3z"/></svg>
)
const IconWrench = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>
)
const IconPlus = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
)

const PIEZA_CONFIG = {
  PP: { color: '#e65100', bg: '#fff3e0', label: 'Plano Plantilla', Icon: IconTriangle },
  SP: { color: '#37474f', bg: '#eceff1', label: 'Pieza Exportación', Icon: IconWrench },
  AD: { color: '#7b1fa2', bg: '#f3e5f5', label: 'Agregado', Icon: IconPlus },
}

function codigoLabel(it) {
  if (it.codigoCano) return { label: 'Cañería', code: it.codigoCano }
  if (it.descripSAP) return { label: 'Cod. SAP', code: it.descripSAP }
  if (it.codCobre) return { label: 'Cobre', code: it.codCobre }
  return null
}

export default function TuberiasTipoAll() {
  const { tipo } = useParams()
  const navigate = useNavigate()
  const cfg = PIEZA_CONFIG[tipo] || PIEZA_CONFIG.PP
  const { Icon } = cfg

  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeModelos, setActiveModelos] = useState(null) // null = todavía no cargó
  const [fModelo, setFModelo] = useState('')
  const [fCap, setFCap] = useState('')
  const [fLinea, setFLinea] = useState('')

  useEffect(() => {
    const q = query(collection(db, 'tuberia_bd'), where('pieza', '==', tipo))
    const unsub = onSnapshot(q, snap => {
      if (snap.metadata.fromCache && snap.empty) return
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) =>
        String(a.plano || '').localeCompare(String(b.plano || ''))
      ))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [tipo])

  // Modelos vigentes según el último Excel importado — igual que en la
  // ficha de la pieza (V276), un modelo dado de baja sigue con sus
  // registros guardados pero no debe listarse acá para no confundir.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'tuberia_meta'), snap => {
      setActiveModelos(snap.exists() ? new Set((snap.data().modelos || []).map(m => m.nombre)) : new Set())
    }, () => setActiveModelos(new Set()))
    return unsub
  }, [])

  const vigentes = !activeModelos ? items : items.filter(it => activeModelos.has(it.modelo))

  // Opciones de los desplegables, encadenadas: Capacidad se limita al Modelo
  // elegido, Línea se limita a Modelo+Capacidad — mismo criterio que el
  // resto de la app (Soldadura, "Nuevo visualizador") para no ofrecer
  // combinaciones que no existen.
  const modelosOpts = [...new Set(vigentes.map(it => it.modelo).filter(Boolean))].sort()
  const capsOpts = [...new Set(
    vigentes.filter(it => !fModelo || it.modelo === fModelo).map(it => it.cap).filter(Boolean)
  )].sort()
  const lineasOpts = [...new Set(
    vigentes.filter(it => (!fModelo || it.modelo === fModelo) && (!fCap || it.cap === fCap)).map(it => it.lineaProd).filter(Boolean)
  )].sort()

  const porFiltros = vigentes.filter(it =>
    (!fModelo || it.modelo === fModelo) &&
    (!fCap || it.cap === fCap) &&
    (!fLinea || it.lineaProd === fLinea)
  )

  const filtered = !search ? porFiltros : porFiltros.filter(it => {
    const s = search.toLowerCase()
    return (
      (it.plano && String(it.plano).toLowerCase().includes(s)) ||
      (it.titulo && it.titulo.toLowerCase().includes(s)) ||
      (it.codigoCano && it.codigoCano.toLowerCase().includes(s)) ||
      (it.descripSAP && it.descripSAP.toLowerCase().includes(s)) ||
      (it.modelo && it.modelo.toLowerCase().includes(s))
    )
  })

  return (
    <div className="app">
      <Header title={`${cfg.label} (${vigentes.length})`} back="/tuberias" />

      <div className="search-bar" style={{ position: 'relative', top: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por plano, modelo, código..." />
      </div>

      <div className="content">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <select
            value={fModelo}
            onChange={e => { setFModelo(e.target.value); setFCap(''); setFLinea('') }}
            style={{ flex: '1 1 140px', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
          >
            <option value="">Modelo (todos)</option>
            {modelosOpts.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={fCap}
            onChange={e => { setFCap(e.target.value); setFLinea('') }}
            disabled={!fModelo}
            style={{ flex: '1 1 120px', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
          >
            <option value="">Capacidad (todas)</option>
            {capsOpts.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={fLinea}
            onChange={e => setFLinea(e.target.value)}
            style={{ flex: '1 1 120px', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}
          >
            <option value="">Línea (todas)</option>
            {lineasOpts.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {(fModelo || fCap || fLinea) && (
            <button
              onClick={() => { setFModelo(''); setFCap(''); setFLinea('') }}
              style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#eee', color: '#555', fontSize: 13, cursor: 'pointer' }}
            >
              × Limpiar
            </button>
          )}
        </div>

        {(fModelo || fCap || fLinea) && !loading && (
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '-6px 0 10px', fontWeight: 600 }}>
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </p>
        )}

        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="empty"><div className="ei">🔍</div><p>Sin resultados</p></div>
        )}
        {filtered.map(it => {
          const cod = codigoLabel(it)
          return (
            <div key={it.id} className="card" onClick={() => {
              const mk = encodeURIComponent(it.modelo || '')
              const cap = encodeURIComponent(it.cap || '')
              const sub = encodeURIComponent(it.codIntSubcParcial || '-')
              navigate(`/tuberias/${mk}/${cap}/${sub}/${it.id}`, { state: { back: `/tuberias/tipo/${tipo}` } })
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: cfg.bg, color: cfg.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon />
              </div>
              <div className="info">
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>
                  {it.plano ? `Plano: ${it.plano}` : (it.codigoCano || '—')}
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                  {[it.modelo, it.cap].filter(Boolean).join(' | ') || '—'}
                </p>
                <p style={{ fontSize: 12, marginTop: 2 }}>
                  {it.titulo && <span style={{ color: '#444' }}>{it.titulo}</span>}
                  {it.titulo && cod && '  '}
                  {cod && (
                    <span style={{ color: '#1565c0', fontWeight: 600 }}>{cod.label}: {cod.code}</span>
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
