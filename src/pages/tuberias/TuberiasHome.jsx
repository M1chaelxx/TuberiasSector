import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, doc, setDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import * as XLSX from 'xlsx'

export default function TuberiasHome() {
  const navigate = useNavigate()
  const { isAdmin, isIngenieria, isExterno } = useAuth()
  const [meta, setMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [showImport, setShowImport] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'tuberia_meta'), snap => {
      if (snap.exists()) setMeta(snap.data())
      setLoading(false)
    }, () => setLoading(false))
    return unsub
  }, [])

  async function rebuildMeta() {
    setImporting(true)
    setImportProgress('Leyendo registros de Firebase...')
    try {
      const snap = await getDocs(collection(db, 'tuberia_bd'))
      const records = snap.docs.map(d => d.data())
      if (records.length === 0) {
        alert('No hay registros en tuberia_bd. Importá el Excel primero.')
        setImporting(false)
        setImportProgress('')
        return
      }
      setImportProgress(`Procesando ${records.length} registros...`)
      const modeloMeta = {}
      let totalPP = 0, totalSP = 0, totalAD = 0, totalC = 0
      for (const r of records) {
        if (!r.modelo) continue
        if (!modeloMeta[r.modelo]) {
          modeloMeta[r.modelo] = { nombre: r.modelo, caps: new Set(), lineas: new Set(), registros: 0 }
        }
        modeloMeta[r.modelo].caps.add(r.cap)
        if (r.linea) modeloMeta[r.modelo].lineas.add(r.linea)
        modeloMeta[r.modelo].registros++
        if (r.pieza === 'PP') totalPP++
        else if (r.pieza === 'SP') totalSP++
        else if (r.pieza === 'AD') totalAD++
        else if (r.pieza === 'C') totalC++
      }
      const modelosList = Object.values(modeloMeta).map(m => ({
        nombre: m.nombre,
        caps: [...m.caps].filter(Boolean).sort(),
        lineas: [...m.lineas].filter(Boolean).sort(),
        registros: m.registros,
      }))
      await setDoc(doc(db, 'config', 'tuberia_meta'), {
        lastUpdated: serverTimestamp(),
        lastUpdatedStr: new Date().toLocaleString('es-AR'),
        totalPP, totalSP, totalAD, totalC,
        modelos: modelosList,
      })
      alert(`✅ Metadatos reconstruidos: ${modelosList.length} modelos, ${records.length} registros`)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setImporting(false)
    setImportProgress('')
  }

  const modelos = meta?.modelos || []
  const filtered = modelos.filter(m =>
    !search || m.nombre.toLowerCase().includes(search.toLowerCase())
  )

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setShowImport(false)
    try {
      setImportProgress('Leyendo Excel...')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
      const dataRows = allRows.slice(4)

      const records = []
      for (const row of dataRows) {
        const modelo = row[0] ? String(row[0]).trim() : ''
        if (!modelo) continue
        const val = v => (v !== null && v !== undefined && String(v).trim() !== '') ? String(v).trim() : null
        const num = v => (v !== null && v !== undefined && v !== '' && !isNaN(Number(v))) ? Number(v) : null
        records.push({
          modelo,
          cap: val(row[1]) || '',
          linea: val(row[2]) || '',
          lineaProd: val(row[3]),
          codSubcGral: val(row[4]),
          descSubcGral: val(row[5]),
          codIntSubcCompleto: val(row[6]),
          codSubconjunto: val(row[7]),
          completo: val(row[8]),
          codIntSubcParcial: val(row[9]) || '-',
          descripcionGral: val(row[10]),
          tipo: val(row[11]),
          pieza: val(row[12]),
          plano: row[13] !== null && row[13] !== undefined ? String(row[13]).trim() : null,
          codigoCano: val(row[14]),
          codCobre: val(row[15]),
          codigoAlternativo: val(row[16]),
          codCobreReemplazo: val(row[17]),
          descripSAP: val(row[18]),
          titulo: val(row[19]),
          categoria: val(row[20]),
          cant: num(row[21]),
          unidad: val(row[22]),
          diametro: num(row[23]),
          espesor: num(row[24]),
          largo: num(row[25]),
          largoCal: val(row[26]),
          compa: val(row[27]),
          radio: num(row[28]),
          fotos: [],
        })
      }

      // Antes de borrar nada: guardamos qué fotos ya existen para piezas
      // compartidas entre modelos — SP/AD por código caño, PP por plano Y
      // código caño a la vez (los dos siempre coinciden cuando es realmente
      // la misma plantilla física; exigir los dos evita cruces por una
      // coincidencia de numeración). Así, al recrear los registros, las
      // piezas nuevas que compartan identificador con una ya fotografiada
      // (de este modelo o de otro) arrancan con esa foto puesta, en vez de
      // vacías. Se hace ANTES del borrado para no perder las fotos si se
      // reimporta el mismo modelo.
      setImportProgress(`Buscando fotos para compartir entre piezas...`)
      const fotosPorCano = {}
      const fotosPorPlano = {} // clave: `${plano}||${codigoCano}`
      const sharedSnap = await getDocs(query(collection(db, 'tuberia_bd'), where('pieza', 'in', ['SP', 'AD', 'PP'])))
      sharedSnap.docs.forEach(d => {
        const data = d.data()
        if (!(data.fotos || []).length) return
        if ((data.pieza === 'SP' || data.pieza === 'AD') && data.codigoCano && !fotosPorCano[data.codigoCano]) {
          fotosPorCano[data.codigoCano] = data.fotos
        } else if (data.pieza === 'PP' && data.plano && data.codigoCano) {
          const key = `${data.plano}||${data.codigoCano}`
          if (!fotosPorPlano[key]) fotosPorPlano[key] = data.fotos
        }
      })

      const modelosImport = [...new Set(records.map(r => r.modelo))]
      setImportProgress(`Limpiando datos anteriores...`)
      for (const modelo of modelosImport) {
        const snap = await getDocs(query(collection(db, 'tuberia_bd'), where('modelo', '==', modelo)))
        if (snap.docs.length > 0) {
          let batch = writeBatch(db); let cnt = 0
          for (const d of snap.docs) {
            batch.delete(d.ref); cnt++
            if (cnt >= 490) { await batch.commit(); batch = writeBatch(db); cnt = 0 }
          }
          if (cnt > 0) await batch.commit()
        }
      }

      setImportProgress(`Subiendo ${records.length} registros...`)
      let batch = writeBatch(db); let cnt = 0
      for (const record of records) {
        if ((record.pieza === 'SP' || record.pieza === 'AD') && record.codigoCano && fotosPorCano[record.codigoCano]) {
          record.fotos = fotosPorCano[record.codigoCano]
        } else if (record.pieza === 'PP' && record.plano && record.codigoCano) {
          const key = `${record.plano}||${record.codigoCano}`
          if (fotosPorPlano[key]) record.fotos = fotosPorPlano[key]
        }
        const ref = doc(collection(db, 'tuberia_bd'))
        batch.set(ref, { ...record, importedAt: serverTimestamp() })
        cnt++
        if (cnt >= 490) { await batch.commit(); batch = writeBatch(db); cnt = 0 }
      }
      if (cnt > 0) await batch.commit()

      setImportProgress('Actualizando resumen...')
      const modeloMeta = {}
      let totalPP = 0, totalSP = 0, totalAD = 0, totalC = 0
      for (const r of records) {
        if (!modeloMeta[r.modelo]) {
          modeloMeta[r.modelo] = { nombre: r.modelo, caps: new Set(), lineas: new Set(), registros: 0 }
        }
        modeloMeta[r.modelo].caps.add(r.cap)
        if (r.linea) modeloMeta[r.modelo].lineas.add(r.linea)
        modeloMeta[r.modelo].registros++
        if (r.pieza === 'PP') totalPP++
        else if (r.pieza === 'SP') totalSP++
        else if (r.pieza === 'AD') totalAD++
        else if (r.pieza === 'C') totalC++
      }
      const modelosList = Object.values(modeloMeta).map(m => ({
        nombre: m.nombre,
        caps: [...m.caps].sort(),
        lineas: [...m.lineas].sort(),
        registros: m.registros,
      }))
      await setDoc(doc(db, 'config', 'tuberia_meta'), {
        lastUpdated: serverTimestamp(),
        lastUpdatedStr: new Date().toLocaleString('es-AR'),
        totalPP, totalSP, totalAD, totalC,
        modelos: modelosList,
      })
      setImportProgress('')
      alert(`✅ ${records.length} registros importados correctamente`)
    } catch (err) {
      alert('Error al importar: ' + err.message)
      setImportProgress('')
    }
    setImporting(false)
    if (e.target) e.target.value = ''
  }

  async function findDocsByName(nameNoExt) {
    const tries = []
    // exact
    tries.push(['plano', nameNoExt])
    tries.push(['codigoCano', nameNoExt])
    tries.push(['codigoAlternativo', nameNoExt])
    // format "00001-15100101006802" → try after '-'
    if (nameNoExt.includes('-')) {
      const after = nameNoExt.substring(nameNoExt.indexOf('-') + 1).trim()
      const before = nameNoExt.substring(0, nameNoExt.indexOf('-')).trim()
      tries.push(['codigoCano', after])
      tries.push(['plano', before])
      tries.push(['codigoCano', before])
    }
    // format "PPxxxxx - codigoXXX" → try after ' - '
    if (nameNoExt.includes(' - ')) {
      const after = nameNoExt.split(' - ').slice(1).join(' - ').trim()
      const before = nameNoExt.split(' - ')[0].trim()
      tries.push(['codigoCano', after])
      tries.push(['codigoAlternativo', after])
      tries.push(['codigoCano', before])
      tries.push(['plano', before])
    }
    for (const [field, val] of tries) {
      if (!val) continue
      const s = await getDocs(query(collection(db, 'tuberia_bd'), where(field, '==', val)))
      if (s.docs.length) return s
    }
    return null
  }

  async function handleBulkImages(e) {
    const files = [...(e.target.files || [])]
    if (!files.length) return
    setImporting(true)
    setImportProgress(`Procesando ${files.length} imágenes...`)
    const { ref: storRef, uploadBytes, getDownloadURL } = await import('firebase/storage')
    const { storage } = await import('../../firebase')
    let matched = 0, unmatched = 0
    for (const file of files) {
      const nameNoExt = file.name.replace(/\.[^.]+$/, '').trim()
      const snap = await findDocsByName(nameNoExt)
      if (!snap) { unmatched++; continue }
      for (const d of snap.docs) {
        try {
          const sRef = storRef(storage, `tuberia_fotos/${d.id}/${file.name}`)
          await uploadBytes(sRef, file)
          const url = await getDownloadURL(sRef)
          const current = d.data().fotos || []
          if (!current.find(f => f.url === url)) {
            await setDoc(d.ref, { fotos: [...current, { url, path: sRef.fullPath, nombre: file.name }] }, { merge: true })
          }
          matched++
        } catch {}
      }
    }
    setImportProgress('')
    setImporting(false)
    alert(`✅ ${matched} imágenes asociadas, ${unmatched} sin coincidencia`)
    if (e.target) e.target.value = ''
  }


  return (
    <div className="app">
      <Header title="Tuberías" back="/" />

      <div className="tub-chips-row">
        <div className="tub-chip pp" style={{ cursor: 'pointer' }} onClick={() => navigate('/tuberias/tipo/PP')}>
          <span>▷</span> Plano Plantilla
          {meta?.totalPP > 0 && <span className="tch-badge">{meta.totalPP}</span>}
        </div>
        <div className="tub-chip sp" style={{ cursor: 'pointer' }} onClick={() => navigate('/tuberias/tipo/SP')}>
          <span>◈</span> Pieza Exportación
          {meta?.totalSP > 0 && <span className="tch-badge">{meta.totalSP}</span>}
        </div>
        <div className="tub-chip ad" style={{ cursor: 'pointer' }} onClick={() => navigate('/tuberias/tipo/AD')}>
          <span>+</span> Agregado
          {meta?.totalAD > 0 && <span className="tch-badge">{meta.totalAD}</span>}
        </div>
        {!isExterno && (
          <div className="tub-chip neutral" onClick={() => navigate('/tuberias/tiempos')}>
            <span>⏱</span> Tiempos
          </div>
        )}
        {!isExterno && (
          <div className="tub-chip success" style={{ background: '#e8f5e9', color: '#2e7d32' }} onClick={() => navigate('/tuberias/cobertura')}>
            <span>✅</span> Cobertura
          </div>
        )}
        {isAdmin && (
          <>
            <div className="tub-chip primary" onClick={() => setShowImport(true)}>
              <span>📄</span> Cargar Excel
            </div>
            <div className="tub-chip success" onClick={() => navigate('/tuberias/imagenes')}>
              <span>🖼</span> Cargar Imágenes
            </div>
          </>
        )}
      </div>

      {meta?.lastUpdatedStr && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', padding: '0 0 6px' }}>
          Última actualización Excel: {meta.lastUpdatedStr}
        </div>
      )}

      {importing && (
        <div style={{ background: '#e3f2fd', padding: '10px 16px', fontSize: 13, color: '#1565c0', textAlign: 'center' }}>
          ⏳ {importProgress || 'Procesando...'}
        </div>
      )}

      <div className="search-bar" style={{ position: 'relative', top: 0, paddingTop: 4 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo..." />
      </div>

      <div className="content">
        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && filtered.length === 0 && (
          <div className="empty">
            <div className="ei">🔩</div>
            <p>No hay modelos cargados.</p>
            {isAdmin && <p style={{ marginTop: 8, fontSize: 13 }}>Usá "Cargar Excel" para importar la base de datos.</p>}
          </div>
        )}
        {filtered.map(m => (
          <div key={m.nombre} className="card" onClick={() => navigate(`/tuberias/${encodeURIComponent(m.nombre)}`)}>
            <div className="tub-model-icon">❄️</div>
            <div className="info">
              <h3>{m.nombre}</h3>
              <p>{m.caps.length} capacidades: {m.caps.join(', ')}</p>
              <p style={{ fontSize: 12 }}>{m.lineas.join(', ')} — {m.registros} registros</p>
            </div>
            <div className="arrow">›</div>
          </div>
        ))}
      </div>

      <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImport} />


      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <h2>Cargar Excel — Base de Tuberías</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              El archivo debe tener la hoja <strong>BD Tuberias</strong> con encabezados en la fila 4:<br />
              Modelo, Cap, Linea, Pieza, Plano, Codigo Caño, etc.
            </p>
            <label className="upload-zone" onClick={() => { setShowImport(false); fileRef.current?.click() }}>
              <div className="uz-icon">📄</div>
              <p>Tocá para seleccionar el Excel</p>
              <small>.xlsx / .xls</small>
            </label>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-grey" onClick={() => setShowImport(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
