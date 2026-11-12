import { useState, useRef, useEffect } from 'react'
import { collection, getDocs, query, where, setDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import { compressImage } from '../../utils/compressImage'

function chunks(arr, size) {
  const result = []
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size))
  return result
}

async function buildLookupMaps(files, onProgress) {
  const planoSet = new Set()
  const codigoSet = new Set()

  for (const file of files) {
    const nameNoExt = file.name.replace(/\.[^.]+$/, '').trim()
    const dashIdx = nameNoExt.indexOf('-')
    if (dashIdx > 0) {
      const left = nameNoExt.substring(0, dashIdx).trim()
      const right = nameNoExt.substring(dashIdx + 1).trim()
      const planoNum = String(parseInt(left, 10))
      if (planoNum !== 'NaN') planoSet.add(planoNum)
      if (right) codigoSet.add(right)
    }
    if (nameNoExt.includes(' - ')) {
      const after = nameNoExt.split(' - ').slice(1).join(' - ').trim()
      if (after) codigoSet.add(after)
    }
    planoSet.add(nameNoExt)
    codigoSet.add(nameNoExt)
    const planoNum = String(parseInt(nameNoExt, 10))
    if (planoNum !== 'NaN') planoSet.add(planoNum)
  }

  const planoMap = {}
  const codigoMap = {}
  const altMap = {}

  const planos = [...planoSet].filter(Boolean)
  const codigos = [...codigoSet].filter(Boolean)

  const planoChunks = chunks(planos, 30)
  const codigoChunks = chunks(codigos, 30)
  const totalBatches = planoChunks.length + codigoChunks.length * 2
  let doneBatches = 0

  const tick = () => { doneBatches++; onProgress(doneBatches, totalBatches) }

  // Run sequentially so progress updates are visible
  for (const chunk of planoChunks) {
    const snap = await getDocs(query(collection(db, 'tuberia_bd'), where('plano', 'in', chunk)))
    snap.docs.forEach(d => {
      const p = d.data().plano
      if (p) { if (!planoMap[p]) planoMap[p] = []; planoMap[p].push(d) }
    })
    tick()
  }
  for (const chunk of codigoChunks) {
    const snap = await getDocs(query(collection(db, 'tuberia_bd'), where('codigoCano', 'in', chunk)))
    snap.docs.forEach(d => {
      const c = d.data().codigoCano
      if (c) { if (!codigoMap[c]) codigoMap[c] = []; codigoMap[c].push(d) }
    })
    tick()
  }
  for (const chunk of codigoChunks) {
    const snap = await getDocs(query(collection(db, 'tuberia_bd'), where('codigoAlternativo', 'in', chunk)))
    snap.docs.forEach(d => {
      const a = d.data().codigoAlternativo
      if (a) { if (!altMap[a]) altMap[a] = []; altMap[a].push(d) }
    })
    tick()
  }

  return { planoMap, codigoMap, altMap }
}

function findMatchLocal(nameNoExt, planoMap, codigoMap, altMap) {
  const tryDocs = (map, key) => {
    if (!key || !map[key]) return null
    const docs = map[key]
    const r = docs[0].data()
    const modelos = [...new Set(
      docs.map(d => [d.data().modelo, d.data().cap].filter(Boolean).join(' ')).filter(Boolean)
    )]
    return { docs, pieza: r.pieza || '?', plano: r.plano || '?', modelos }
  }

  const dashIdx = nameNoExt.indexOf('-')
  if (dashIdx > 0) {
    const left = nameNoExt.substring(0, dashIdx).trim()
    const right = nameNoExt.substring(dashIdx + 1).trim()
    const planoNum = String(parseInt(left, 10))
    if (planoNum !== 'NaN' && right && planoMap[planoNum] && codigoMap[right]) {
      const planoDocIds = new Set(planoMap[planoNum].map(d => d.id))
      const combined = codigoMap[right].filter(d => planoDocIds.has(d.id))
      if (combined.length) {
        const r = combined[0].data()
        const modelos = [...new Set(
          combined.map(d => [d.data().modelo, d.data().cap].filter(Boolean).join(' ')).filter(Boolean)
        )]
        return { docs: combined, pieza: r.pieza || '?', plano: r.plano || '?', modelos }
      }
    }
    const m1 = planoNum !== 'NaN' ? tryDocs(planoMap, planoNum) : null
    if (m1) return m1
    const m2 = tryDocs(codigoMap, right)
    if (m2) return m2
  }

  if (nameNoExt.includes(' - ')) {
    const after = nameNoExt.split(' - ').slice(1).join(' - ').trim()
    const m = tryDocs(codigoMap, after) || tryDocs(altMap, after)
    if (m) return m
  }

  return (
    tryDocs(planoMap, nameNoExt) ||
    tryDocs(codigoMap, nameNoExt) ||
    tryDocs(altMap, nameNoExt) ||
    (() => {
      const p = String(parseInt(nameNoExt, 10))
      return p !== 'NaN' ? tryDocs(planoMap, p) : null
    })()
  )
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
        <div style={{
          height: '100%', borderRadius: 6, background: color,
          width: `${pct}%`, transition: 'width 0.25s ease',
        }} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
        {current} de {total}
      </div>
    </div>
  )
}

const UPLOAD_CONCURRENCY = 3
const UPLOAD_TIMEOUT_MS = 60_000

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

export default function TuberiasCargaImagenes() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const inputRef = useRef()
  const [stage, setStage] = useState('select')
  const [items, setItems] = useState([])
  const [progressLabel, setProgressLabel] = useState('')
  const [progressCurrent, setProgressCurrent] = useState(0)
  const [progressTotal, setProgressTotal] = useState(0)
  const [uploadStats, setUploadStats] = useState({ ok: 0, fail: 0 })

  useEffect(() => {
    if (!isAdmin) navigate('/tuberias', { replace: true })
  }, [isAdmin, navigate])

  if (!isAdmin) return null

  async function handleSelect(e) {
    const selected = [...(e.target.files || [])]
    if (!selected.length) return
    setStage('analyzing')
    setProgressLabel('Consultando base de datos...')
    setProgressCurrent(0)
    setProgressTotal(1)

    const { planoMap, codigoMap, altMap } = await buildLookupMaps(selected, (done, total) => {
      setProgressCurrent(done)
      setProgressTotal(total)
    })

    setProgressLabel('Identificando imágenes...')
    setProgressCurrent(selected.length)
    setProgressTotal(selected.length)

    const results = selected.map(file => {
      const nameNoExt = file.name.replace(/\.[^.]+$/, '').trim()
      const preview = URL.createObjectURL(file)
      const match = findMatchLocal(nameNoExt, planoMap, codigoMap, altMap)
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
    setProgressLabel('Subiendo imágenes...')
    setProgressCurrent(0)
    setProgressTotal(toUpload.length)

    // Las vistas previas ya no se muestran a partir de esta pantalla — se
    // liberan ahora para no mantener cientos de imágenes decodificadas en
    // memoria mientras se suben (con lotes grandes, esto llegaba a colgar
    // la pestaña justo al terminar la subida).
    items.forEach(it => { try { URL.revokeObjectURL(it.preview) } catch {} })

    let done = 0
    let okCount = 0
    let failCount = 0

    for (const batch of chunks(toUpload, UPLOAD_CONCURRENCY)) {
      await Promise.all(batch.map(async item => {
        // Skip if any matched doc already has this filename
        const alreadyExists = item.match.docs.some(d =>
          (d.data().fotos || []).find(f => f.nombre === item.file.name)
        )
        if (alreadyExists) {
          done++
          setProgressCurrent(done)
          okCount++
          setUploadStats({ ok: okCount, fail: failCount })
          return
        }

        let url = null
        let publicId = null
        try {
          const toSend = await compressImage(item.file)
          const fd = new FormData()
          fd.append('file', toSend)
          fd.append('upload_preset', 'tuberia_fotos')
          fd.append('folder', 'tuberia_fotos')
          const res = await withTimeout(
            fetch('https://api.cloudinary.com/v1_1/vgia9y4h/image/upload', { method: 'POST', body: fd }),
            UPLOAD_TIMEOUT_MS
          )
          const data = await res.json()
          if (data.secure_url) { url = data.secure_url; publicId = data.public_id }
        } catch {}

        if (url) {
          for (const d of item.match.docs) {
            try {
              const current = d.data().fotos || []
              if (!current.find(f => f.url === url)) {
                await withTimeout(
                  setDoc(d.ref, { fotos: [...current, { url, public_id: publicId, nombre: item.file.name }] }, { merge: true }),
                  10_000
                )
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
    setProgressLabel('')
    setUploadStats({ ok: 0, fail: 0 })
  }

  const includedCount = items.filter(it => it.included).length
  const matchedCount = items.filter(it => it.match).length
  const unmatchedCount = items.length - matchedCount

  if (stage === 'done') {
    return (
      <div className="app">
        <Header title="Carga Masiva de Imágenes" back="/tuberias" />
        <div className="empty" style={{ paddingTop: 80 }}>
          <div className="ei">{uploadStats.fail === 0 ? '✅' : '⚠️'}</div>
          <p style={{ fontWeight: 700, fontSize: 16 }}>
            {uploadStats.ok} imágenes guardadas
          </p>
          {uploadStats.fail > 0 && (
            <p style={{ fontSize: 13, color: '#e53935', marginTop: 6 }}>
              {uploadStats.fail} fallaron (timeout o error de red) — podés volver a intentarlo
            </p>
          )}
          <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={reset}>Cargar más</button>
          <button className="btn btn-grey" style={{ marginTop: 10 }} onClick={() => navigate('/tuberias')}>Volver a Tuberías</button>
        </div>
      </div>
    )
  }

  if (stage === 'analyzing' || stage === 'uploading') {
    const color = stage === 'uploading' ? '#2e7d32' : '#1565c0'
    return (
      <div className="app">
        <Header title="Carga Masiva de Imágenes" back="/tuberias" />
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', paddingTop: 100, paddingLeft: 32, paddingRight: 32,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: `4px solid #e0e0e0`,
            borderTop: `4px solid ${color}`,
            animation: 'spin 0.8s linear infinite',
            marginBottom: 28,
          }} />
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: '#333' }}>
            {progressLabel}
          </p>
          <ProgressBar
            label={stage === 'analyzing' ? 'Consultando Firestore' : 'Subiendo'}
            current={progressCurrent}
            total={progressTotal}
            color={color}
          />
          {stage === 'uploading' && (
            <>
              <div style={{ display: 'flex', gap: 16, marginTop: 16, fontSize: 13 }}>
                <span style={{ color: '#2e7d32', fontWeight: 700 }}>✓ {uploadStats.ok} OK</span>
                {uploadStats.fail > 0 && <span style={{ color: '#e53935', fontWeight: 700 }}>✕ {uploadStats.fail} error</span>}
              </div>
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                No cerrés la pantalla hasta que termine
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  if (stage === 'preview') {
    return (
      <div className="app">
        <Header title="Carga Masiva de Imágenes" back="/tuberias" />

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
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tocá una fila para incluir/excluir</span>
        </div>

        <div className="content" style={{ paddingTop: 10, paddingBottom: 100 }}>
          {items.map((item, i) => (
            <div key={i}
              onClick={() => toggle(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                background: '#fff', borderRadius: 12, marginBottom: 8,
                border: `1.5px solid ${item.included ? '#a5d6a7' : item.match ? '#e0e0e0' : '#ffcdd2'}`,
                opacity: item.match ? 1 : 0.6,
                cursor: item.match ? 'pointer' : 'default',
              }}>
              <div style={{
                width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img src={item.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={e => { e.target.style.display = 'none' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.file.name}
                </p>
                {item.match ? (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--primary)', margin: '2px 0 0', fontWeight: 600 }}>
                      ◈ {item.match.pieza}
                      {(item.match.modelos?.length || 0) > 1
                        ? ` — ${item.match.modelos.length} modelos`
                        : ` — Plano ${item.match.plano}`}
                    </p>
                    {(item.match.modelos?.length || 0) > 1 && (
                      <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.match.modelos.join(' · ')}
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
          ))}
        </div>

        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '12px 16px', background: '#fff',
          borderTop: '1px solid #e0e0e0',
          display: 'flex', gap: 10,
        }}>
          <button className="btn btn-grey" style={{ flex: 1 }} onClick={reset}>
            Volver a seleccionar
          </button>
          <button
            className="btn btn-success"
            style={{ flex: 2, background: includedCount > 0 ? '#2e7d32' : '#bdbdbd', color: '#fff', border: 'none' }}
            disabled={includedCount === 0}
            onClick={handleSave}>
            💾 Guardar {includedCount} imagen{includedCount !== 1 ? 'es' : ''}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Header title="Carga Masiva de Imágenes" back="/tuberias" />

      <div className="content">
        <div style={{
          background: '#fff', borderRadius: 12, padding: '16px',
          border: '1px solid #e0e0e0', marginBottom: 16,
        }}>
          <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 8px' }}>¿Cómo funciona?</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
            El sistema detecta automáticamente a qué pieza pertenece cada imagen por su nombre de archivo:
          </p>
          <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', color: '#444', marginBottom: 10 }}>
            00190-15122000027906.PNG · 00045-15100101006802.jpg
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
            El número antes del guión es el plano, el número después es el código del caño. Aplica para <strong>PP, SP y AD</strong>. Se pueden seleccionar múltiples imágenes a la vez.
          </p>
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '16px', fontSize: 15, fontWeight: 700, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          onClick={() => inputRef.current?.click()}>
          🗂️ Seleccionar imágenes
        </button>
      </div>

      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={handleSelect} />
    </div>
  )
}
