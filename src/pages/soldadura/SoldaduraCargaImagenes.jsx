import { useState, useRef, useEffect } from 'react'
import { collection, onSnapshot, setDoc, doc, getDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import { compressImage } from '../../utils/compressImage'

const UPLOAD_CONCURRENCY = 3
const UPLOAD_TIMEOUT_MS = 60_000

function chunks(arr, size) {
  const result = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

function ProgressBar({ label, current, total, color = '#1565c0' }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ background: '#e0e0e0', borderRadius: 6, height: 10, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 6, background: color, width: `${pct}%`, transition: 'width 0.25s ease' }} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
        {current} de {total}
      </div>
    </div>
  )
}

// map: key → array of { modeloId, code, label, type }
// A same code (e.g. SC121) can exist in multiple models → save to all of them
function buildCodeMap(modeloDocs) {
  const map = {}

  function add(key, entry) {
    if (!key) return
    const k = key.trim()
    if (!k) return
    if (!map[k]) map[k] = []
    if (!map[k].find(e => e.modeloId === entry.modeloId && e.code === entry.code)) {
      map[k].push(entry)
    }
  }

  for (const d of modeloDocs) {
    for (const s of (d.subconjuntos || [])) {
      const code = s.codCompleto || s.codigo
      if (code) {
        const entry = { modeloId: d.id, code, label: s.descGral || s.descSubc || code, type: 'Completo' }
        add(code, entry)
        if (s.codSubconjunto) add(s.codSubconjunto, entry)
      }
      for (const p of (s.parciales || [])) {
        if (p.codParcial) {
          const entry = { modeloId: d.id, code: p.codParcial, label: p.descSubc || p.codParcial, type: 'Parcial' }
          add(p.codParcial, entry)
          if (p.codSubconjunto) add(p.codSubconjunto, entry)
        }
      }
    }
  }
  return map
}

// Returns array of matches (all models sharing that code), or null
function findMatch(nameNoExt, codeMap) {
  const lookup = key => {
    if (!key) return null
    const k = key.trim()
    return codeMap[k] || codeMap[k.toUpperCase()] || codeMap[k.toLowerCase()] || null
  }

  const direct = lookup(nameNoExt)
  if (direct) return direct

  const underIdx = nameNoExt.indexOf('_')
  if (underIdx > 0) {
    const m = lookup(nameNoExt.substring(0, underIdx))
    if (m) return m
  }
  const dashIdx = nameNoExt.indexOf('-')
  if (dashIdx > 0) {
    const m = lookup(nameNoExt.substring(0, dashIdx))
    if (m) return m
  }

  const lowerName = nameNoExt.toLowerCase()
  for (const [key, arr] of Object.entries(codeMap)) {
    if (lowerName.includes(key.toLowerCase())) return arr
  }
  return null
}

export default function SoldaduraCargaImagenes() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const inputRef = useRef()
  const [codeMap, setCodeMap] = useState({})
  const [stage, setStage] = useState('select')
  const [items, setItems] = useState([])
  const [uploadStats, setUploadStats] = useState({ ok: 0, fail: 0 })
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)

  useEffect(() => {
    if (!isAdmin) navigate('/soldadura', { replace: true })
  }, [isAdmin, navigate])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'soldadura_modelos'), snap => {
      setCodeMap(buildCodeMap(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    }, () => {})
    return unsub
  }, [])

  if (!isAdmin) return null

  function handleSelect(e) {
    const selected = [...(e.target.files || [])]
    if (!selected.length) return
    const results = selected.map(file => {
      const nameNoExt = file.name.replace(/\.[^.]+$/, '').trim()
      const preview = URL.createObjectURL(file)
      const match = findMatch(nameNoExt, codeMap) // array or null
      return { file, preview, match, included: !!match }
    })
    setItems(results)
    setStage('preview')
    if (e.target) e.target.value = ''
  }

  function toggle(i) {
    if (!items[i].match) return
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, included: !it.included } : it))
  }

  async function handleSave() {
    const toUpload = items.filter(it => it.included && it.match)
    if (!toUpload.length) return
    setStage('uploading')
    setProgressCurrent(0)
    setProgressTotal(toUpload.length)
    let done = 0, okCount = 0, failCount = 0

    // Pre-fetch all tiempos docs needed to check for duplicates
    const tiemposCache = {}
    const modeloIds = [...new Set(toUpload.flatMap(it => it.match.map(m => m.modeloId)))]
    await Promise.all(modeloIds.map(async id => {
      try {
        const snap = await getDoc(doc(db, 'soldadura_tiempos', id))
        tiemposCache[id] = snap.exists() ? snap.data() : {}
      } catch { tiemposCache[id] = {} }
    }))

    for (const batch of chunks(toUpload, UPLOAD_CONCURRENCY)) {
      await Promise.all(batch.map(async item => {
        // Skip if ALL targets already have this filename
        const allAlreadyExist = item.match.every(({ modeloId, code }) =>
          (tiemposCache[modeloId]?.[code]?._fotos || []).some(f => f.nombre === item.file.name)
        )
        if (allAlreadyExist) {
          done++; setProgressCurrent(done)
          okCount++; setUploadStats({ ok: okCount, fail: failCount })
          return
        }

        let url = null, publicId = null
        try {
          const toSend = await compressImage(item.file)
          const fd = new FormData()
          fd.append('file', toSend)
          fd.append('upload_preset', 'tuberia_fotos')
          fd.append('folder', 'soldadura_fotos')
          const res = await withTimeout(
            fetch('https://api.cloudinary.com/v1_1/vgia9y4h/image/upload', { method: 'POST', body: fd }),
            UPLOAD_TIMEOUT_MS
          )
          const data = await res.json()
          if (data.secure_url) { url = data.secure_url; publicId = data.public_id }
        } catch {}

        if (url) {
          // Save to ALL models that share this code
          for (const { modeloId, code } of item.match) {
            try {
              const current = tiemposCache[modeloId] || {}
              const existing = current[code]?._fotos || []
              if (!existing.find(f => f.nombre === item.file.name || f.url === url)) {
                const updated = [...existing, { url, public_id: publicId, nombre: item.file.name }]
                await withTimeout(
                  setDoc(doc(db, 'soldadura_tiempos', modeloId), {
                    ...current,
                    [code]: { ...(current[code] || {}), _fotos: updated },
                  }),
                  10_000
                )
                // Update cache so subsequent items in same batch see the new state
                if (!tiemposCache[modeloId]) tiemposCache[modeloId] = {}
                if (!tiemposCache[modeloId][code]) tiemposCache[modeloId][code] = {}
                tiemposCache[modeloId][code]._fotos = updated
              }
            } catch {}
          }
          okCount++
        } else {
          failCount++
        }
        done++
        setProgressCurrent(done)
        setUploadStats({ ok: okCount, fail: failCount })
      }))
    }
    setStage('done')
  }

  function reset() {
    items.forEach(it => { try { URL.revokeObjectURL(it.preview) } catch {} })
    setItems([])
    setStage('select')
    setProgressCurrent(0)
    setProgressTotal(0)
    setUploadStats({ ok: 0, fail: 0 })
  }

  const includedCount = items.filter(it => it.included).length
  const matchedCount = items.filter(it => it.match).length
  const unmatchedCount = items.length - matchedCount

  if (stage === 'done') {
    return (
      <div className="app">
        <Header title="Carga Masiva — Soldadura" back="/soldadura" />
        <div className="empty" style={{ paddingTop: 80 }}>
          <div className="ei">{uploadStats.fail === 0 ? '✅' : '⚠️'}</div>
          <p style={{ fontWeight: 700, fontSize: 16 }}>{uploadStats.ok} imágenes guardadas</p>
          {uploadStats.fail > 0 && (
            <p style={{ fontSize: 13, color: '#e53935', marginTop: 6 }}>
              {uploadStats.fail} fallaron — podés volver a intentarlo
            </p>
          )}
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={reset}>Cargar más</button>
          <button className="btn btn-grey" style={{ marginTop: 10 }} onClick={() => navigate('/soldadura')}>Volver a Soldadura</button>
        </div>
      </div>
    )
  }

  if (stage === 'uploading') {
    return (
      <div className="app">
        <Header title="Carga Masiva — Soldadura" back="/soldadura" />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 100, paddingLeft: 32, paddingRight: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '4px solid #e0e0e0', borderTop: '4px solid #2e7d32',
            animation: 'spin 0.8s linear infinite', marginBottom: 28,
          }} />
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: '#333' }}>Subiendo imágenes...</p>
          <ProgressBar label="Subiendo" current={progressCurrent} total={progressTotal} color="#2e7d32" />
          <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 13 }}>
            <span style={{ color: '#2e7d32', fontWeight: 700 }}>✓ {uploadStats.ok} OK</span>
            {uploadStats.fail > 0 && <span style={{ color: '#e53935', fontWeight: 700 }}>✕ {uploadStats.fail} error</span>}
          </div>
          <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>No cerrés la pantalla hasta que termine</p>
        </div>
      </div>
    )
  }

  if (stage === 'preview') {
    return (
      <div className="app">
        <Header title="Carga Masiva — Soldadura" back="/soldadura" />
        <div style={{ padding: '10px 16px 0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {matchedCount > 0 && (
            <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>
              ✓ {matchedCount} identificadas
            </span>
          )}
          {unmatchedCount > 0 && (
            <span style={{ background: '#ffebee', color: '#c62828', borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>
              ✕ {unmatchedCount} sin coincidencia
            </span>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tocá para incluir/excluir</span>
        </div>

        <div className="content" style={{ paddingTop: 10, paddingBottom: 100 }}>
          {items.map((item, i) => {
            const first = item.match?.[0]
            const sharedCount = item.match?.length || 0
            return (
              <div key={i} onClick={() => toggle(i)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                background: '#fff', borderRadius: 12, marginBottom: 8,
                border: `1.5px solid ${item.included ? '#a5d6a7' : item.match ? '#e0e0e0' : '#ffcdd2'}`,
                opacity: item.match ? 1 : 0.6,
                cursor: item.match ? 'pointer' : 'default',
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: '#f5f5f5' }}>
                  <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { e.target.style.display = 'none' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.file.name}
                  </p>
                  {first ? (
                    <>
                      <p style={{ fontSize: 12, color: 'var(--primary)', margin: '2px 0 0', fontWeight: 600 }}>
                        ◈ {first.label} · <span style={{ color: first.type === 'Parcial' ? '#7b1fa2' : '#1565c0' }}>{first.type}</span>
                      </p>
                      {sharedCount > 1 && (
                        <p style={{ fontSize: 11, color: '#f57c00', margin: '1px 0 0', fontWeight: 600 }}>
                          Se guardará en {sharedCount} modelos
                        </p>
                      )}
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: '#e53935', margin: '2px 0 0' }}>Sin coincidencia en la base</p>
                  )}
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${item.included ? '#43a047' : '#bdbdbd'}`,
                  background: item.included ? '#43a047' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                }}>
                  {item.included ? '✓' : ''}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '12px 16px', background: '#fff',
          borderTop: '1px solid #e0e0e0',
          display: 'flex', gap: 10,
        }}>
          <button className="btn btn-grey" style={{ flex: 1 }} onClick={reset}>Volver a seleccionar</button>
          <button
            className="btn btn-success"
            style={{ flex: 2, background: includedCount > 0 ? '#2e7d32' : '#bdbdbd', color: '#fff', border: 'none' }}
            disabled={includedCount === 0}
            onClick={handleSave}
          >
            💾 Guardar {includedCount} imagen{includedCount !== 1 ? 'es' : ''}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Header title="Carga Masiva — Soldadura" back="/soldadura" />
      <div className="content">
        <div style={{ background: '#fff', borderRadius: 12, padding: '16px', border: '1px solid #e0e0e0', marginBottom: 16 }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 8px' }}>¿Cómo funciona?</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
            El sistema detecta automáticamente a qué subconjunto pertenece cada imagen por su nombre de archivo usando el código interno (Cod. Completo o Cod. Parcial):
          </p>
          <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', color: '#444', marginBottom: 10 }}>
            15122000021577_foto.jpg · SC001-vista.jpg · PR027.PNG
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            Si el subconjunto es compartido entre modelos, la imagen se guarda en todos automáticamente.
          </p>
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '16px', fontSize: 15, fontWeight: 700, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          onClick={() => inputRef.current?.click()}
        >
          🗂️ Seleccionar imágenes
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={handleSelect} />
    </div>
  )
}
