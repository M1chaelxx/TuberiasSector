import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import PhotoGrid from '../../components/PhotoGrid'

function FieldRow({ label, value }) {
  if (!value) return null
  return (
    <div className="field-row">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  )
}

// Ficha de solo lectura del subconjunto (info + foto), sin tiempos ni
// mediciones — el perfil Externo no debe verlos en ningún punto del flujo.
export default function ExternoSubconjuntoDetail() {
  const { modeloName, modeloId, codigo } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const decodedId = decodeURIComponent(modeloId)

  const [modelo, setModelo] = useState(null)
  const [fotosDoc, setFotosDoc] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const u1 = onSnapshot(doc(db, 'soldadura_modelos', decodedId), snap => {
      if (snap.exists()) setModelo({ id: snap.id, ...snap.data() })
      setLoading(false)
    }, () => setLoading(false))
    const u2 = onSnapshot(doc(db, 'soldadura_tiempos', decodedId), snap => {
      setFotosDoc(snap.exists() ? snap.data() : {})
    }, () => {})
    return () => { u1(); u2() }
  }, [decodedId])

  if (loading) return <div className="app"><div className="spinner"><div className="spin" /></div></div>
  if (!modelo) return <div className="app"><div className="empty"><p>Modelo no encontrado</p></div></div>

  const { forcePartial, partialParentCode } = location.state || {}

  let subconj = null
  let isPartial = false
  let parentSubconj = null

  if (!forcePartial) {
    for (const s of (modelo.subconjuntos || [])) {
      if ((s.codCompleto || s.codigo) === codigo) { subconj = s; break }
    }
  }
  if (!subconj) {
    for (const s of (modelo.subconjuntos || [])) {
      if (partialParentCode && (s.codCompleto || s.codigo) !== partialParentCode) continue
      const found = (s.parciales || []).find(p => p.codParcial === codigo)
      if (found) { subconj = found; parentSubconj = s; isPartial = true; break }
    }
  }
  if (!subconj) return <div className="app"><div className="empty"><p>Subconjunto no encontrado</p></div></div>

  const storageKey = (isPartial && partialParentCode && partialParentCode === codigo)
    ? `${codigo}||P`
    : codigo
  const photos = fotosDoc[storageKey]?._fotos || []

  const backUrl = isPartial
    ? `/externo/modelos/${encodeURIComponent(modeloName)}/${encodeURIComponent(decodedId)}/${parentSubconj?.codCompleto || ''}`
    : `/externo/modelos/${encodeURIComponent(modeloName)}/${encodeURIComponent(decodedId)}`
  const title = isPartial
    ? (subconj?.descSubc || codigo)
    : (subconj?.descGral || subconj?.titulo || codigo)

  const parciales = (!isPartial && subconj?.parciales?.length > 0) ? subconj.parciales : []

  // Código con el que se busca en Tuberías (tuberia_bd): el subconjunto
  // Completo matchea por codIntSubcCompleto, un Parcial por codIntSubcParcial.
  const matchField = isPartial ? 'codIntSubcParcial' : 'codIntSubcCompleto'
  const piezasPath = `/externo/piezas/${encodeURIComponent(decodedId)}/${encodeURIComponent(modelo.modelo)}/${encodeURIComponent(modelo.cap)}/${matchField}/${encodeURIComponent(codigo)}`

  return (
    <div className="app">
      <Header title={title} back={backUrl} />

      <div className="content" style={{ paddingTop: 0 }}>

        <div className="detail-section" style={{ marginBottom: 0 }}>
          <div className="section-header">🔧 Información General</div>
          <FieldRow label="Marca" value={modelo.marca} />
          <FieldRow label="Modelo" value={modelo.modelo} />
          <FieldRow label="Capacidad" value={modelo.cap} />
          <FieldRow label="Línea" value={subconj?.linea} />
          {isPartial ? (
            <>
              <FieldRow label="Cod. Parcial" value={subconj?.codParcial} />
              <FieldRow label="Descripción" value={subconj?.descSubc} />
            </>
          ) : (
            <>
              <FieldRow label="Cod. Completo" value={subconj?.codCompleto || subconj?.codigo} />
              <FieldRow label="Descripción" value={subconj?.descGral || subconj?.titulo} />
            </>
          )}
        </div>

        <div className="detail-section">
          <div className="section-header">📷 Fotos</div>
          <PhotoGrid photos={photos} canEdit={false} />
        </div>

        {parciales.length > 0 && (
          <div className="detail-section">
            <div className="section-header">🔩 Sub-componentes ({parciales.length})</div>
            {parciales.map(p => (
              <div key={p.codParcial} className="card" style={{ margin: '0 8px 8px' }}
                onClick={() => navigate(
                  `/externo/modelos/${encodeURIComponent(modeloName)}/${encodeURIComponent(decodedId)}/${p.codParcial}`,
                  { state: { forcePartial: true, partialParentCode: codigo } }
                )}>
                <div className="info">
                  <h3 style={{ fontSize: 14, fontWeight: 600 }}>{p.descSubc || p.codParcial}</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{p.codParcial}</p>
                </div>
                <div className="arrow">›</div>
              </div>
            ))}
          </div>
        )}

        {/* Sin sección de tiempos/mediciones — no aplica para este perfil */}

        <div className="card" style={{ background: '#e8f5e9', margin: '4px 8px 12px' }}
          onClick={() => navigate(piezasPath)}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: '#c8e6c9', color: '#2e7d32',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>🔩</div>
          <div className="info">
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#2e7d32' }}>Ver piezas de Tuberías</h3>
            <p style={{ fontSize: 12, color: '#4c8c53', marginTop: 1 }}>Planos y especificaciones de este subconjunto</p>
          </div>
          <div className="arrow" style={{ color: '#2e7d32' }}>›</div>
        </div>

      </div>
    </div>
  )
}
