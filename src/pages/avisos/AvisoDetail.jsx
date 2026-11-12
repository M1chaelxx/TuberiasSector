import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, updateDoc, deleteDoc, arrayUnion } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import PhotoGrid from '../../components/PhotoGrid'
import { useAuth } from '../../context/AuthContext'

export default function AvisoDetail() {
  const { avisoId } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const [aviso, setAviso] = useState(null)
  const [loading, setLoading] = useState(true)
  const [comentario, setComentario] = useState('')
  const [addingComment, setAddingComment] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [closeComment, setCloseComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(doc(db,'avisos',avisoId), snap => {
      if (snap.exists()) { const d = {id:snap.id,...snap.data()}; setAviso(d); setEditForm(d) }
      setLoading(false)
    }, ()=>setLoading(false))
    return unsub
  }, [avisoId])

  function fechaStr(ts) {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})
  }

  function getPrioridad(a) {
    if (a.prioridad) return a.prioridad
    if (a.estado === 'urgente') return 'urgente'
    return 'normal'
  }

  async function addComment() {
    if (!comentario.trim()) return
    setAddingComment(true)
    await updateDoc(doc(db,'avisos',avisoId), {
      comentarios: arrayUnion({
        texto: comentario.trim(),
        usuario: user?.display || '',
        fecha: new Date().toISOString()
      })
    })
    setComentario('')
    setAddingComment(false)
  }

  async function saveEdit() {
    setSaving(true)
    const newPrioridad = editForm.prioridad || getPrioridad(editForm)
    await updateDoc(doc(db,'avisos',avisoId), {
      titulo: editForm.titulo,
      descripcion: editForm.descripcion,
      prioridad: newPrioridad,
      puesto: editForm.puesto,
    })
    setShowEdit(false)
    setSaving(false)
  }

  async function closeAviso() {
    if (!closeComment.trim()) { alert('Explicá cómo se resolvió antes de cerrar'); return }
    setSaving(true)
    await updateDoc(doc(db,'avisos',avisoId), {
      estado: 'hecho',
      cerradoPor: user?.display || '',
      cerradoEn: new Date().toISOString(),
      resolvedBy: user?.display || '',
      resolvedAt: new Date().toISOString(),
      cierreComentario: closeComment.trim(),
      comentarios: arrayUnion({
        texto: closeComment.trim(),
        usuario: user?.display || '',
        fecha: new Date().toISOString(),
        tipo: 'cierre'
      })
    })
    setShowClose(false)
    setSaving(false)
  }

  async function reopenAviso() {
    await updateDoc(doc(db,'avisos',avisoId), { estado: 'pendiente', cerradoPor: null, resolvedBy: null, resolvedAt: null })
  }

  async function deleteAviso() {
    if (!confirm('¿Eliminar este aviso permanentemente?')) return
    await deleteDoc(doc(db,'avisos',avisoId))
    navigate('/avisos')
  }

  async function updatePhotos(photos) {
    await updateDoc(doc(db,'avisos',avisoId), { fotos: photos })
  }

  if (loading) return <div className="spinner"><div className="spin"/></div>
  if (!aviso) return <div className="empty"><p>Aviso no encontrado</p></div>

  const PR = {
    normal:   { label: 'Normal',   color: '#1565c0', bg: '#1565c0' },
    atencion: { label: 'Atención', color: '#f9a825', bg: '#f9a825' },
    alta:     { label: 'Alta',     color: '#e65100', bg: '#e65100' },
    urgente:  { label: 'Urgente',  color: '#d32f2f', bg: '#d32f2f' },
  }
  const isRealizado = aviso.estado === 'realizado' || aviso.estado === 'hecho' || !!aviso.resolvedAt
  const prioridad = getPrioridad(aviso)
  const pr = PR[prioridad] || PR.normal

  return (
    <div className="app">
      <Header title={aviso.titulo} back="/avisos"
        actions={
          <div style={{display:'flex',gap:4}}>
            <button className="icon-btn" onClick={()=>setShowEdit(true)}>✏️</button>
            {isAdmin && <button className="icon-btn" onClick={deleteAviso} style={{fontSize:18}}>🗑️</button>}
          </div>
        }
      />

      <div style={{background: isRealizado ? 'var(--success)' : pr.bg, color:'#fff',padding:'8px 16px',fontSize:13,fontWeight:600}}>
        {isRealizado ? '✅ REALIZADO' : `${prioridad === 'urgente' ? '🔴' : prioridad === 'alta' ? '🟠' : prioridad === 'atencion' ? '🟡' : '🔵'} ${pr.label.toUpperCase()}`}
        {aviso.puesto && ` · ${aviso.puesto}`}
      </div>

      <div className="content">
        <div className="detail-section">
          <div className="section-header">📋 Información</div>
          <div className="field-row"><span className="label">Creado por</span><span className="value">{aviso.creadoPor}</span></div>
          <div className="field-row"><span className="label">Fecha</span><span className="value">{fechaStr(aviso.creadoEn)}</span></div>
          {aviso.puesto && <div className="field-row"><span className="label">Puesto</span><span className="value">{aviso.puesto}</span></div>}
          {isRealizado && <div className="field-row"><span className="label">Cerrado por</span><span className="value">{aviso.cerradoPor}</span></div>}
          {aviso.descripcion && (
            <div style={{padding:'12px 16px',fontSize:14,lineHeight:1.6,color:'var(--text)',borderTop:'1px solid #f0f0f0'}}>
              {aviso.descripcion}
            </div>
          )}
        </div>

        {/* Fotos */}
        {(aviso.fotos?.length > 0 || !isRealizado) && (
          <div className="detail-section">
            <div className="section-header">📷 Fotos</div>
            <PhotoGrid photos={aviso.fotos||[]} folder="avisos_fotos" onUpdate={updatePhotos} canEdit={!isRealizado} />
          </div>
        )}

        {/* Comentarios */}
        <div className="detail-section">
          <div className="section-header">💬 Comentarios ({aviso.comentarios?.length || 0})</div>
          {(aviso.comentarios||[]).length === 0 && (
            <div style={{padding:'16px',fontSize:13,color:'var(--text-secondary)'}}>Sin comentarios aún</div>
          )}
          <div style={{padding:'8px 12px'}}>
            {(aviso.comentarios||[]).map((c,i) => (
              <div key={i} className="comment-item"
                style={c.tipo === 'cierre' ? {background:'#e8f5e9',border:'1px solid #a5d6a7'} : {}}>
                <div className="cm-head">
                  <span>{c.tipo==='cierre'?'✅ ':''}{c.usuario}</span>
                  <span>{new Date(c.fecha).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})}</span>
                </div>
                <div className="cm-body">{c.texto}</div>
              </div>
            ))}
          </div>

          {!isRealizado && (
            <div style={{padding:'8px 12px 12px',display:'flex',gap:8}}>
              <input value={comentario} onChange={e=>setComentario(e.target.value)}
                placeholder="Agregar comentario..." onKeyDown={e=>e.key==='Enter'&&addComment()}
                style={{flex:1,border:'1px solid var(--border)',borderRadius:8,padding:'8px 12px',fontSize:14,outline:'none'}} />
              <button className="btn btn-primary btn-sm" onClick={addComment} disabled={addingComment||!comentario.trim()}>
                {addingComment ? '...' : 'Enviar'}
              </button>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="actions-bar">
          {!isRealizado && (
            <button className="btn btn-success" onClick={()=>setShowClose(true)}>✅ Marcar como realizado</button>
          )}
          {isRealizado && (
            <button className="btn btn-outline btn-sm" onClick={reopenAviso}>↩ Reabrir aviso</button>
          )}
        </div>
      </div>

      {/* Modal editar */}
      {showEdit && (
        <div className="modal-overlay" onClick={()=>setShowEdit(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-drag"/>
            <h2>Editar aviso</h2>
            <div className="modal-field">
              <label>Prioridad</label>
              <select value={editForm.prioridad || getPrioridad(editForm)} onChange={e=>setEditForm({...editForm,prioridad:e.target.value})}>
                <option value="normal">🔵 Normal</option>
                <option value="atencion">🟡 Atención</option>
                <option value="alta">🟠 Alta</option>
                <option value="urgente">🔴 Urgente</option>
              </select>
            </div>
            <div className="modal-field">
              <label>Título</label>
              <input value={editForm.titulo} onChange={e=>setEditForm({...editForm,titulo:e.target.value})} />
            </div>
            <div className="modal-field">
              <label>Descripción</label>
              <textarea value={editForm.descripcion} onChange={e=>setEditForm({...editForm,descripcion:e.target.value})} />
            </div>
            <div className="modal-field">
              <label>Puesto / Máquina</label>
              <input value={editForm.puesto} onChange={e=>setEditForm({...editForm,puesto:e.target.value})} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-grey" onClick={()=>setShowEdit(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cerrar */}
      {showClose && (
        <div className="modal-overlay" onClick={()=>setShowClose(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-drag"/>
            <h2>✅ Cerrar aviso</h2>
            <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:14,lineHeight:1.5}}>
              Agregá un comentario de cierre explicando cómo se resolvió (opcional).
            </p>
            <div className="modal-field">
              <label>Comentario de cierre</label>
              <textarea value={closeComment} onChange={e=>setCloseComment(e.target.value)}
                placeholder="¿Cómo se resolvió? (obligatorio)" rows={3} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-grey" onClick={()=>setShowClose(false)}>Cancelar</button>
              <button className="btn btn-success" onClick={closeAviso} disabled={saving || !closeComment.trim()}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
