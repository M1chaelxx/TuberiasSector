import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { doc, onSnapshot, setDoc, getDoc, getDocs, collection, query, where } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import { compressImage } from '../../utils/compressImage'

const PIEZA_STYLE = {
  PP: { color: '#e65100', bg: '#fff3e0', label: 'PP — Plano Plantilla' },
  SP: { color: '#1565c0', bg: '#e3f2fd', label: 'SP — Pieza Exportación' },
  AD: { color: '#2e7d32', bg: '#e8f5e9', label: 'AD — Agregado' },
  C:  { color: '#b71c1c', bg: '#ffebee', label: 'C — Consumible' },
  T:  { color: '#616161', bg: '#f5f5f5', label: 'T — Tornillo' },
}

const PUESTOS = ['OMS-1', 'OMS-2', 'TJ-1', 'TJ-2', 'TJ-3', 'TJ-4', 'BLM', 'CC', 'CTDA']

export default function TuberiasPiezaDetail() {
  const { modeloKey, cap, subcKey, docId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { isIngenieria, isAdmin, isExterno } = useAuth()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)
  const [planoTiempos, setPlanoTiempos] = useState({})
  const [imgModal, setImgModal] = useState(null)
  const [spSiblingIds, setSpSiblingIds] = useState([])
  const [spModelos, setSpModelos] = useState([])
  const [activeModelos, setActiveModelos] = useState(null) // null = todavía no cargó
  const cameraRef = useRef()
  const galleryRef = useRef()

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'tuberia_bd', docId), snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() }
        setItem(d)
        setEditData(d)
      }
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [docId])

  // Modelos vigentes según el último Excel importado — un modelo dejado de
  // lado (reemplazado, ya no cargado en el Excel) sigue con sus registros en
  // la base para no perder fotos/tiempos compartidos, pero no debe listarse
  // como "modelo que lo utiliza" porque ya no está activo en la app.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'tuberia_meta'), snap => {
      setActiveModelos(snap.exists() ? new Set((snap.data().modelos || []).map(m => m.nombre)) : new Set())
    }, () => setActiveModelos(new Set()))
    return unsub
  }, [])

  // Piezas compartidas entre modelos: SP/AD por código caño (el mismo caño
  // estándar reutilizado en varios equipos), PP por número de plano Y código
  // caño a la vez (los dos siempre coinciden cuando es realmente la misma
  // plantilla física reutilizada — exigir los dos evita que dos PP de
  // modelos distintos se crucen por una coincidencia de numeración).
  useEffect(() => {
    const isSPAD = item?.pieza === 'SP' || item?.pieza === 'AD'
    const isPP = item?.pieza === 'PP'
    if (!isSPAD && !isPP) return
    if (isSPAD && !item.codigoCano) return
    if (isPP && (!item.plano || !item.codigoCano)) return
    // SP y AD emparejan entre sí (cualquiera de los dos tipos, mismo código
    // caño); PP solo empareja con otra PP que coincida en plano Y código caño.
    const clauses = isSPAD
      ? [where('codigoCano', '==', item.codigoCano), where('pieza', 'in', ['SP', 'AD'])]
      : [where('plano', '==', item.plano), where('codigoCano', '==', item.codigoCano), where('pieza', '==', 'PP')]
    getDocs(query(collection(db, 'tuberia_bd'), ...clauses))
      .then(snap => {
        const ids = []
        const modelos = []
        snap.docs.forEach(d => {
          // La foto se sigue propagando a TODOS los hermanos, incluso de un
          // modelo dado de baja (por si se reactiva más adelante no pierde
          // la sincronización) — solo se filtra lo que se muestra en pantalla.
          if (d.id !== docId) ids.push(d.id)
          const data = d.data()
          if (activeModelos && !activeModelos.has(data.modelo)) return
          const label = [data.modelo, data.cap].filter(Boolean).join(' ')
          if (label && !modelos.includes(label)) modelos.push(label)
        })
        setSpSiblingIds(ids)
        setSpModelos(modelos.sort())
      })
  }, [item?.pieza, item?.codigoCano, item?.plano, docId, activeModelos])

  // Lightweight listener just for the mediciones count badge
  useEffect(() => {
    if (!item?.plano) return
    const unsub = onSnapshot(doc(db, 'tuberia_tiempos', String(item.plano)), snap => {
      setPlanoTiempos(snap.exists() ? snap.data() : {})
    }, () => {})
    return unsub
  }, [item?.plano])

  async function saveEdit() {
    setSaving(true)
    try {
      const { id, ...data } = editData
      await setDoc(doc(db, 'tuberia_bd', docId), data, { merge: true })
      setEditing(false)
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    }
    setSaving(false)
  }

  async function handlePhoto(e) {
    const files = [...(e.target.files || [])]
    if (!files.length) return
    try {
      for (const file of files) {
        const toSend = await compressImage(file)
        const fd = new FormData()
        fd.append('file', toSend)
        fd.append('upload_preset', 'tuberia_fotos')
        fd.append('folder', `tuberia_fotos/${docId}`)
        const res = await fetch('https://api.cloudinary.com/v1_1/vgia9y4h/image/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!data.secure_url) throw new Error(data.error?.message || 'Error Cloudinary')
        const newPhoto = { url: data.secure_url, public_id: data.public_id, nombre: file.name }
        const current = item.fotos || []
        await setDoc(doc(db, 'tuberia_bd', docId), {
          fotos: [...current, newPhoto]
        }, { merge: true })
        // SP/AD: propagate to all sibling docs sharing the same codigoCano
        for (const sibId of spSiblingIds) {
          const sibRef = doc(db, 'tuberia_bd', sibId)
          const sibDoc = await getDoc(sibRef)
          const sibFotos = sibDoc.exists() ? (sibDoc.data().fotos || []) : []
          if (!sibFotos.find(f => f.url === newPhoto.url)) {
            await setDoc(sibRef, { fotos: [...sibFotos, newPhoto] }, { merge: true })
          }
        }
      }
    } catch (e) {
      alert('Error al subir foto: ' + e.message)
    }
    if (e.target) e.target.value = ''
  }

  async function deletePhoto(idx) {
    if (!confirm('¿Eliminar esta foto?')) return
    const fotos = [...(item.fotos || [])]
    const removed = fotos[idx]
    fotos.splice(idx, 1)
    await setDoc(doc(db, 'tuberia_bd', docId), { fotos }, { merge: true })
    // SP: remove from all sibling docs too
    if (removed && spSiblingIds.length > 0) {
      for (const sibId of spSiblingIds) {
        const sibRef = doc(db, 'tuberia_bd', sibId)
        const sibDoc = await getDoc(sibRef)
        if (!sibDoc.exists()) continue
        const sibFotos = (sibDoc.data().fotos || []).filter(f => f.url !== removed.url)
        await setDoc(sibRef, { fotos: sibFotos }, { merge: true })
      }
    }
  }

  const defaultBack = `/tuberias/${encodeURIComponent(modeloKey)}/${encodeURIComponent(cap)}/${encodeURIComponent(subcKey)}`
  const backPath = location.state?.back || defaultBack

  if (loading) return <div className="app"><div className="spinner"><div className="spin" /></div></div>
  if (!item) return (
    <div className="app">
      <Header title="No encontrado" back={backPath} />
    </div>
  )

  const st = PIEZA_STYLE[item.pieza] || PIEZA_STYLE.T
  const tiemposPath = `/tuberias/${encodeURIComponent(modeloKey)}/${encodeURIComponent(cap)}/${encodeURIComponent(subcKey)}/${docId}/tiempos`
  const totalMeds = PUESTOS.reduce((a, p) => a + (planoTiempos[p]?.mediciones?.length || 0), 0)
  const puestosConDatos = PUESTOS.filter(p => (planoTiempos[p]?.mediciones?.length || 0) > 0).length

  const field = (label, key, type = 'text') => {
    const val = item[key]
    if (!editing) {
      return (
        <div className="field-row">
          <span className="label">{label}</span>
          <span className="value">{val !== null && val !== undefined && val !== '' ? String(val) : '—'}</span>
        </div>
      )
    }
    return (
      <div className="field-row">
        <span className="label">{label}</span>
        <input type={type} value={editData[key] ?? ''} onChange={e => setEditData(p => ({ ...p, [key]: e.target.value }))} />
      </div>
    )
  }

  return (
    <div className="app">
      <Header title={item.plano ? `Plano ${item.plano}` : (item.codigoCano || 'Detalle')} back={backPath} />

      <div style={{ background: st.bg, borderLeft: `4px solid ${st.color}`, padding: '12px 16px', margin: '8px 12px', borderRadius: 10 }}>
        <div style={{ color: st.color, fontWeight: 700, fontSize: 15 }}>{st.label}</div>
        {item.titulo && <div style={{ fontSize: 13, color: '#444', marginTop: 2 }}>{item.titulo}</div>}
      </div>

      <div className="content" style={{ paddingTop: 4 }}>

        <div className="detail-section">
          <div className="section-header">🔖 Identificación</div>
          {field('Plano', 'plano')}
          {field('Cod. Caño', 'codigoCano')}
          {field('Cod. Cobre', 'codCobre')}
          {field('Cod. Alternativo', 'codigoAlternativo')}
          {field('Cod. Cobre Reemplazo', 'codCobreReemplazo')}
          {field('Código SAP', 'descripSAP')}
          {field('Plano Int. Parcial', 'codIntSubcParcial')}
          {field('Plano Int. Completo', 'codIntSubcCompleto')}
        </div>

        <div className="detail-section">
          <div className="section-header">📋 Info General</div>
          {field('Modelo', 'modelo')}
          {field('Capacidad', 'cap')}
          {field('Línea', 'linea')}
          {field('Línea Prod.', 'lineaProd')}
          {field('Categoría', 'categoria')}
          {field('Tipo', 'tipo')}
          {field('Cantidad', 'cant', 'number')}
          {field('Unidad', 'unidad')}
          {field('Descripción Gral.', 'descripcionGral')}
          {field('Desc. Subc. Gral.', 'descSubcGral')}
        </div>

        {(item.pieza === 'PP' || item.pieza === 'SP' || item.largo || item.diametro || item.espesor || item.radio) && (
          <div className="detail-section">
            <div className="section-header">📐 Dimensiones</div>
            {field('Largo (mm)', 'largo', 'number')}
            {field('Largo Cal.', 'largoCal')}
            {field('Diámetro (mm)', 'diametro', 'number')}
            {field('Espesor (mm)', 'espesor', 'number')}
            {field('Radio (mm)', 'radio', 'number')}
            {field('Compa', 'compa')}
          </div>
        )}

        {/* SP/AD/PP: show which models use this piece */}
        {(item.pieza === 'SP' || item.pieza === 'AD' || item.pieza === 'PP') && spModelos.length > 0 && (
          <div className="detail-section">
            <div className="section-header">📦 Modelos que lo utilizan ({spModelos.length})</div>
            {spModelos.map(m => (
              <div key={m} className="field-row">
                <span className="value" style={{ fontWeight: 600 }}>{m}</span>
              </div>
            ))}
            {spSiblingIds.length > 0 && (
              <div style={{ padding: '4px 16px 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
                Las fotos se sincronizan en todos los modelos
              </div>
            )}
          </div>
        )}

        {isIngenieria && (
          <div style={{ padding: '0 0 12px', display: 'flex', gap: 8 }}>
            {!editing ? (
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>✏️ Editar</button>
            ) : (
              <>
                <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
                  {saving ? 'Guardando...' : '💾 Guardar'}
                </button>
                <button className="btn btn-grey btn-sm" onClick={() => { setEditing(false); setEditData(item) }}>Cancelar</button>
              </>
            )}
          </div>
        )}

        {/* ── TIEMPOS (nav card, above fotos) ── */}
        {!isExterno && item.pieza === 'PP' && item.plano && (
          <div className="detail-section" style={{ cursor: 'pointer' }} onClick={() => navigate(tiemposPath, { state: location.state })}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 14 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: totalMeds > 0 ? '#b3e5fc' : '#e0e0e0',
                color: totalMeds > 0 ? '#0277bd' : '#9e9e9e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
              }}>⏱</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Tiempos de Producción</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {totalMeds > 0
                    ? `${totalMeds} medición${totalMeds !== 1 ? 'es' : ''} en ${puestosConDatos} puesto${puestosConDatos !== 1 ? 's' : ''}`
                    : 'Sin mediciones · Tocá para medir'}
                </div>
              </div>
              <div style={{ fontSize: 22, color: '#bbb', fontWeight: 300 }}>›</div>
            </div>
          </div>
        )}

        {/* ── FOTOS ── */}
        <div className="detail-section">
          <div className="section-header">📷 Fotos</div>
          {isAdmin && (
            <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-outline btn-sm" onClick={() => cameraRef.current?.click()}>📷 Cámara</button>
              <button className="btn btn-outline btn-sm" onClick={() => galleryRef.current?.click()}>🖼 Galería</button>
            </div>
          )}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} multiple onChange={handlePhoto} />
          <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} multiple onChange={handlePhoto} />
          {item.fotos && item.fotos.length > 0 ? (
            <div className="photos-grid" style={{ paddingTop: 0 }}>
              {item.fotos.map((f, i) => (
                <div key={i} className="photo-wrapper">
                  <img src={f.url} className="photo-thumb" alt={f.nombre} onClick={() => setImgModal(f.url)} />
                  {isAdmin && (
                    <button className="delete-photo" onClick={() => deletePhoto(i)}>×</button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '8px 16px 16px', color: '#999', fontSize: 13 }}>Sin fotos cargadas</div>
          )}
        </div>

      </div>

      {imgModal && (
        <div className="modal-overlay img-modal" onClick={() => setImgModal(null)}>
          <button className="modal-close-btn" onClick={() => setImgModal(null)}>×</button>
          <img src={imgModal} className="full-img" alt="" />
        </div>
      )}
    </div>
  )
}
