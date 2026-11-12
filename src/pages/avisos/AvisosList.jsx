import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, arrayUnion, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { compressImage } from '../../utils/compressImage'

// Pide a Cloudinary una versión redimensionada/optimizada (menor peso, formato
// moderno) en vez de la foto original completa — insertando la transformación
// en la URL, sin re-subir nada. Si la URL no es de Cloudinary, la devuelve tal cual.
function cldResize(url, transform) {
  if (!url || !url.includes('/upload/')) return url
  return url.replace('/upload/', `/upload/${transform}/`)
}

async function uploadToCloudinary(file) {
  const toSend = await compressImage(file)
  const fd = new FormData()
  fd.append('file', toSend)
  fd.append('upload_preset', 'tuberia_fotos')
  fd.append('folder', 'avisos_fotos')
  const res = await fetch('https://api.cloudinary.com/v1_1/vgia9y4h/image/upload', { method: 'POST', body: fd })
  const data = await res.json()
  if (!data.secure_url) throw new Error(data.error?.message || 'Error Cloudinary')
  return { url: data.secure_url }
}
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import { marcarAvisosVistos } from '../../hooks/useAvisosBadge'

const PR = {
  normal:   { label: 'Normal',   color: '#1565c0', bg: '#e3f2fd', border: '#1565c0', dot: '#1565c0' },
  atencion: { label: 'Atención', color: '#e65100', bg: '#fff8e1', border: '#f9a825', dot: '#f9a825' },
  alta:     { label: 'Alta',     color: '#e65100', bg: '#fff3e0', border: '#e65100', dot: '#e65100' },
  urgente:  { label: 'Urgente',  color: '#b71c1c', bg: '#ffebee', border: '#d32f2f', dot: '#d32f2f' },
}

function getPrioridad(a) {
  if (a.prioridad) return a.prioridad
  if (a.estado === 'urgente') return 'urgente'
  if (a.estado === 'alta') return 'alta'
  if (a.estado === 'atencion') return 'atencion'
  return 'normal'
}

function isRealizado(a) { return a.estado === 'realizado' || a.estado === 'hecho' || !!a.resolvedAt }

function fechaStr(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

// ── Card ─────────────────────────────────────────────────────────────────────
function AvisoCard({ aviso, onUpdate, onDelete }) {
  const { user, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const [comentario, setComentario] = useState('')
  const [sending, setSending] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [closeText, setCloseText] = useState('')
  const [closeFotos, setCloseFotos] = useState([])
  const [closing, setClosing] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [fotosRotas, setFotosRotas] = useState({})
  const closeCamRef = useRef(null)
  const closeGalRef = useRef(null)
  const [editForm, setEditForm] = useState({ titulo: aviso.titulo, descripcion: aviso.descripcion, prioridad: getPrioridad(aviso), puesto: aviso.puesto || '' })
  const [editFotos, setEditFotos] = useState([]) // fotos ya subidas que se conservan ({url})
  const [editFotosNuevas, setEditFotosNuevas] = useState([]) // File objects a subir al guardar
  const [savingEdit, setSavingEdit] = useState(false)
  const editCamRef = useRef(null)
  const editGalRef = useRef(null)

  function abrirEdit() {
    setEditForm({ titulo: aviso.titulo, descripcion: aviso.descripcion, prioridad: getPrioridad(aviso), puesto: aviso.puesto || '' })
    setEditFotos(aviso.fotos || [])
    setEditFotosNuevas([])
    setShowEdit(true)
  }

  function addEditFoto(e) {
    const files = [...(e.target.files || [])].slice(0, 3 - editFotos.length - editFotosNuevas.length)
    setEditFotosNuevas(prev => [...prev, ...files])
    if (e.target) e.target.value = ''
  }

  const realizado = isRealizado(aviso)
  const pr = getPrioridad(aviso)
  const cfg = realizado
    ? { label: 'Realizado', color: '#2e7d32', bg: '#e8f5e9', border: '#2e7d32' }
    : (PR[pr] || PR.normal)

  async function sendComment() {
    if (!comentario.trim()) return
    setSending(true)
    await updateDoc(doc(db, 'avisos', aviso.id), {
      comentarios: arrayUnion({ texto: comentario.trim(), usuario: user?.display || '', fecha: new Date().toISOString() })
    })
    setComentario('')
    setSending(false)
  }

  async function confirmarCierre() {
    if (!closeText.trim()) { alert('Explicá cómo se resolvió antes de cerrar'); return }
    setClosing(true)
    const fotosUrls = []
    for (const f of closeFotos) {
      try { fotosUrls.push(await uploadToCloudinary(f)) } catch {}
    }
    const update = {
      estado: 'hecho',
      cerradoPor: user?.display || '',
      cerradoEn: new Date().toISOString(),
      resolvedBy: user?.display || '',
      resolvedAt: new Date().toISOString(),
      cierreComentario: closeText.trim(),
      comentarios: arrayUnion({ texto: closeText.trim(), usuario: user?.display || '', fecha: new Date().toISOString(), tipo: 'cierre' })
    }
    if (fotosUrls.length > 0) {
      const fotasActuales = aviso.fotos || []
      update.fotos = [...fotasActuales, ...fotosUrls]
    }
    await updateDoc(doc(db, 'avisos', aviso.id), update)
    setShowClose(false)
    setCloseText('')
    setCloseFotos([])
    setClosing(false)
  }

  function addCloseFoto(e) {
    const files = [...(e.target.files || [])].slice(0, 3 - closeFotos.length)
    setCloseFotos(prev => [...prev, ...files].slice(0, 3))
    if (e.target) e.target.value = ''
  }

  async function reabrir() {
    await updateDoc(doc(db, 'avisos', aviso.id), { estado: 'pendiente', cerradoPor: null, resolvedBy: null, resolvedAt: null })
  }

  async function guardarEdit() {
    setSavingEdit(true)
    try {
      const nuevasSubidas = []
      for (const f of editFotosNuevas) {
        try { nuevasSubidas.push(await uploadToCloudinary(f)) } catch {}
      }
      await updateDoc(doc(db, 'avisos', aviso.id), {
        titulo: editForm.titulo,
        descripcion: editForm.descripcion,
        prioridad: editForm.prioridad,
        puesto: editForm.puesto,
        fotos: [...editFotos, ...nuevasSubidas],
      })
      setShowEdit(false)
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    }
    setSavingEdit(false)
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      marginBottom: 8,
      boxShadow: '0 1px 3px #00000014',
      borderLeft: `4px solid ${cfg.border}`,
      overflow: 'hidden',
    }}>
      {/* Card header row */}
      <div style={{ padding: '12px 12px 8px', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* Priority badge */}
            <span style={{
              background: cfg.bg, color: cfg.color,
              border: `1px solid ${cfg.border}`,
              borderRadius: 10, padding: '2px 8px',
              fontSize: 11, fontWeight: 700,
            }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: cfg.border, marginRight: 4, verticalAlign: 'middle' }} />
              {cfg.label.toUpperCase()}
            </span>
            {/* Sector/puesto chip */}
            {aviso.puesto && (
              <span style={{ background: '#fce4ec', color: '#c2185b', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                {aviso.puesto}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: '#9e9e9e' }}>{fechaStr(aviso.creadoEn)}</span>
            <span style={{ fontSize: 16, color: '#9e9e9e', lineHeight: 1 }}>{open ? '▲' : '▼'}</span>
          </div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35, marginBottom: 4 }}>{aviso.titulo}</div>
        {aviso.descripcion && (
          <div style={{ fontSize: 12, color: '#666', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: open ? 'unset' : 2, WebkitBoxOrient: 'vertical', overflow: open ? 'visible' : 'hidden' }}>
            {aviso.descripcion}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 5 }}>
          👤 {aviso.creadoPor || aviso.autor}
          {(aviso.comentarios?.length > 0) && ` · 💬 ${aviso.comentarios.length}`}
        </div>
      </div>

      {/* Expanded content */}
      {open && (
        <div style={{ borderTop: '1px solid #f0f0f0' }} onClick={e => e.stopPropagation()}>
          {/* Fotos */}
          {(aviso.fotos?.length > 0) && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', flexWrap: 'wrap' }}>
              {aviso.fotos.map((f, i) => (
                fotosRotas[i] ? (
                  <div key={i}
                    onClick={() => setFotosRotas(prev => ({ ...prev, [i]: false }))}
                    style={{
                      width: 80, height: 80, borderRadius: 8, cursor: 'pointer',
                      background: '#f5f5f5', border: '1px dashed #ccc', color: '#999',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, textAlign: 'center', padding: 4, gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 16 }}>🖼️</span>
                    <span>No se pudo cargar · tocá para reintentar</span>
                  </div>
                ) : (
                  <img key={i} src={cldResize(f.url, 'w_160,h_160,c_fill,q_auto,f_auto')} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
                    onClick={() => setLightbox(f.url)}
                    onError={() => setFotosRotas(prev => ({ ...prev, [i]: true }))} />
                )
              ))}
            </div>
          )}

          {/* Comentarios */}
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8 }}>
              COMENTARIOS ({aviso.comentarios?.length || 0})
            </div>
            {(aviso.comentarios || []).map((c, i) => (
              <div key={i} style={{
                background: c.tipo === 'cierre' ? '#e8f5e9' : '#f8f9fa',
                borderRadius: 8, padding: '8px 10px', marginBottom: 6,
                border: c.tipo === 'cierre' ? '1px solid #a5d6a7' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9e9e9e', marginBottom: 3 }}>
                  <span style={{ fontWeight: 700 }}>{c.tipo === 'cierre' ? '✅ ' : ''}{c.usuario}</span>
                  <span>{new Date(c.fecha).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
                <div style={{ fontSize: 13 }}>{c.texto}</div>
              </div>
            ))}
            {!realizado && (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendComment()}
                  placeholder="Agregar comentario..."
                  style={{ flex: 1, border: '1px solid #e0e0e0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                />
                <button
                  onClick={sendComment}
                  disabled={sending || !comentario.trim()}
                  style={{ background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: sending || !comentario.trim() ? 0.5 : 1 }}
                >
                  Enviar
                </button>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div style={{ padding: '8px 12px 12px' }}>
            {!realizado && !showClose && (
              <button
                onClick={() => setShowClose(true)}
                style={{ width: '100%', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}
              >
                ✅ Marcar como hecho
              </button>
            )}
            {!realizado && showClose && (
              <div style={{ border: '1.5px solid #2e7d32', borderRadius: 10, padding: 12, marginBottom: 8, background: '#f9fbe7' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2e7d32', marginBottom: 8 }}>✅ Cerrar aviso</div>
                <textarea
                  value={closeText}
                  onChange={e => setCloseText(e.target.value)}
                  placeholder="¿Cómo se resolvió? (obligatorio)"
                  rows={3}
                  style={{ width: '100%', border: '1px solid #c8e6c9', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 11, color: '#666', marginBottom: 8, marginTop: 4 }}>
                  Foto de cierre (opcional) · {closeFotos.length}/3
                </div>
                {closeFotos.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {closeFotos.map((f, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={URL.createObjectURL(f)} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                        <button onClick={() => setCloseFotos(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: -4, right: -4, background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '16px', padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                {closeFotos.length < 3 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <button onClick={() => closeCamRef.current?.click()} style={{ flex: 1, background: '#388e3c', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📷 Cámara</button>
                    <button onClick={() => closeGalRef.current?.click()} style={{ flex: 1, background: '#388e3c', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖼 Galería</button>
                  </div>
                )}
                <input ref={closeCamRef} type="file" accept="image/*" capture="environment" hidden onChange={addCloseFoto} />
                <input ref={closeGalRef} type="file" accept="image/*" multiple hidden onChange={addCloseFoto} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowClose(false); setCloseText(''); setCloseFotos([]) }}
                    style={{ flex: 1, background: '#ef9a9a', color: '#b71c1c', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button onClick={confirmarCierre} disabled={closing || !closeText.trim()}
                    style={{ flex: 1, background: closing || !closeText.trim() ? '#a5d6a7' : '#2e7d32', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {closing ? '...' : '✅ Confirmar cierre'}
                  </button>
                </div>
              </div>
            )}
            {realizado && (
              <button onClick={reabrir} style={{ width: '100%', border: '1.5px solid #1a73e8', color: '#1a73e8', background: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 8 }}>
                ↩ Reabrir aviso
              </button>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={abrirEdit} style={{ background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                ✏️ Editar
              </button>
              {isAdmin && (
                <button onClick={() => { if (confirm('¿Eliminar este aviso?')) onDelete(aviso.id) }}
                  style={{ background: '#d32f2f', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  🗑️
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal editar */}
      {showEdit && (
        <div className="modal-overlay" onClick={() => setShowEdit(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <h2>Editar aviso</h2>
            <div className="modal-field">
              <label>Título</label>
              <input value={editForm.titulo} onChange={e => setEditForm({ ...editForm, titulo: e.target.value })} />
            </div>
            <div className="modal-field">
              <label>Descripción</label>
              <textarea value={editForm.descripcion} onChange={e => setEditForm({ ...editForm, descripcion: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <div className="modal-field" style={{ flex: 1, marginBottom: 0 }}>
                <label>Prioridad</label>
                <select value={editForm.prioridad} onChange={e => setEditForm({ ...editForm, prioridad: e.target.value })}>
                  {Object.entries(PR).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
                </select>
              </div>
              <div className="modal-field" style={{ flex: 1, marginBottom: 0 }}>
                <label>Puesto / Máquina</label>
                <input value={editForm.puesto} onChange={e => setEditForm({ ...editForm, puesto: e.target.value })} placeholder="ej: Tuberías" />
              </div>
            </div>

            <div className="modal-field">
              <label>Fotos · {editFotos.length + editFotosNuevas.length}/3</label>
              {(editFotos.length > 0 || editFotosNuevas.length > 0) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {editFotos.map((f, i) => (
                    <div key={`e${i}`} style={{ position: 'relative' }}>
                      <img src={cldResize(f.url, 'w_120,h_120,c_fill,q_auto,f_auto')} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                      <button type="button" onClick={() => setEditFotos(prev => prev.filter((_, j) => j !== i))}
                        style={{ position: 'absolute', top: -4, right: -4, background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '16px', padding: 0 }}>×</button>
                    </div>
                  ))}
                  {editFotosNuevas.map((f, i) => (
                    <div key={`n${i}`} style={{ position: 'relative' }}>
                      <img src={URL.createObjectURL(f)} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} />
                      <button type="button" onClick={() => setEditFotosNuevas(prev => prev.filter((_, j) => j !== i))}
                        style={{ position: 'absolute', top: -4, right: -4, background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 10, cursor: 'pointer', lineHeight: '16px', padding: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {(editFotos.length + editFotosNuevas.length) < 3 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => editCamRef.current?.click()} style={{ flex: 1, background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📷 Cámara</button>
                  <button type="button" onClick={() => editGalRef.current?.click()} style={{ flex: 1, background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖼 Galería</button>
                </div>
              )}
              <input ref={editCamRef} type="file" accept="image/*" capture="environment" hidden onChange={addEditFoto} />
              <input ref={editGalRef} type="file" accept="image/*" multiple hidden onChange={addEditFoto} />
            </div>

            <div className="modal-actions">
              <button className="btn btn-grey" onClick={() => setShowEdit(false)} disabled={savingEdit}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarEdit} disabled={savingEdit}>{savingEdit ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div className="modal-overlay img-modal" onClick={() => setLightbox(null)}>
          <button className="modal-close-btn" onClick={() => setLightbox(null)}>×</button>
          <img className="full-img" src={cldResize(lightbox, 'w_1200,q_auto,f_auto')} alt="" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function AvisosList() {
  const { user } = useAuth()
  const [avisos, setAvisos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('todos')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ titulo: '', descripcion: '', prioridad: 'normal', puesto: '' })
  const [formFotos, setFormFotos] = useState([]) // File objects
  const [saving, setSaving] = useState(false)
  const camaraRef = useRef(null)
  const galeriaRef = useRef(null)

  useEffect(() => { marcarAvisosVistos() }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'avisos'), snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Sort en JS para tolerar avisos sin creadoEn (app anterior)
      docs.sort((a, b) => {
        const toMs = x => x?.toMillis?.() ?? (x ? new Date(x).getTime() : 0)
        const ta = toMs(a.creadoEn) || toMs(a.fecha)
        const tb = toMs(b.creadoEn) || toMs(b.fecha)
        return tb - ta
      })
      setAvisos(docs)
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  function addFoto(file) {
    if (!file) return
    setFormFotos(prev => prev.length < 3 ? [...prev, file] : prev)
  }

  function resetForm() {
    setForm({ titulo: '', descripcion: '', prioridad: 'normal', puesto: '' })
    setFormFotos([])
    setShowNew(false)
  }

  async function createAviso(e) {
    e.preventDefault()
    if (!form.titulo.trim()) { alert('El título es obligatorio'); return }
    if (!form.descripcion.trim()) { alert('La descripción es obligatoria'); return }
    if (!form.puesto.trim()) { alert('El puesto / máquina es obligatorio'); return }
    setSaving(true)
    try {
      const fotosUrls = []
      for (const f of formFotos) {
        fotosUrls.push(await uploadToCloudinary(f))
      }
      await addDoc(collection(db, 'avisos'), {
        ...form,
        fotos: fotosUrls,
        comentarios: [],
        estado: 'pendiente',
        creadoPor: user?.display || '',
        creadoEn: serverTimestamp(),
      })
      resetForm()
    } catch (err) { alert('Error: ' + err.message) }
    setSaving(false)
  }

  async function deleteAviso(id) {
    await deleteDoc(doc(db, 'avisos', id))
  }

  // Filters
  const pendientes = avisos.filter(a => !isRealizado(a))
  const realizados = avisos.filter(isRealizado)
  const altaUrgente = avisos.filter(a => { const p = getPrioridad(a); return !isRealizado(a) && (p === 'alta' || p === 'urgente') })

  const shown =
    filtro === 'pendientes' ? pendientes :
    filtro === 'realizados' ? realizados :
    filtro === 'alta' ? altaUrgente :
    avisos

  const chips = [
    { id: 'todos',      label: 'Todos',        count: avisos.length },
    { id: 'pendientes', label: 'Pendientes',    count: pendientes.length },
    { id: 'realizados', label: 'Realizados',    count: realizados.length },
    { id: 'alta',       label: 'Alta/Urgente',  count: altaUrgente.length },
  ]

  return (
    <div className="app">
      <Header title="Tablón de Avisos" back="/" />

      {/* Filter chips + new button */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px 6px', gap: 6, background: '#f0f2f5', position: 'sticky', top: 52, zIndex: 50 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }} className="tabs" style={{ padding: 0, margin: 0 }}>
          {chips.map(c => (
            <button key={c.id} onClick={() => setFiltro(c.id)}
              style={{
                border: filtro === c.id ? 'none' : '1.5px solid #e0e0e0',
                background: filtro === c.id ? '#1a73e8' : '#fff',
                color: filtro === c.id ? '#fff' : '#333',
                borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {c.label} ({c.count})
            </button>
          ))}
        </div>
        <button onClick={() => setShowNew(o => !o)} style={{
          background: '#1a73e8', color: '#fff', border: 'none',
          borderRadius: 20, padding: '7px 14px', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          + Nuevo aviso
        </button>
      </div>

      <div className="content" style={{ paddingTop: 8 }}>

        {/* Inline create form */}
        {showNew && (
          <div style={{ border: '2px dashed #1a73e8', borderRadius: 12, padding: '14px 14px 10px', marginBottom: 12, background: '#fff' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a73e8', marginBottom: 12 }}>+ Nuevo aviso</div>
            <form onSubmit={createAviso}>
              <input
                value={form.titulo}
                onChange={e => setForm({ ...form, titulo: e.target.value })}
                placeholder="Título del aviso *"
                style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', marginBottom: 8, fontFamily: 'inherit' }}
              />
              <textarea
                value={form.descripcion}
                onChange={e => setForm({ ...form, descripcion: e.target.value })}
                placeholder="Descripción – qué hay que hacer, puesto afectado, etc."
                rows={3}
                style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', marginBottom: 8, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <select
                    value={form.prioridad}
                    onChange={e => setForm({ ...form, prioridad: e.target.value })}
                    style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', background: '#fff', fontFamily: 'inherit' }}
                  >
                    {Object.entries(PR).map(([id, p]) => (
                      <option key={id} value={id}>
                        {id === 'normal' ? '🔵' : id === 'atencion' ? '🟡' : id === 'alta' ? '🟠' : '🔴'} {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    value={form.puesto}
                    onChange={e => setForm({ ...form, puesto: e.target.value })}
                    placeholder="Puesto / Máquina"
                    style={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                  />
                </div>
              </div>

              {/* Fotos */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6 }}>
                  FOTOS ({formFotos.length}/3)
                </div>
                {formFotos.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {formFotos.map((f, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <img src={URL.createObjectURL(f)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                        <button type="button" onClick={() => setFormFotos(prev => prev.filter((_, j) => j !== i))}
                          style={{ position: 'absolute', top: 2, right: 2, background: '#d32f2fe6', border: 'none', borderRadius: '50%', width: 20, height: 20, color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {formFotos.length < 3 && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => camaraRef.current?.click()}
                      style={{ flex: 1, background: '#4caf50', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      📷 Cámara
                    </button>
                    <button type="button" onClick={() => galeriaRef.current?.click()}
                      style={{ flex: 1, background: '#4caf50', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      🖼 Galería
                    </button>
                    <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { addFoto(e.target.files?.[0]); e.target.value = '' }} />
                    <input ref={galeriaRef} type="file" accept="image/*" hidden onChange={e => { addFoto(e.target.files?.[0]); e.target.value = '' }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={resetForm}
                  style={{ flex: 1, background: '#f5f5f5', color: '#333', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving || !form.titulo.trim()}
                  style={{ flex: 1, background: saving || !form.titulo.trim() ? '#9e9e9e' : '#1a73e8', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Guardando...' : 'Guardar aviso'}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && shown.length === 0 && (
          <div className="empty">
            <div className="ei">{filtro === 'realizados' ? '✅' : '📋'}</div>
            <p>No hay avisos en esta categoría</p>
          </div>
        )}

        {shown.map(a => (
          <AvisoCard key={a.id} aviso={a} onDelete={deleteAviso} />
        ))}
      </div>
    </div>
  )
}
