import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, deleteField } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import * as XLSX from 'xlsx'
import { exportarCicloTaktPDF } from './exportCicloTakt'

const PUESTOS_SOL = [
  'SOL-01', 'SOL-02', 'SOL-03', 'SOL-04', 'SOL-05', 'SOL-06',
  'SOL-07', 'SOL-08', 'SOL-09', 'SOL-10', 'SOL-11', 'SOL-12',
  'SOL-13', 'SOL-14', 'SOL-15', 'SOL-16', 'SOL-17', 'SOL-18',
  'Preformado',
]

export default function SoldaduraHome() {
  const navigate = useNavigate()
  const { isAdmin, isIngenieria, isProduccion } = useAuth()
  const [docs, setDocs] = useState([])
  const [meta, setMeta] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showMigrar, setShowMigrar] = useState(false)
  const [migrarViejo, setMigrarViejo] = useState('')
  const [migrarNuevo, setMigrarNuevo] = useState('')
  const [migrando, setMigrando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [showPdfCT, setShowPdfCT] = useState(false)
  const [pdfCTModelo, setPdfCTModelo] = useState('')
  const [exportandoCT, setExportandoCT] = useState(false)

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'soldadura_modelos'), snap => {
      setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    const u2 = onSnapshot(doc(db, 'config', 'soldadura_meta'), snap => {
      if (snap.exists()) setMeta(snap.data())
    }, () => {})
    return () => { u1(); u2() }
  }, [])

  // Group by modelo name
  const groups = docs.reduce((acc, d) => {
    const key = d.modelo || d.id
    if (!acc[key]) acc[key] = []
    acc[key].push(d)
    return acc
  }, {})

  const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  const filtered = !search
    ? sorted
    : sorted.filter(([name]) => name.toLowerCase().includes(search.toLowerCase()))

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      const map = {}
      function parseRow(row) {
        return {
          modelo: String(row['Modelo'] || row.modelo || '').trim(),
          cap: String(row['Cap'] || row.cap || row['Capacidad'] || '').trim(),
          linea: String(row['Linea'] || row['Línea'] || '').trim(),
          marca: String(row['Marca'] || '').trim(),
          codCompleto: String(row['Cod Int Subc Completo'] || row['codCompleto'] || '').trim(),
          codParcial: String(row['Cod Int Subc Parcial'] || row['codParcial'] || '').trim(),
          tipo: String(row['Tipo'] || '').trim(),
          codSubconjunto: String(row['Cod Subconjunto '] || row['Cod Subconjunto'] || '').trim(),
          descGral: String(row['Descripcion Gral'] || '').trim(),
          descSubc: String(row['Descripcion Subc'] || '').trim(),
        }
      }
      // Pass 1: Completo rows
      rows.forEach(row => {
        const { modelo, cap, linea, marca, codCompleto, codParcial, tipo, codSubconjunto, descGral, descSubc } = parseRow(row)
        if (!modelo || !codCompleto || tipo !== 'Completo') return
        const key = `${modelo}_${cap}`.replace(/\//g, '-')
        if (!map[key]) map[key] = { modelo, cap, marca, subconjuntos: [] }
        if (!map[key].subconjuntos.find(s => s.codCompleto === codCompleto)) {
          map[key].subconjuntos.push({
            codCompleto, codParcial, linea, tipo,
            codSubconjunto: codSubconjunto !== '-' ? codSubconjunto : '',
            descGral, descSubc, parciales: [],
          })
        }
      })
      // Pass 1b: un código de Completo sin ninguna fila "Completo" (error típico
      // al cargar el Excel: la fila "Pref. X" cuyo código parcial = completo quedó
      // como Parcial) quedaría huérfano e invisible. Esa fila se toma como el
      // Completo del grupo.
      const promovidas = new Set()
      rows.forEach(row => {
        const { modelo, cap, linea, marca, codCompleto, codParcial, tipo, codSubconjunto, descGral, descSubc } = parseRow(row)
        if (!modelo || !codCompleto || tipo !== 'Parcial' || codParcial !== codCompleto) return
        const key = `${modelo}_${cap}`.replace(/\//g, '-')
        if (map[key]?.subconjuntos.find(s => s.codCompleto === codCompleto)) return
        if (!map[key]) map[key] = { modelo, cap, marca, subconjuntos: [] }
        map[key].subconjuntos.push({
          codCompleto, codParcial, linea, tipo: 'Completo',
          codSubconjunto: codSubconjunto !== '-' ? codSubconjunto : '',
          descGral, descSubc, parciales: [],
        })
        promovidas.add(`${key}|${codCompleto}`)
      })
      // Pass 2: Parcial rows → add to parent's parciales array
      rows.forEach(row => {
        const { modelo, cap, codCompleto, codParcial, tipo, codSubconjunto, descSubc, linea } = parseRow(row)
        if (!modelo || tipo !== 'Parcial' || !codParcial || !codCompleto) return
        const key = `${modelo}_${cap}`.replace(/\//g, '-')
        if (!map[key]) return
        if (codParcial === codCompleto && promovidas.has(`${key}|${codCompleto}`)) return
        const parent = map[key].subconjuntos.find(s => s.codCompleto === codCompleto)
        if (parent && !parent.parciales.find(p => p.codParcial === codParcial)) {
          parent.parciales.push({
            codParcial, linea,
            codSubconjunto: codSubconjunto !== '-' ? codSubconjunto : '',
            descSubc,
          })
        }
      })
      for (const [key, val] of Object.entries(map)) {
        await setDoc(doc(db, 'soldadura_modelos', key), val)
      }
      await setDoc(doc(db, 'config', 'soldadura_meta'), {
        lastUpdatedStr: new Date().toLocaleString('es-AR'),
        totalModelos: Object.keys(map).length,
      }, { merge: true })
      alert(`✅ Importados ${Object.keys(map).length} modelos`)
      setShowImport(false)
    } catch (err) {
      alert('Error al importar: ' + err.message)
    }
    setImporting(false)
    if (e.target) e.target.value = ''
  }

  // Cuando un modelo cambia de nombre en el Excel (ej: "AG Fijo R32" → "Fijo AG
  // R32" para que matchee con Tuberías), el modelo viejo queda como una
  // entrada separada y todo lo que se guardó bajo su ID viejo ("AG Fijo
  // R32_09FC") queda huérfano: mediciones (soldadura_tiempos), Takt Time y
  // Ciclos (config/takt_soldadura y config/ciclos_soldadura, con claves tipo
  // "{modeloId}||{linea o código}"). Esta función mueve las tres cosas al ID
  // nuevo y borra el modelo viejo del catálogo.
  //
  // Escanea las claves crudas en vez de basarse en que el modelo viejo siga
  // existiendo en soldadura_modelos — así también sirve para reparar lo que
  // ya quedó huérfano de una migración anterior que no movía Takt/Ciclos.
  function remapKey(key, viejoPrefix, modeloNuevo) {
    const sepIdx = key.indexOf('||')
    if (sepIdx === -1) return null
    const idPart = key.slice(0, sepIdx)
    if (!idPart.startsWith(viejoPrefix)) return null
    const cap = idPart.slice(viejoPrefix.length)
    const newIdPart = `${modeloNuevo}_${cap}`.replace(/\//g, '-')
    return newIdPart + key.slice(sepIdx)
  }

  async function migrarConfigDoc(docName, viejoPrefix, modeloNuevo) {
    const snap = await getDoc(doc(db, 'config', docName))
    if (!snap.exists()) return 0
    const data = snap.data()
    const updates = {}
    let count = 0
    for (const key of Object.keys(data)) {
      const newKey = remapKey(key, viejoPrefix, modeloNuevo)
      if (!newKey) continue
      updates[newKey] = data[key]
      updates[key] = deleteField()
      count++
    }
    if (count > 0) await updateDoc(doc(db, 'config', docName), updates)
    return count
  }

  async function migrarModelo(modeloViejo, modeloNuevo) {
    // Los IDs de documento sanitizan "/" a "-" (Firestore no permite barras
    // en un segmento de path) al importar el Excel — hay que aplicar la
    // misma conversión acá o el prefijo nunca matchea con modelos que tengan
    // una barra en el nombre (ej: "Inverter EZ/GP R32").
    const viejoPrefix = `${modeloViejo.replace(/\//g, '-')}_`

    const [tiemposSnap, modelosSnap] = await Promise.all([
      getDocs(collection(db, 'soldadura_tiempos')),
      getDocs(collection(db, 'soldadura_modelos')),
    ])
    const oldIds = new Set()
    tiemposSnap.docs.forEach(d => { if (d.id.startsWith(viejoPrefix)) oldIds.add(d.id) })
    modelosSnap.docs.forEach(d => { if (d.id.startsWith(viejoPrefix)) oldIds.add(d.id) })

    let migrados = 0, sinDatos = 0
    for (const oldId of oldIds) {
      const cap = oldId.slice(viejoPrefix.length)
      const newId = `${modeloNuevo}_${cap}`.replace(/\//g, '-')
      const tSnap = await getDoc(doc(db, 'soldadura_tiempos', oldId))
      if (tSnap.exists()) {
        await setDoc(doc(db, 'soldadura_tiempos', newId), tSnap.data(), { merge: true })
        await deleteDoc(doc(db, 'soldadura_tiempos', oldId))
        migrados++
      } else {
        sinDatos++
      }
      await deleteDoc(doc(db, 'soldadura_modelos', oldId)).catch(() => {})
    }

    const taktMigrados = await migrarConfigDoc('takt_soldadura', viejoPrefix, modeloNuevo)
    const ciclosMigrados = await migrarConfigDoc('ciclos_soldadura', viejoPrefix, modeloNuevo)

    return { migrados, sinDatos, taktMigrados, ciclosMigrados, total: oldIds.size }
  }

  // Lista todas las tareas (Completo + Parciales con código propio) de un
  // modelo, con el storageKey exacto con el que se guardan sus mediciones
  // — mismo criterio que usa SoldaduraDetail.jsx (||P solo cuando un
  // Completo y su propio Parcial comparten literalmente el mismo código).
  function enumerarTareas(modeloDoc) {
    const out = []
    for (const s of (modeloDoc.subconjuntos || [])) {
      const codeC = s.codCompleto || s.codigo
      if (codeC) out.push({ codigo: codeC, tipo: 'Completo', storageKey: codeC })
      for (const par of (s.parciales || [])) {
        if (!par.codParcial) continue
        const sk = par.codParcial === codeC ? `${par.codParcial}||P` : par.codParcial
        out.push({ codigo: par.codParcial, tipo: 'Parcial', storageKey: sk })
      }
    }
    return out
  }

  // Un subconjunto que se repite con el mismo código en más de un modelo
  // (ej: SC187 "Entrada Distribuidor Bronce" en "Inverter EZ R32" y en
  // "Inverter GP R32") tiene que compartir sus mediciones — mismo criterio
  // ya usado en Tuberías para SP/AD/PP. Las mediciones nuevas ya se
  // propagan solas desde V286 (ver SoldaduraDetail.jsx); esta función es el
  // backfill de una sola vez para lo que ya estaba guardado antes de eso.
  async function sincronizarTiemposCompartidos() {
    setSincronizando(true)
    try {
      const [modelosSnap, tiemposSnap] = await Promise.all([
        getDocs(collection(db, 'soldadura_modelos')),
        getDocs(collection(db, 'soldadura_tiempos')),
      ])
      const modelos = modelosSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      const tiemposPorDoc = {}
      tiemposSnap.docs.forEach(d => { tiemposPorDoc[d.id] = d.data() })

      // Agrupa por "tipo||código" a todos los (modelo, storageKey) que
      // comparten ese subconjunto — un cluster de 1 no tiene con quién
      // compartir, se ignora.
      const clusters = {}
      for (const m of modelos) {
        for (const t of enumerarTareas(m)) {
          const key = `${t.tipo}||${t.codigo}`
          if (!clusters[key]) clusters[key] = []
          clusters[key].push({ docId: m.id, storageKey: t.storageKey })
        }
      }

      const writes = {}
      let clustersActualizados = 0
      let medicionesAgregadas = 0

      for (const entries of Object.values(clusters)) {
        if (entries.length < 2) continue
        let huboCambioEnCluster = false

        for (const puesto of PUESTOS_SOL) {
          const todas = []
          entries.forEach(e => {
            (tiemposPorDoc[e.docId]?.[e.storageKey]?.[puesto]?.mediciones || []).forEach(m => todas.push(m))
          })
          if (!todas.length) continue

          // Dedupe por huella (fecha+operario+tiempos) — un mismo registro
          // puede aparecer repetido si ya se había propagado antes.
          const vistos = new Set()
          const unicas = todas.filter(m => {
            const fp = `${m.fecha}|${m.operario}|${m.tiempoObs}|${m.tiempoNorm}`
            if (vistos.has(fp)) return false
            vistos.add(fp)
            return true
          })

          for (const e of entries) {
            const actuales = tiemposPorDoc[e.docId]?.[e.storageKey]?.[puesto]?.mediciones || []
            if (actuales.length === unicas.length) continue
            if (!writes[e.docId]) writes[e.docId] = {}
            if (!writes[e.docId][e.storageKey]) writes[e.docId][e.storageKey] = {}
            writes[e.docId][e.storageKey][puesto] = { mediciones: unicas }
            medicionesAgregadas += Math.max(unicas.length - actuales.length, 0)
            huboCambioEnCluster = true
          }
        }
        if (huboCambioEnCluster) clustersActualizados++
      }

      for (const docId of Object.keys(writes)) {
        await setDoc(doc(db, 'soldadura_tiempos', docId), writes[docId], { merge: true })
      }

      alert(
        `Sincronización completa.\n\n` +
        `${clustersActualizados} subconjunto(s) compartido(s) actualizados.\n` +
        `${medicionesAgregadas} medición(es) propagada(s) entre modelos.`
      )
    } catch (err) {
      alert('Error al sincronizar: ' + err.message)
    }
    setSincronizando(false)
  }

  async function handleMigrar() {
    const viejo = migrarViejo.trim()
    if (!viejo || !migrarNuevo) { alert('Escribí el modelo viejo y elegí el modelo nuevo'); return }
    if (viejo === migrarNuevo) { alert('Elegí dos modelos distintos'); return }
    if (!confirm(
      `¿Migrar "${viejo}" a "${migrarNuevo}"?\n\n` +
      `Se moverán mediciones, Takt Time y Ciclos guardados bajo el nombre viejo, y se eliminará "${viejo}" de la lista de modelos si todavía existe.\n\n` +
      `Esto reescribe datos ya guardados y no tiene un botón de deshacer.`
    )) return
    setMigrando(true)
    try {
      const { migrados, sinDatos, taktMigrados, ciclosMigrados, total } = await migrarModelo(viejo, migrarNuevo)
      if (total === 0 && taktMigrados === 0 && ciclosMigrados === 0) {
        alert(`No se encontró nada guardado bajo "${viejo}" para migrar.`)
      } else {
        alert(
          `✅ Migración completa.\n` +
          `${migrados} capacidad${migrados !== 1 ? 'es' : ''} con mediciones movidas.\n` +
          `${sinDatos} capacidad${sinDatos !== 1 ? 'es' : ''} sin mediciones (solo catálogo).\n` +
          `${taktMigrados} valor${taktMigrados !== 1 ? 'es' : ''} de Takt Time movido${taktMigrados !== 1 ? 's' : ''}.\n` +
          `${ciclosMigrados} valor${ciclosMigrados !== 1 ? 'es' : ''} de Ciclos movido${ciclosMigrados !== 1 ? 's' : ''}.`
        )
      }
      setMigrarViejo('')
      setMigrarNuevo('')
      setShowMigrar(false)
    } catch (err) {
      alert('Error al migrar: ' + err.message)
    }
    setMigrando(false)
  }

  const nombresModelos = Object.keys(groups).sort((a, b) => a.localeCompare(b))

  return (
    <div className="app">
      <Header title="Soldadura" back="/" />

      {/* Action chips row */}
      <div className="tub-chips-row">
        <div className="tub-chip neutral" onClick={() => navigate('/soldadura/tiempos')}>
          <span>⏱</span> Tiempos
        </div>
        {!isProduccion && (
          <div className="tub-chip sp" onClick={() => navigate('/soldadura/takttime')}>
            <span>🎯</span> Takt Time
          </div>
        )}
        <div className="tub-chip ad" onClick={() => navigate('/soldadura/balance')}>
          <span>📊</span> Distribución
        </div>
        <div className="tub-chip" style={{ background: '#ede7f6', color: '#4527a0' }} onClick={() => navigate('/soldadura/puestos')}>
          <span>👷</span> Puestos
        </div>
        <div className="tub-chip" style={{ background: '#e3f2fd', color: '#1565c0' }} onClick={() => navigate('/soldadura/plan-semanal')}>
          <span>📅</span> Plan semanal/mensual
        </div>
        {!isProduccion && (
          <div className="tub-chip" style={{ background: '#e8f5e9', color: '#2e7d32' }} onClick={() => setShowPdfCT(true)}>
            <span>📄</span> PDF Ciclo/Takt
          </div>
        )}
        {!isProduccion && (
          <div className="tub-chip" style={{ background: '#ffebee', color: '#c62828' }} onClick={() => navigate('/soldadura/visualizadores')}>
            <span>📎</span> Visualizadores
          </div>
        )}
        {isAdmin && (
          <>
            <div className="tub-chip primary" onClick={() => setShowImport(true)}>
              <span>📋</span> Cargar Excel
            </div>
            <div className="tub-chip success" onClick={() => navigate('/soldadura/imagenes')}>
              <span>🖼</span> Cargar Imágenes
            </div>
            <div className="tub-chip" style={{ background: '#fff3e0', color: '#e65100' }} onClick={() => setShowMigrar(true)}>
              <span>🔀</span> Migrar modelo
            </div>
            <div className="tub-chip" style={{ background: '#e0f2f1', color: '#00695c' }}
              onClick={() => {
                if (sincronizando) return
                if (confirm(
                  '¿Sincronizar tiempos compartidos entre modelos?\n\n' +
                  'Busca subconjuntos con el mismo código en más de un modelo (ej: SC187 en "Inverter EZ R32" y "Inverter GP R32") y les pareja las mediciones ya cargadas.\n\n' +
                  'No borra nada, solo agrega lo que a cada modelo le falte.'
                )) sincronizarTiemposCompartidos()
              }}>
              <span>{sincronizando ? '⏳' : '🔁'}</span> {sincronizando ? 'Sincronizando...' : 'Sincronizar tiempos'}
            </div>
          </>
        )}
      </div>

      {meta?.lastUpdatedStr && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', padding: '0 0 6px' }}>
          Última actualización Excel: {meta.lastUpdatedStr}
        </div>
      )}

      <div className="search-bar">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo..." />
      </div>

      <div className="content">
        {loading && <div className="spinner"><div className="spin" /></div>}

        {!loading && filtered.length === 0 && (
          <div className="empty">
            <div className="ei">🔧</div>
            <p>No hay modelos cargados.</p>
            {isAdmin && <p style={{ marginTop: 8, fontSize: 13 }}>Importá un Excel para comenzar.</p>}
          </div>
        )}

        {filtered.map(([modeloName, caps]) => {
          const totalSubc = caps.reduce((a, c) => a + (c.subconjuntos?.length || 0), 0)
          const capNames = [...new Set(caps.map(c => c.cap).filter(Boolean))].sort()
          return (
            <div key={modeloName} className="card"
              onClick={() => navigate(`/soldadura/m/${encodeURIComponent(modeloName)}`)}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: '#e3f2fd', color: '#1565c0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              }}>🔧</div>
              <div className="info">
                <h3 style={{ fontSize: 14, fontWeight: 600 }}>{modeloName}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                  {caps.length} capacidad{caps.length !== 1 ? 'es' : ''}: {capNames.join(', ')}
                </p>
                <p style={{ fontSize: 12, marginTop: 2 }}>{totalSubc} subconjuntos</p>
              </div>
              <div className="arrow">›</div>
            </div>
          )
        })}
      </div>

      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <h2>Importar desde Excel</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Formato: columnas <strong>Modelo, Cap, Linea, Marca, Cod Int Subc Completo, Cod Int Subc Parcial, Tipo, Descripcion Gral, Descripcion Subc</strong>
            </p>
            <label className="upload-zone">
              <div className="uz-icon">📄</div>
              <p>{importing ? 'Procesando...' : 'Tocá para seleccionar el Excel'}</p>
              <small>.xlsx / .xls</small>
              <input type="file" accept=".xlsx,.xls" hidden onChange={handleImport} disabled={importing} />
            </label>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-grey" onClick={() => setShowImport(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {showPdfCT && (
        <div className="modal-overlay" onClick={() => !exportandoCT && setShowPdfCT(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <h2>PDF de Ciclo y Takt Time</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Por cada modelo y capacidad: el Takt Time de cada línea y la lista de subconjuntos con su Ciclo y su tiempo normal promedio (todas las mediciones del subconjunto).
            </p>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Modelo</label>
            <select value={pdfCTModelo} onChange={e => setPdfCTModelo(e.target.value)} disabled={exportandoCT}
              style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', fontSize: 14, margin: '4px 0 16px' }}>
              <option value="">Todos los modelos</option>
              {nombresModelos.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button
              disabled={exportandoCT}
              onClick={async () => {
                setExportandoCT(true)
                try {
                  const ok = await exportarCicloTaktPDF(pdfCTModelo)
                  if (!ok) alert('No hay modelos para exportar.')
                  else setShowPdfCT(false)
                } catch (err) { alert('Error al exportar: ' + err.message) }
                setExportandoCT(false)
              }}
              style={{ width: '100%', background: exportandoCT ? '#a5c8f5' : '#1a73e8', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              {exportandoCT ? 'Generando...' : '📄 Exportar PDF'}
            </button>
          </div>
        </div>
      )}

      {showMigrar && (
        <div className="modal-overlay" onClick={() => !migrando && setShowMigrar(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <h2>Migrar modelo renombrado</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Cuando un modelo cambia de nombre en el Excel (ej: para que coincida con Tuberías), sus mediciones, Takt Time y Ciclos quedan guardados bajo el nombre viejo. Escribí el modelo viejo (aunque ya no esté en la lista de modelos, si migraste antes) y elegí a cuál nuevo migrar.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Modelo viejo (nombre exacto tal cual estaba)</label>
              <input
                type="text"
                value={migrarViejo}
                onChange={e => setMigrarViejo(e.target.value)}
                disabled={migrando}
                placeholder="Ej: WRAC 2025"
                style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginTop: 4, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Modelo nuevo (destino)</label>
              <select
                value={migrarNuevo}
                onChange={e => setMigrarNuevo(e.target.value)}
                disabled={migrando}
                style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginTop: 4 }}
              >
                <option value="">— Elegí —</option>
                {nombresModelos.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <button
              onClick={handleMigrar}
              disabled={migrando || !migrarViejo || !migrarNuevo}
              style={{
                width: '100%', background: migrando || !migrarViejo || !migrarNuevo ? '#a5c8f5' : '#1a73e8',
                color: '#fff', border: 'none', borderRadius: 8, padding: '11px 0',
                fontSize: 13, fontWeight: 700, cursor: migrando ? 'default' : 'pointer',
              }}
            >
              {migrando ? 'Migrando…' : '🔀 Migrar mediciones'}
            </button>

            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-grey" onClick={() => setShowMigrar(false)} disabled={migrando}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
