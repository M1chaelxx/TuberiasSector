import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, deleteField } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import * as XLSX from 'xlsx'

function fmt(cs) {
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(c).padStart(2, '0')}`
}

function parseTakt(str) {
  if (!str) return 0
  const parts = str.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 6000 + parts[1] * 100 + parts[2]
  if (parts.length === 2) return parts[0] * 6000 + parts[1] * 100
  return 0
}

function TabPill({ id, label, active, onClick }) {
  return (
    <button onClick={() => onClick(id)} style={{
      flexShrink: 0, padding: '8px 20px', borderRadius: 20, border: '1.5px solid',
      borderColor: active ? 'var(--primary)' : '#d0d0d0',
      background: active ? 'var(--primary)' : '#fff',
      color: active ? '#fff' : 'var(--text-primary)',
      fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{label}</button>
  )
}

// ── Takt Time tab ─────────────────────────────────────────────────────────────
function TaktTab({ modelos, savedTakt, readOnly }) {
  const [inputs, setInputs] = useState({})
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  const entries = useMemo(() => {
    const result = []
    for (const m of modelos) {
      const lines = [...new Set((m.subconjuntos || []).map(s => s.linea).filter(Boolean))].sort()
      if (!lines.length) continue
      for (const linea of lines) {
        result.push({ key: `${m.id}||${linea}`, linea, modeloName: m.modelo || m.id, cap: m.cap || m.id })
      }
    }
    return result
  }, [modelos])

  const byModelo = useMemo(() => {
    const map = {}
    for (const e of entries) {
      if (!map[e.modeloName]) map[e.modeloName] = []
      map[e.modeloName].push(e)
    }
    return map
  }, [entries])

  function handleInput(key, raw) {
    const val = raw.replace(/[^0-9]/g, '')
    setInputs(p => ({ ...p, [key]: val }))
    setSavedOk(false)
  }

  function previewCs(key) {
    return parseInt(inputs[key] || '0', 10) * 100
  }

  const hasChanges = Object.values(inputs).some(v => v !== '')

  async function handleSave() {
    setSaving(true)
    try {
      const updates = {}
      for (const [key, sec] of Object.entries(inputs)) {
        if (!sec) continue
        updates[key] = fmt(parseInt(sec, 10) * 100)
      }
      if (!Object.keys(updates).length) return
      await setDoc(doc(db, 'config', 'takt_soldadura'), { ...savedTakt, ...updates })
      setSavedOk(true)
      setInputs({})
      setTimeout(() => setSavedOk(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  if (entries.length === 0) {
    return (
      <div className="empty" style={{ paddingTop: 60 }}>
        <div className="ei">⏱</div>
        <p>No hay modelos con líneas configuradas</p>
      </div>
    )
  }

  return (
    <div className="content" style={{ paddingTop: 8 }}>
      {Object.entries(byModelo).map(([modeloName, items]) => (
        <div key={modeloName} className="detail-section" style={{ marginBottom: 12 }}>
          <div className="section-header" style={{ fontSize: 11 }}>{modeloName}</div>
          {items.map((item, idx) => {
            const cs = previewCs(item.key)
            const currentCs = parseTakt(savedTakt[item.key] || '')
            const inputVal = inputs[item.key] ?? ''
            return (
              <div key={item.key} style={{
                padding: '10px 16px', borderBottom: '1px solid #e8e8e8',
                background: idx % 2 === 0 ? '#fff' : '#f6f8fa',
                display: 'flex', gap: 12, alignItems: 'center',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{item.cap}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                      background: item.linea === 'ODU' ? '#e3f2fd' : item.linea === 'IDU' ? '#f3e5f5' : '#e8f5e9',
                      color: item.linea === 'ODU' ? '#1565c0' : item.linea === 'IDU' ? '#6a1b9a' : '#2e7d32',
                    }}>{item.linea}</span>
                    <span style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>
                      {currentCs ? fmt(currentCs) : '—'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <input
                    type="number" min="0" placeholder="seg"
                    value={inputVal}
                    onChange={e => !readOnly && handleInput(item.key, e.target.value)}
                    disabled={readOnly}
                    style={{
                      width: 72, textAlign: 'center', padding: '6px 8px',
                      borderRadius: 6, border: `1.5px solid ${inputVal ? 'var(--primary)' : '#d0d0d0'}`,
                      fontSize: 13, outline: 'none', opacity: readOnly ? 0.5 : 1,
                    }}
                  />
                  <div style={{
                    fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                    color: cs ? 'var(--primary)' : '#bbb', letterSpacing: 0.5,
                  }}>
                    {cs ? fmt(cs) : '––:––:––'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {!readOnly && (
        <div style={{ padding: '4px 16px 24px' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', fontSize: 15, padding: '12px 0', borderRadius: 10 }}
            onClick={handleSave}
            disabled={saving || !hasChanges}
          >
            {saving ? 'Guardando…' : savedOk ? '✅ Guardado' : '💾 Guardar Takt Time'}
          </button>
          {!hasChanges && !savedOk && (
            <p style={{ textAlign: 'center', fontSize: 12, color: '#aaa', margin: '8px 0 0' }}>
              Ingresá los segundos para cada línea que querés actualizar
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Ciclos tab ────────────────────────────────────────────────────────────────
function CiclosTab({ modelos, savedCiclos, savedTakt, readOnly, isAdmin }) {
  const [selectedModeloName, setSelectedModeloName] = useState('')
  const [selectedDocId, setSelectedDocId] = useState('')
  const [inputs, setInputs] = useState({})
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deletingModelo, setDeletingModelo] = useState(false)
  const importRef = useRef()

  const modeloNames = useMemo(() => [...new Set(modelos.map(m => m.modelo || m.id))].sort(), [modelos])
  const capsForModelo = modelos.filter(m => (m.modelo || m.id) === selectedModeloName)
  const selectedDoc = modelos.find(m => m.id === selectedDocId) || null

  useEffect(() => {
    if (modelos.length && !selectedModeloName) {
      const first = modelos[0]
      setSelectedModeloName(first.modelo || first.id)
      setSelectedDocId(first.id)
    }
  }, [modelos])

  // Cuando un Parcial comparte el mismo código que su Completo (ej: SC069
  // "Pref. Salida Evaporadora" completo y SC069 "Salida Evaporadora" parcial),
  // usamos la misma clave "||P" que ya usan las mediciones para no pisar el
  // ciclo de uno con el del otro.
  const subconjuntos = useMemo(() => {
    if (!selectedDoc) return []
    const items = []
    for (const s of (selectedDoc.subconjuntos || [])) {
      if (!s.codCompleto) continue
      items.push({ code: s.codCompleto, desc: s.descGral || s.codCompleto, tipo: 'Completo', storageKey: s.codCompleto })
      for (const p of (s.parciales || [])) {
        if (!p.codParcial) continue
        const compartido = p.codParcial === s.codCompleto
        items.push({
          code: p.codParcial, desc: p.descSubc || p.codParcial, tipo: 'Parcial',
          storageKey: compartido ? `${p.codParcial}||P` : p.codParcial,
        })
      }
    }
    return items
  }, [selectedDoc])

  function getKey(storageKey) {
    return `${selectedDocId}||${storageKey}`
  }

  function handleInput(storageKey, raw) {
    const val = raw.replace(/[^0-9]/g, '')
    setInputs(p => ({ ...p, [storageKey]: val }))
    setSavedOk(false)
  }

  const hasChanges = Object.values(inputs).some(v => v !== '')

  async function handleSave() {
    setSaving(true)
    try {
      const updates = {}
      for (const [storageKey, sec] of Object.entries(inputs)) {
        if (!sec) continue
        updates[getKey(storageKey)] = fmt(parseInt(sec, 10) * 100)
      }
      if (!Object.keys(updates).length) return
      await setDoc(doc(db, 'config', 'ciclos_soldadura'), { ...savedCiclos, ...updates })
      setSavedOk(true)
      setInputs({})
      setTimeout(() => setSavedOk(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  async function handleImportCiclos(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const sheetName = wb.SheetNames.find(n => /hoja\s*2/i.test(n))
        || wb.SheetNames[1]
        || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
      if (!rows.length) { alert(`Hoja "${sheetName}" vacía`); return }

      // Normalized column lookup (handles extra spaces, different case)
      function col(row, ...names) {
        const keys = Object.keys(row)
        for (const name of names) {
          if (row[name] !== undefined) return row[name]
          const norm = name.toLowerCase().replace(/\s+/g, ' ').trim()
          const found = keys.find(k => k.toLowerCase().replace(/\s+/g, ' ').trim() === norm)
          if (found !== undefined) return row[found]
        }
        return ''
      }

      const updates = {}
      let skipped = 0
      for (const row of rows) {
        const modeloExcel = String(col(row, 'Modelo', 'modelo') || '').trim()
        const capExcel = String(col(row, 'Cap', 'cap', 'Capacidad') || '').trim()
        const tipo = String(col(row, 'Tipo', 'tipo') || '').trim()
        const tStdRaw = col(row, 'TStd', 'tStd', 'TSTD', 'Tstd')
        const tStd = parseFloat(String(tStdRaw).replace(',', '.')) || 0
        if (!modeloExcel || !tStd) continue
        // Find the real Firestore docId from loaded modelos (avoids key mismatch)
        const matchDoc = modelos.find(m =>
          (m.modelo || m.id).toLowerCase().trim() === modeloExcel.toLowerCase() &&
          (m.cap || '').toLowerCase().trim() === capExcel.toLowerCase()
        )
        if (!matchDoc) { skipped++; continue }
        const docId = matchDoc.id
        const cs = Math.round(tStd * 100)
        const codCompletoRow = String(col(row, 'Cod Int Subc Completo', 'codCompleto') || '').trim()
        let code = ''
        let storageKey = ''
        if (tipo === 'Completo') {
          code = codCompletoRow
          storageKey = code
        } else if (tipo === 'Parcial') {
          code = String(col(row, 'Cod Int Subc Parcial', 'codParcial') || '').trim()
          // Mismo criterio que en la UI: si el Parcial comparte código con su
          // Completo, se guarda bajo "||P" para no pisar el ciclo del Completo.
          storageKey = (code && code === codCompletoRow) ? `${code}||P` : code
        }
        if (!code) continue
        updates[`${docId}||${storageKey}`] = fmt(cs)
      }
      const count = Object.keys(updates).length
      if (!count) {
        alert(`Sin filas válidas en hoja "${sheetName}" (${rows.length} filas leídas, ${skipped} sin modelo/cap coincidente en la app)`)
        return
      }
      await setDoc(doc(db, 'config', 'ciclos_soldadura'), updates, { merge: true })
      alert(`✅ Importados ${count} ciclos desde "${sheetName}"${skipped ? ` (${skipped} filas sin coincidencia ignoradas)` : ''}`)
    } catch (err) {
      alert('Error al importar: ' + err.message)
    }
    setImporting(false)
    if (e.target) e.target.value = ''
  }

  async function handleDeleteCiclo(item) {
    if (!confirm(`¿Borrar el ciclo guardado de "${item.code}"?`)) return
    await updateDoc(doc(db, 'config', 'ciclos_soldadura'), { [getKey(item.storageKey)]: deleteField() })
  }

  async function handleDeleteAllCiclos() {
    const conDatos = subconjuntos.filter(item => savedCiclos[getKey(item.storageKey)])
    if (conDatos.length === 0) { alert('No hay ciclos guardados para esta capacidad'); return }
    if (!confirm(`¿Borrar los ${conDatos.length} ciclos guardados de "${selectedDoc?.cap || selectedDocId}"?\n\nEsto no se puede deshacer.`)) return
    const updates = {}
    for (const item of conDatos) updates[getKey(item.storageKey)] = deleteField()
    await updateDoc(doc(db, 'config', 'ciclos_soldadura'), updates)
  }

  async function handleDeleteModeloCap() {
    if (!selectedDoc) return
    const label = `${selectedDoc.modelo || selectedDoc.id} · ${selectedDoc.cap || ''}`
    if (!confirm(
      `¿Eliminar por completo "${label}"?\n\n` +
      `Esto borra el modelo+capacidad de Soldadura junto con sus mediciones de tiempo, fotos, ciclos y Takt Time guardados.\n\n` +
      `No se puede deshacer.`
    )) return
    setDeletingModelo(true)
    try {
      const docId = selectedDocId
      await deleteDoc(doc(db, 'soldadura_modelos', docId))
      await deleteDoc(doc(db, 'soldadura_tiempos', docId)).catch(() => {})

      const ciclosUpdates = {}
      for (const key of Object.keys(savedCiclos)) {
        if (key.startsWith(`${docId}||`)) ciclosUpdates[key] = deleteField()
      }
      if (Object.keys(ciclosUpdates).length) {
        await updateDoc(doc(db, 'config', 'ciclos_soldadura'), ciclosUpdates)
      }

      const taktUpdates = {}
      for (const key of Object.keys(savedTakt || {})) {
        if (key.startsWith(`${docId}||`)) taktUpdates[key] = deleteField()
      }
      if (Object.keys(taktUpdates).length) {
        await updateDoc(doc(db, 'config', 'takt_soldadura'), taktUpdates)
      }

      alert(`✅ "${label}" eliminado por completo.`)
      setSelectedModeloName('')
      setSelectedDocId('')
      setInputs({})
    } catch (err) {
      alert('Error al eliminar: ' + err.message)
    }
    setDeletingModelo(false)
  }

  function handleModeloChange(name) {
    setSelectedModeloName(name)
    setInputs({})
    const caps = modelos.filter(m => (m.modelo || m.id) === name)
    if (caps.length) setSelectedDocId(caps[0].id)
    else setSelectedDocId('')
  }

  function handleCapChange(docId) {
    setSelectedDocId(docId)
    setInputs({})
  }

  const selectStyle = {
    flex: 1, padding: '8px 10px', borderRadius: 8,
    border: '1.5px solid #e0e0e0', fontSize: 14, background: '#fff', outline: 'none',
  }

  return (
    <>
      <div style={{ padding: '10px 12px 6px', display: 'flex', gap: 8 }}>
        <select value={selectedModeloName} onChange={e => handleModeloChange(e.target.value)} style={selectStyle}>
          <option value="">— Modelo —</option>
          {modeloNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={selectedDocId} onChange={e => handleCapChange(e.target.value)} disabled={!selectedModeloName} style={{ ...selectStyle, opacity: selectedModeloName ? 1 : 0.45 }}>
          <option value="">— Cap —</option>
          {capsForModelo.map(c => <option key={c.id} value={c.id}>{c.cap || c.id}</option>)}
        </select>
        {isAdmin && !readOnly && selectedDoc && (
          <button
            onClick={handleDeleteModeloCap}
            disabled={deletingModelo}
            title="Eliminar este modelo y capacidad por completo"
            style={{
              flexShrink: 0, background: '#ffebee', color: '#c62828', border: '1px solid #ef9a9a',
              borderRadius: 8, padding: '0 12px', fontSize: 13, cursor: deletingModelo ? 'default' : 'pointer',
            }}
          >
            {deletingModelo ? '…' : '🗑'}
          </button>
        )}
      </div>

      {isAdmin && !readOnly && (
        <div style={{ padding: '0 12px 8px', display: 'flex', gap: 8 }}>
          <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportCiclos} disabled={importing} />
          <button
            className="btn btn-outline btn-sm"
            style={{ flex: 1 }}
            onClick={() => importRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'Importando…' : '📥 Importar desde Excel'}
          </button>
          {selectedDoc && (
            <button
              className="btn btn-outline btn-sm"
              style={{ flexShrink: 0, color: '#c62828', borderColor: '#ef9a9a' }}
              onClick={handleDeleteAllCiclos}
            >
              🗑 Borrar ciclos de esta cap.
            </button>
          )}
        </div>
      )}

      {!selectedDoc ? (
        <div className="empty"><div className="ei">🔄</div><p>Seleccioná un modelo</p></div>
      ) : subconjuntos.length === 0 ? (
        <div className="empty"><div className="ei">🔄</div><p>Sin subconjuntos cargados</p></div>
      ) : (
        <div className="content" style={{ paddingTop: 4 }}>
          {subconjuntos.map((item, idx) => {
            const key = getKey(item.storageKey)
            const inputVal = inputs[item.storageKey] ?? ''
            const cs = parseInt(inputVal || '0', 10) * 100
            const savedCs = parseTakt(savedCiclos[key] || '')
            const isParcial = item.tipo === 'Parcial'
            return (
              <div key={item.storageKey} style={{
                padding: '10px 16px', borderBottom: '1px solid #e8e8e8',
                background: idx % 2 === 0 ? '#fff' : '#f6f8fa',
                display: 'flex', gap: 12, alignItems: 'center',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.desc}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                      background: isParcial ? '#f3e5f5' : '#e3f2fd',
                      color: isParcial ? '#6a1b9a' : '#1565c0',
                    }}>{item.tipo}</span>
                    <span style={{ fontSize: 11, color: '#aaa' }}>{item.code}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  {/* White box: shows preview while typing, else saved value, else placeholder */}
                  <div style={{
                    width: 84, textAlign: 'center', padding: '6px 6px',
                    borderRadius: 6, border: `1.5px solid ${inputVal ? 'var(--primary)' : savedCs ? '#90caf9' : '#d0d0d0'}`,
                    background: '#fff', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                    color: inputVal ? 'var(--primary)' : savedCs ? '#1565c0' : '#bbb', letterSpacing: 0.5,
                  }}>
                    {inputVal ? fmt(cs) : savedCs ? fmt(savedCs) : '––:––:––'}
                  </div>
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number" min="0" placeholder="seg"
                        value={inputVal}
                        onChange={e => handleInput(item.storageKey, e.target.value)}
                        style={{
                          width: isAdmin && savedCs ? 66 : 84, textAlign: 'center', padding: '4px 6px',
                          borderRadius: 6, border: `1.5px solid ${inputVal ? 'var(--primary)' : '#e0e0e0'}`,
                          fontSize: 12, outline: 'none', color: '#555',
                        }}
                      />
                      {isAdmin && savedCs > 0 && (
                        <button
                          onClick={() => handleDeleteCiclo(item)}
                          title="Borrar este ciclo"
                          style={{
                            flexShrink: 0, width: 26, border: '1px solid #ef9a9a', background: '#ffebee',
                            color: '#c62828', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          }}
                        >🗑</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {!readOnly && (
            <div style={{ padding: '4px 16px 24px' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%', fontSize: 15, padding: '12px 0', borderRadius: 10 }}
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                {saving ? 'Guardando…' : savedOk ? '✅ Guardado' : '💾 Guardar Ciclos'}
              </button>
              {!hasChanges && !savedOk && (
                <p style={{ textAlign: 'center', fontSize: 12, color: '#aaa', margin: '8px 0 0' }}>
                  Ingresá los segundos para los subconjuntos que querés actualizar
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SoldaduraTaktTime() {
  const { isProduccion, isAdmin } = useAuth()
  const [modelos, setModelos] = useState([])
  const [savedTakt, setSavedTakt] = useState({})
  const [savedCiclos, setSavedCiclos] = useState({})
  const [activeTab, setActiveTab] = useState('takt')

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'soldadura_modelos'), snap => {
      setModelos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {})
    const u2 = onSnapshot(doc(db, 'config', 'takt_soldadura'), snap => {
      if (snap.exists()) setSavedTakt(snap.data())
    }, () => {})
    const u3 = onSnapshot(doc(db, 'config', 'ciclos_soldadura'), snap => {
      if (snap.exists()) setSavedCiclos(snap.data())
    }, () => {})
    return () => { u1(); u2(); u3() }
  }, [])

  return (
    <div className="app">
      <Header title="Takt Time" back="/soldadura" />

      <div style={{ display: 'flex', gap: 8, padding: '8px 12px 4px', borderBottom: '1px solid var(--border)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <TabPill id="takt" label="⏱ Takt Time" active={activeTab === 'takt'} onClick={setActiveTab} />
        <TabPill id="ciclos" label="🔄 Ciclos" active={activeTab === 'ciclos'} onClick={setActiveTab} />
      </div>

      {activeTab === 'takt' ? (
        <TaktTab modelos={modelos} savedTakt={savedTakt} readOnly={isProduccion} />
      ) : (
        <CiclosTab modelos={modelos} savedCiclos={savedCiclos} savedTakt={savedTakt} readOnly={isProduccion} isAdmin={isAdmin} />
      )}
    </div>
  )
}
