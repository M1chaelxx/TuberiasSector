import { useRef, useState } from 'react'
import { compressImage } from '../utils/compressImage'

export default function PhotoGrid({ photos = [], onUpdate, canEdit, folder = 'soldadura_fotos' }) {
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const cameraRef = useRef()
  const galleryRef = useRef()

  async function handleFiles(e) {
    const files = [...(e.target.files || [])]
    if (!files.length) return
    setUploading(true)
    const newPhotos = [...photos]
    for (const file of files) {
      try {
        const toSend = await compressImage(file)
        const fd = new FormData()
        fd.append('file', toSend)
        fd.append('upload_preset', 'tuberia_fotos')
        fd.append('folder', folder)
        const res = await fetch('https://api.cloudinary.com/v1_1/vgia9y4h/image/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (data.secure_url) {
          newPhotos.push({ url: data.secure_url, public_id: data.public_id, nombre: file.name })
        }
      } catch (err) {
        console.error('Upload error:', err)
      }
    }
    setUploading(false)
    onUpdate(newPhotos)
    if (e.target) e.target.value = ''
  }

  function deletePhoto(idx) {
    if (!confirm('¿Eliminar esta foto?')) return
    onUpdate(photos.filter((_, i) => i !== idx))
  }

  return (
    <>
      {canEdit && (
        <div style={{ padding: '8px 16px 4px', display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => cameraRef.current?.click()}>📷 Cámara</button>
          <button className="btn btn-outline btn-sm" onClick={() => galleryRef.current?.click()}>🖼 Galería</button>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={handleFiles} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />

      {(photos.length > 0 || uploading) && (
        <div className="photos-grid" style={{ paddingTop: 0 }}>
          {photos.map((p, i) => (
            <div key={i} className="photo-wrapper">
              <img className="photo-thumb" src={p.url} alt={p.nombre || ''} onClick={() => setLightbox(p.url)} />
              {canEdit && <button className="delete-photo" onClick={() => deletePhoto(i)}>×</button>}
            </div>
          ))}
          {uploading && (
            <div className="photo-add">
              <span className="spin" style={{ width: 24, height: 24 }} />
              <span>Subiendo...</span>
            </div>
          )}
        </div>
      )}
      {photos.length === 0 && !uploading && (
        <div style={{ padding: '4px 16px 12px', color: '#999', fontSize: 13 }}>Sin fotos cargadas</div>
      )}

      {lightbox && (
        <div className="modal-overlay img-modal" onClick={() => setLightbox(null)}>
          <button className="modal-close-btn" onClick={() => setLightbox(null)}>×</button>
          <img className="full-img" src={lightbox} alt="" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  )
}
