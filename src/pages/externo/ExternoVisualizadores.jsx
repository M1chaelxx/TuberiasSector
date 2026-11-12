import { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import PdfViewerModal from '../../components/PdfViewerModal'

const selectStyle = {
  flex: 1, padding: '9px 10px', borderRadius: 8,
  border: '1.5px solid #e0e0e0', fontSize: 14, background: '#fff', outline: 'none',
}

// Solo lectura para el perfil Externo: elegís Modelo + Capacidad y ves los
// visualizadores (PDFs de montaje) cargados para esa capacidad, sin pasar
// por el catálogo de subconjuntos.
export default function ExternoVisualizadores() {
  const [visualizadores, setVisualizadores] = useState([])
  const [loading, setLoading] = useState(true)
  const [modeloSel, setModeloSel] = useState('')
  const [capSel, setCapSel] = useState('')
  const [pdfModal, setPdfModal] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'soldadura_visualizadores'), snap => {
      setVisualizadores(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  const modelosDisponibles = [...new Set(
    visualizadores.flatMap(v => (v.targets || []).map(t => t.modelo))
  )].sort()

  const capsDisponibles = [...new Set(
    visualizadores
      .flatMap(v => v.targets || [])
      .filter(t => t.modelo === modeloSel)
      .map(t => t.cap)
  )].sort()

  const resultados = (!modeloSel || !capSel) ? [] : visualizadores
    .flatMap(v => (v.targets || [])
      .filter(t => t.modelo === modeloSel && t.cap === capSel)
      .map(t => ({ vis: v, target: t }))
    )

  function handleModeloChange(m) {
    setModeloSel(m)
    setCapSel('')
  }

  return (
    <div className="app">
      <Header title="Visualizadores" back="/" />

      <div style={{ padding: '10px 12px 6px', display: 'flex', gap: 8 }}>
        <select value={modeloSel} onChange={e => handleModeloChange(e.target.value)} style={selectStyle}>
          <option value="">— Modelo —</option>
          {modelosDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={capSel} onChange={e => setCapSel(e.target.value)} disabled={!modeloSel} style={{ ...selectStyle, opacity: modeloSel ? 1 : 0.45 }}>
          <option value="">— Cap —</option>
          {capsDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="content">
        {loading && <div className="spinner"><div className="spin" /></div>}

        {!loading && (!modeloSel || !capSel) && (
          <div className="empty" style={{ paddingTop: 40 }}>
            <div className="ei">📎</div>
            <p>Elegí un modelo y una capacidad</p>
          </div>
        )}

        {!loading && modeloSel && capSel && resultados.length === 0 && (
          <div className="empty" style={{ paddingTop: 40 }}>
            <div className="ei">🔍</div>
            <p>Sin visualizadores cargados para esta capacidad</p>
          </div>
        )}

        {resultados.map(({ vis, target }, i) => (
          <div key={`${vis.id}-${i}`} className="card" onClick={() => setPdfModal(vis.url)}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: '#ffebee', color: '#c62828',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>📄</div>
            <div className="info">
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>{vis.nombre} — {target.desc}</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{target.codigo.replace('||P', '')}</p>
            </div>
            <div className="arrow">↗</div>
          </div>
        ))}
      </div>

      <PdfViewerModal url={pdfModal} onClose={() => setPdfModal(null)} />
    </div>
  )
}
