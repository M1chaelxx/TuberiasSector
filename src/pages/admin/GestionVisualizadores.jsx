import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import PdfViewerModal from '../../components/PdfViewerModal'

async function uploadPdfToCloudinary(file) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', 'tuberia_fotos')
  fd.append('folder', 'soldadura_visualizadores')
  // Cloudinary sirve PDFs bajo resource_type "image" (soporta el formato
  // nativamente); "raw" quedaba restringido por el preset sin firmar y
  // devolvía un archivo que el visor de PDF del navegador no podía abrir.
  const res = await fetch('https://api.cloudinary.com/v1_1/vgia9y4h/image/upload', { method: 'POST', body: fd })
  const data = await res.json()
  if (!data.secure_url) throw new Error(data.error?.message || 'Error Cloudinary')
  return { url: data.secure_url, public_id: data.public_id }
}

function subconjuntosDe(modeloDoc) {
  const items = []
  for (const s of (modeloDoc?.subconjuntos || [])) {
    if (s.codCompleto) items.push({ codigo: s.codCompleto, desc: s.descGral || s.titulo || s.codCompleto })
    for (const p of (s.parciales || [])) {
      if (!p.codParcial) continue
      // Un Parcial puede compartir el mismo código que su Completo (ej: SC069
      // "Pref. Salida Evaporadora" / "Salida Evaporadora") — se distingue con
      // el mismo sufijo ||P que ya usan Tiempos y Ciclos, para no perderlo
      // del desplegable ni pisar al Completo.
      const compartido = p.codParcial === s.codCompleto
      items.push({
        codigo: compartido ? `${p.codParcial}||P` : p.codParcial,
        desc: (p.descSubc || p.codParcial) + (compartido ? ' (Parcial)' : ''),
      })
    }
  }
  return items
}

const selectStyle = {
  width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '9px 10px',
  fontSize: 13, background: '#fff', boxSizing: 'border-box',
}

const emptyTarget = { modelo: '', cap: '', docId: '', codigo: '', desc: '' }

function TargetRow({ modelos, target, onChange, onRemove, removable, assignedMap }) {
  const modeloNames = [...new Set(modelos.map(m => m.modelo || m.id))].sort()
  const capsForModelo = modelos.filter(m => (m.modelo || m.id) === target.modelo)
  const modeloDoc = modelos.find(m => m.id === target.docId)
  const subconjuntos = subconjuntosDe(modeloDoc)
  const yaAsignado = target.modelo && target.cap && target.codigo
    ? assignedMap[`${target.modelo}||${target.cap}||${target.codigo}`]
    : null

  function setModelo(modelo) {
    const caps = modelos.filter(m => (m.modelo || m.id) === modelo)
    onChange({ modelo, cap: caps[0]?.cap || '', docId: caps[0]?.id || '', codigo: '', desc: '' })
  }
  function setCap(docId) {
    const md = modelos.find(m => m.id === docId)
    onChange({ ...target, cap: md?.cap || '', docId, codigo: '', desc: '' })
  }
  function setCodigo(codigo) {
    const sub = subconjuntos.find(s => s.codigo === codigo)
    onChange({ ...target, codigo, desc: sub?.desc || '' })
  }

  return (
    <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 12, marginBottom: 10, position: 'relative' }}>
      {removable && (
        <button type="button" onClick={onRemove} style={{
          position: 'absolute', top: 8, right: 8, background: '#ffebee', color: '#c62828',
          border: 'none', borderRadius: 6, width: 22, height: 22, fontSize: 12, cursor: 'pointer', lineHeight: 1,
        }}>×</button>
      )}
      <select value={target.modelo} onChange={e => setModelo(e.target.value)} style={selectStyle}>
        <option value="">— Modelo —</option>
        {modeloNames.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <select value={target.docId} onChange={e => setCap(e.target.value)} disabled={!target.modelo} style={{ ...selectStyle, marginTop: 6, opacity: target.modelo ? 1 : 0.5 }}>
        <option value="">— Capacidad —</option>
        {capsForModelo.map(c => <option key={c.id} value={c.id}>{c.cap || c.id}</option>)}
      </select>
      <select value={target.codigo} onChange={e => setCodigo(e.target.value)} disabled={!target.docId} style={{ ...selectStyle, marginTop: 6, opacity: target.docId ? 1 : 0.5 }}>
        <option value="">— Subconjunto —</option>
        {subconjuntos.map(s => <option key={s.codigo} value={s.codigo}>{s.codigo} · {s.desc}</option>)}
      </select>
      {yaAsignado && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#e65100', background: '#fff3e0', borderRadius: 6, padding: '5px 8px' }}>
          ⚠ Este subconjunto ya tiene un visualizador asignado: <strong>{yaAsignado}</strong>
        </div>
      )}
    </div>
  )
}

export default function GestionVisualizadores() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [visualizadores, setVisualizadores] = useState([])
  const [modelos, setModelos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [editId, setEditId] = useState(null)
  const [nombre, setNombre] = useState('')
  const [targets, setTargets] = useState([{ ...emptyTarget }])
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pdfModal, setPdfModal] = useState(null)
  const [filtroModelo, setFiltroModelo] = useState('')
  const [filtroCap, setFiltroCap] = useState('')
  const fileRef = useRef()

  const modeloNamesFiltro = [...new Set(modelos.map(m => m.modelo || m.id))].sort()
  const capsFiltro = [...new Set(modelos.filter(m => (m.modelo || m.id) === filtroModelo).map(m => m.cap).filter(Boolean))].sort()

  const visualizadoresFiltrados = visualizadores.filter(v => {
    if (!filtroModelo) return true
    return (v.targets || []).some(t => t.modelo === filtroModelo && (!filtroCap || t.cap === filtroCap))
  })

  // Mapa modelo||cap||codigo -> nombre del visualizador ya asignado, para avisar
  // si se intenta asignar el mismo subconjunto dos veces. Se excluye el propio
  // doc cuando se está editando, para no avisar de un choque contra sí mismo.
  const assignedMap = {}
  for (const v of visualizadores) {
    if (v.id === editId) continue
    for (const t of (v.targets || [])) {
      assignedMap[`${t.modelo}||${t.cap}||${t.codigo}`] = v.nombre
    }
  }

  // Nombres de archivo ya subidos (sin extensión, sin mayúsculas), para avisar
  // de un posible duplicado antes de subir uno nuevo. Excluye el propio doc.
  const archivosSubidos = visualizadores
    .filter(v => v.id !== editId)
    .map(v => (v.archivoNombre || '').toLowerCase().replace(/\.[^.]+$/, ''))
    .filter(Boolean)

  function findDocId(modelo, cap) {
    return modelos.find(m => (m.modelo || m.id) === modelo && m.cap === cap)?.id || ''
  }

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    const u1 = onSnapshot(collection(db, 'soldadura_visualizadores'), snap => {
      setVisualizadores(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    const u2 = onSnapshot(collection(db, 'soldadura_modelos'), snap => {
      setModelos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {})
    return () => { u1(); u2() }
  }, [isAdmin, navigate])

  function abrirNuevo() {
    setEditId(null)
    setNombre('')
    setTargets([{ ...emptyTarget }])
    setFile(null)
    setShowNew(true)
  }

  function abrirEditar(v) {
    setEditId(v.id)
    setNombre(v.nombre || '')
    setTargets((v.targets || []).map(t => ({ ...t, docId: findDocId(t.modelo, t.cap) })))
    setFile(null)
    setShowNew(true)
  }

  function updateTarget(i, val) {
    setTargets(prev => prev.map((t, idx) => idx === i ? val : t))
  }
  function addTarget() {
    setTargets(prev => [...prev, { ...emptyTarget }])
  }
  function removeTarget(i) {
    setTargets(prev => prev.filter((_, idx) => idx !== i))
  }

  async function guardar() {
    const validTargets = targets.filter(t => t.modelo && t.cap && t.codigo)
    if (!nombre.trim()) { alert('Ingresá un nombre/etiqueta (ej: VI-IP.266)'); return }
    if (!file && !editId) { alert('Elegí el archivo PDF'); return }
    if (!validTargets.length) { alert('Elegí al menos un subconjunto'); return }

    if (file) {
      const nombreArchivo = file.name.toLowerCase().replace(/\.[^.]+$/, '')
      if (archivosSubidos.includes(nombreArchivo)) {
        if (!confirm(`Ya subiste un archivo con este mismo nombre (${file.name}). ¿Querés subirlo de nuevo igual?`)) return
      }
    }
    const yaAsignados = validTargets
      .map(t => assignedMap[`${t.modelo}||${t.cap}||${t.codigo}`])
      .filter(Boolean)
    if (yaAsignados.length) {
      if (!confirm(`Algún subconjunto elegido ya tiene un visualizador asignado (${[...new Set(yaAsignados)].join(', ')}). ¿Continuar igual?`)) return
    }

    setSaving(true)
    try {
      const data = {
        nombre: nombre.trim(),
        targets: validTargets.map(t => ({ modelo: t.modelo, cap: t.cap, codigo: t.codigo, desc: t.desc })),
      }
      if (file) {
        const { url, public_id } = await uploadPdfToCloudinary(file)
        data.archivoNombre = file.name
        data.url = url
        data.public_id = public_id
      }
      if (editId) {
        await updateDoc(doc(db, 'soldadura_visualizadores', editId), data)
      } else {
        data.creadoEn = serverTimestamp()
        await addDoc(collection(db, 'soldadura_visualizadores'), data)
      }
      setShowNew(false)
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    }
    setSaving(false)
  }

  async function eliminar(v) {
    if (!confirm(`¿Eliminar el visualizador "${v.nombre}"? Se saca de los ${v.targets.length} subconjunto${v.targets.length !== 1 ? 's' : ''} donde aparece.`)) return
    await deleteDoc(doc(db, 'soldadura_visualizadores', v.id))
  }

  return (
    <div className="app">
      <Header title="Visualizadores" back="/" />

      <div className="content">
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 16 }} onClick={abrirNuevo}>
          + Nuevo visualizador
        </button>

        {!loading && visualizadores.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select value={filtroModelo} onChange={e => { setFiltroModelo(e.target.value); setFiltroCap('') }} style={selectStyle}>
              <option value="">Todos los modelos</option>
              {modeloNamesFiltro.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={filtroCap} onChange={e => setFiltroCap(e.target.value)} disabled={!filtroModelo} style={{ ...selectStyle, opacity: filtroModelo ? 1 : 0.5 }}>
              <option value="">Todas las cap.</option>
              {capsFiltro.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && visualizadores.length === 0 && (
          <div className="empty"><div className="ei">📎</div><p>No hay visualizadores cargados.</p></div>
        )}
        {!loading && visualizadores.length > 0 && visualizadoresFiltrados.length === 0 && (
          <div className="empty"><div className="ei">📎</div><p>Ningún visualizador coincide con el filtro elegido.</p></div>
        )}

        {visualizadoresFiltrados.map(v => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#ffebee', color: '#c62828', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>📄</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{v.nombre}</div>
              {(v.targets || []).map((t, i) => (
                <div key={i} style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                  {t.modelo} · {t.cap} · {t.codigo.replace('||P', '')} — {t.desc}
                </div>
              ))}
              {(v.targets || []).length > 1 && (
                <div style={{ fontSize: 10, color: '#2e7d32', fontWeight: 700, marginTop: 3 }}>
                  Compartido ({v.targets.length} subconjuntos)
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button onClick={() => setPdfModal(v.url)} style={{ background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>Ver</button>
              <button onClick={() => abrirEditar(v)} style={{ background: '#fff3e0', color: '#e65100', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>✏️</button>
              <button onClick={() => eliminar(v)} style={{ background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>🗑</button>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => !saving && setShowNew(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <h2>{editId ? 'Editar visualizador' : 'Nuevo visualizador'}</h2>

            <div className="modal-field">
              <label>Nombre / Etiqueta</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: VI-IP.266" disabled={saving} />
            </div>

            <div className="modal-field">
              <label>Archivo PDF{editId ? ' (opcional — dejalo así para mantener el actual)' : ''}</label>
              <label className="upload-zone" style={{ display: 'block' }}>
                <div className="uz-icon">📄</div>
                <p>{file ? file.name : editId ? 'Tocá para reemplazar el PDF actual' : 'Tocá para elegir el PDF'}</p>
                <input ref={fileRef} type="file" accept="application/pdf" hidden disabled={saving}
                  onChange={e => {
                    const f = e.target.files?.[0] || null
                    setFile(f)
                    if (f && !nombre.trim()) setNombre(f.name.replace(/\.[^.]+$/, ''))
                  }} />
              </label>
              {file && archivosSubidos.includes(file.name.toLowerCase().replace(/\.[^.]+$/, '')) && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#e65100', background: '#fff3e0', borderRadius: 6, padding: '5px 8px' }}>
                  ⚠ Ya subiste un archivo con este mismo nombre antes — revisá la lista, puede ser un duplicado.
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '14px 0 2px' }}>
              SUBCONJUNTOS DONDE APARECE
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.4 }}>
              Agregá más de uno si esta misma pieza se usa en otros modelos/capacidades.
            </p>
            {targets.map((t, i) => (
              <TargetRow
                key={i}
                modelos={modelos}
                target={t}
                onChange={val => updateTarget(i, val)}
                onRemove={() => removeTarget(i)}
                removable={targets.length > 1}
                assignedMap={assignedMap}
              />
            ))}
            <button type="button" onClick={addTarget} disabled={saving} style={{
              width: '100%', background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: 8,
              padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 14,
            }}>
              + Agregar otro subconjunto
            </button>

            <div className="modal-actions">
              <button className="btn btn-grey" onClick={() => setShowNew(false)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      <PdfViewerModal url={pdfModal} onClose={() => setPdfModal(null)} />
    </div>
  )
}
