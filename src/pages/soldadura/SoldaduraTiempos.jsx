import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { collection, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { fmt } from '../../components/Timer'
import { useAuth } from '../../context/AuthContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

function parseTakt(str) {
  if (!str) return 0
  const parts = str.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 6000 + parts[1] * 100 + parts[2]
  if (parts.length === 2) return parts[0] * 6000 + parts[1] * 100
  return 0
}

const PUESTOS_SOL = [
  'SOL-01','SOL-02','SOL-03','SOL-04','SOL-05','SOL-06',
  'SOL-07','SOL-08','SOL-09','SOL-10','SOL-11','SOL-12',
  'SOL-13','SOL-14','SOL-15','SOL-16','SOL-17','SOL-18',
  'Preformado',
]
const DAYS_ES = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB']
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

export default function SoldaduraTiempos() {
  const navigate = useNavigate()
  const location = useLocation()
  // Filtro devuelto al volver desde el detalle de un subconjunto (V291)
  const filtroPrev = location.state?.filtro
  const { isProduccion } = useAuth()
  const [modelos, setModelos] = useState([])
  const [tiemposAll, setTiemposAll] = useState({})
  const [ciclosData, setCiclosData] = useState({})
  const [taktData, setTaktData] = useState({})
  const [weekStart, setWeekStart] = useState(() => filtroPrev?.weekStart ? startOfWeek(new Date(filtroPrev.weekStart)) : startOfWeek(new Date()))
  const [selectedDate, setSelectedDate] = useState(filtroPrev?.selectedDate || null)
  const [puestoFilter, setPuestoFilter] = useState(filtroPrev?.puestoFilter || 'todos')
  const [search, setSearch] = useState(filtroPrev?.search || '')

  useEffect(() => {
    const u1 = onSnapshot(collection(db, 'soldadura_modelos'), snap => {
      setModelos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {})
    const u2 = onSnapshot(collection(db, 'soldadura_tiempos'), snap => {
      const m = {}
      snap.docs.forEach(d => { m[d.id] = d.data() })
      setTiemposAll(m)
    }, () => {})
    const u3 = onSnapshot(doc(db, 'config', 'ciclos_soldadura'), snap => {
      if (snap.exists()) setCiclosData(snap.data())
    }, () => {})
    const u4 = onSnapshot(doc(db, 'config', 'takt_soldadura'), snap => {
      if (snap.exists()) setTaktData(snap.data())
    }, () => {})
    return () => { u1(); u2(); u3(); u4() }
  }, [])

  // Grouped view: one entry per (cod, puesto) across all models, deduplicated
  const allGroups = useMemo(() => {
    const groups = new Map()

    // Build code→metadata map from soldadura_modelos
    const codeMeta = {}
    for (const modelo of modelos) {
      for (const s of (modelo.subconjuntos || [])) {
        const cod = s.codCompleto || s.codigo
        if (!codeMeta[cod]) {
          codeMeta[cod] = {
            titulo: s.descGral || s.titulo || cod,
            type: 'Completo',
            parentCode: null,
            parentTitulo: null,
          }
        }
        for (const p of (s.parciales || [])) {
          const parcialMeta = {
            titulo: p.descSubc || p.codParcial,
            type: 'Parcial',
            parentCode: cod,
            parentTitulo: s.descGral || s.titulo || cod,
          }
          if (!codeMeta[p.codParcial]) {
            codeMeta[p.codParcial] = parcialMeta
          } else {
            // Same code for completo and parcial — Firestore uses ${code}||P as key (see SoldaduraDetail)
            codeMeta[p.codParcial + '||P'] = parcialMeta
          }
        }
      }
    }

    // Build codeToModelInfo: cod → Set<JSON{modelo,cap,linea,id}>
    const codeToModelInfo = {}
    for (const modelo of modelos) {
      const modeloName = modelo.modelo || ''
      const capName = modelo.cap || ''
      const modeloId = modelo.id
      for (const s of (modelo.subconjuntos || [])) {
        const cod = s.codCompleto || s.codigo
        const linea = s.linea || ''
        if (!codeToModelInfo[cod]) codeToModelInfo[cod] = new Set()
        codeToModelInfo[cod].add(JSON.stringify({ modelo: modeloName, cap: capName, linea, id: modeloId }))
        for (const p of (s.parciales || [])) {
          const pKey = (codeMeta[p.codParcial + '||P']) ? p.codParcial + '||P' : p.codParcial
          if (!codeToModelInfo[pKey]) codeToModelInfo[pKey] = new Set()
          codeToModelInfo[pKey].add(JSON.stringify({ modelo: modeloName, cap: capName, linea, id: modeloId }))
        }
      }
    }

    // Process each unique code that has tiempos data
    const allCodes = new Set()
    for (const modelId of Object.keys(tiemposAll)) {
      for (const cod of Object.keys(tiemposAll[modelId])) {
        if (!cod.startsWith('_')) allCodes.add(cod)
      }
    }

    for (const cod of allCodes) {
      const meta = codeMeta[cod]
      if (!meta) continue

      // Derive per-field sets from model info
      const modelInfoList = codeToModelInfo[cod]
        ? Array.from(codeToModelInfo[cod]).map(s => JSON.parse(s))
        : []
      const modeloSet = new Set(modelInfoList.map(m => m.modelo).filter(Boolean))
      const capSet = new Set(modelInfoList.map(m => m.cap).filter(Boolean))
      const lineaSet = new Set(modelInfoList.map(m => m.linea).filter(Boolean))
      const modeloIdSet = new Set(modelInfoList.map(m => m.id).filter(Boolean))
      const modeloLabel = modelInfoList
        .map(m => `${m.modelo} ${m.cap}${m.linea ? ` · ${m.linea}` : ''}`.trim())
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(' / ')

      // Collect all measurements for this cod across all model docs
      // Track first modelId that actually has mediciones (for navigation)
      let dataModeloId = null
      const allMedByPuesto = {}
      for (const modelId of Object.keys(tiemposAll)) {
        const mt = tiemposAll[modelId]
        if (!mt[cod]) continue
        let hadMeds = false
        for (const puesto of PUESTOS_SOL) {
          if (!mt[cod][puesto]?.mediciones?.length) continue
          hadMeds = true
          if (!allMedByPuesto[puesto]) allMedByPuesto[puesto] = []
          allMedByPuesto[puesto].push(...mt[cod][puesto].mediciones)
        }
        if (hadMeds && !dataModeloId) dataModeloId = modelId
      }

      for (const puesto of PUESTOS_SOL) {
        const meds = allMedByPuesto[puesto] || []
        if (meds.length === 0) continue
        const gKey = `${cod}||${puesto}`
        if (!groups.has(gKey)) {
          groups.set(gKey, {
            cod, titulo: meta.titulo, parentCode: meta.parentCode,
            parentTitulo: meta.parentTitulo, type: meta.type, puesto,
            modeloLabel, modeloSet, capSet, lineaSet, modeloIdSet,
            dataModeloId,
            measurements: [],
          })
        }
        const g = groups.get(gKey)
        for (const med of meds) {
          const hash = `${med.tiempoObs}||${med.fecha}||${med.valoracion || 100}`
          if (!g.measurements.some(m => m.hash === hash)) {
            const d = med.fecha ? new Date(med.fecha) : null
            g.measurements.push({
              tiempoObs: med.tiempoObs,
              tiempoNorm: med.tiempoNorm,
              subconjuntosQty: med.subconjuntosQty || 1,
              valoracion: med.valoracion || 100,
              operario: med.operario || '',
              supervisor: med.supervisor || '',
              dateStr: d ? toDateStr(d) : null,
              fecha: med.fecha,
              hash,
            })
          }
        }
      }
    }

    return Array.from(groups.values())
      .filter(g => g.measurements.length > 0)
      .map(g => {
        const n = g.measurements.length
        const avgObs = Math.round(g.measurements.reduce((s, m) => s + m.tiempoObs, 0) / n)
        const avgNorm = Math.round(
          g.measurements.reduce((s, m) => s + (m.tiempoNorm / (m.subconjuntosQty || 1)), 0) / n
        )
        const dates = new Set(g.measurements.map(m => m.dateStr).filter(Boolean))
        return { ...g, count: n, tiempoObs: avgObs, tiempoNorm: avgNorm, dates }
      })
  }, [modelos, tiemposAll])

  // Count of unique groups per date (for calendar badges)
  const countByDate = useMemo(() => {
    const m = {}
    for (const g of allGroups) {
      for (const ds of g.dates) {
        m[ds] = (m[ds] || 0) + 1
      }
    }
    return m
  }, [allGroups])

  // Groups after date filter, with avg recomputed for that day only
  const dateFilteredGroups = useMemo(() => {
    if (!selectedDate) return allGroups
    return allGroups
      .filter(g => g.dates.has(selectedDate))
      .map(g => {
        const dayMeds = g.measurements.filter(m => m.dateStr === selectedDate)
        const n = dayMeds.length
        return {
          ...g,
          count: n,
          tiempoObs: n > 0 ? Math.round(dayMeds.reduce((s, m) => s + m.tiempoObs, 0) / n) : 0,
          tiempoNorm: n > 0 ? Math.round(dayMeds.reduce((s, m) => s + (m.tiempoNorm / (m.subconjuntosQty || 1)), 0) / n) : 0,
        }
      })
  }, [allGroups, selectedDate])

  const puestoCounts = useMemo(() => {
    const m = {}
    for (const g of dateFilteredGroups) m[g.puesto] = (m[g.puesto] || 0) + 1
    return m
  }, [dateFilteredGroups])

  const puestosConDatos = useMemo(() => {
    if (selectedDate) {
      const allPuestos = new Set(allGroups.map(g => g.puesto))
      return PUESTOS_SOL.filter(p => allPuestos.has(p))
    }
    return PUESTOS_SOL.filter(p => puestoCounts[p] > 0)
  }, [selectedDate, allGroups, puestoCounts])

  const filteredGroups = useMemo(() =>
    dateFilteredGroups
      .filter(g => puestoFilter === 'todos' || g.puesto === puestoFilter)
      .filter(g => !search || `${g.titulo} ${g.parentTitulo || ''} ${g.cod}`.toLowerCase().includes(search.toLowerCase()))
  , [dateFilteredGroups, puestoFilter, search])

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const today = toDateStr(new Date())

  function toggleDate(ds) {
    if (selectedDate === ds) { setSelectedDate(null); setPuestoFilter('todos') }
    else { setSelectedDate(ds); setPuestoFilter('todos') }
  }

  const weekLabel = (() => {
    const s = weekDays[0], e = weekDays[6]
    if (s.getMonth() === e.getMonth())
      return `${s.getDate()} – ${e.getDate()} ${MONTHS_ES[e.getMonth()]} ${e.getFullYear()}`
    return `${s.getDate()} ${MONTHS_ES[s.getMonth()]} – ${e.getDate()} ${MONTHS_ES[e.getMonth()]} ${e.getFullYear()}`
  })()

  function getCicloCs(g) {
    for (const modeloId of (g.modeloIdSet || [])) {
      const v = parseTakt(ciclosData[`${modeloId}||${g.cod}`])
      if (v > 0) return v
    }
    return 0
  }

  function getTaktCs(g) {
    for (const modeloId of (g.modeloIdSet || [])) {
      for (const linea of (g.lineaSet || [])) {
        const v = parseTakt(taktData[`${modeloId}||${linea}`])
        if (v > 0) return v
      }
    }
    return 0
  }

  // Build export rows from allGroups (deduplicated), matching PDF column format
  // Columns: Cod | Descripción | Sub.Parcial | Modelo | Cap | Línea | Puesto | T.Obs | T.Normal | Supervisor | Operario | Cant | Val% | Fecha
  // After each (Cod, Sub.Parcial, Puesto) group → Prom. summary row
  function getExportRows() {
    const sourceGroups = selectedDate
      ? allGroups.filter(g => g.dates.has(selectedDate))
      : allGroups

    const rows = []
    for (const g of sourceGroups) {
      const meds = selectedDate
        ? g.measurements.filter(m => m.dateStr === selectedDate)
        : g.measurements
      if (meds.length === 0) continue

      const exportCod = g.type === 'Parcial' ? (g.parentCode || g.cod) : g.cod
      const exportDesc = g.type === 'Parcial' ? (g.parentTitulo || g.titulo) : g.titulo
      const exportSubParcial = g.titulo
      const modeloStr = Array.from(g.modeloSet || []).join(' / ')
      const capStr = Array.from(g.capSet || []).join(' / ')
      const lineaStr = Array.from(g.lineaSet || []).join(' / ')

      const cicloCs = getCicloCs(g)
      const taktCs = getTaktCs(g)

      for (const med of meds) {
        const tNorm = Math.round(med.tiempoNorm / (med.subconjuntosQty || 1))
        rows.push({
          type: 'data',
          exportCod, exportDesc, exportSubParcial,
          modelo: modeloStr, cap: capStr, linea: lineaStr,
          puesto: g.puesto,
          tiempoObs: med.tiempoObs,
          tiempoNorm: tNorm,
          cicloCs, taktCs,
          supervisor: med.supervisor || '',
          operario: med.operario || '',
          cant: med.subconjuntosQty || 1,
          valoracion: med.valoracion || 100,
          fecha: med.fecha,
        })
      }

      const n = meds.length
      const avgObs = Math.round(meds.reduce((s, m) => s + m.tiempoObs, 0) / n)
      const avgNorm = Math.round(meds.reduce((s, m) => s + (m.tiempoNorm / (m.subconjuntosQty || 1)), 0) / n)
      rows.push({ type: 'prom', exportCod, exportDesc, puesto: g.puesto, n, avgObs, avgNorm, cicloCs, taktCs })
    }
    return rows
  }

  function exportPDF() {
    const pdf = new jsPDF({ orientation: 'landscape' })
    pdf.setFontSize(13)
    pdf.text('Tiempos de Producción – Soldadura', 14, 14)
    pdf.setFontSize(8)
    const label = selectedDate
      ? `Fecha: ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR')}`
      : 'Todos los registros'
    pdf.text(`${label} | Generado: ${new Date().toLocaleString('es-AR')}`, 14, 20)

    // Producción no puede ver la valoración del tiempo
    const rawColDefs = [
      { header: 'Cod', width: 12 },
      { header: 'Descripción', width: 24 },
      { header: 'Sub.Parcial', width: 24 },
      { header: 'Modelo', width: 20 },
      { header: 'Cap', width: 14 },
      { header: 'Línea', width: 12 },
      { header: 'Puesto', width: 13 },
      { header: 'T.Obs', width: 13 },
      { header: 'T.Normal', width: 13 },
      { header: 'Ciclo', width: 13 },
      { header: 'Takt', width: 13 },
      { header: 'Supervisor', width: 14 },
      { header: 'Operario', width: 14 },
      { header: 'Cant', width: 7 },
      { header: 'Val%', width: 9, hideFor: isProduccion },
      { header: 'Fecha', width: 14 },
    ].filter(c => !c.hideFor)

    // Escalar los anchos para que la tabla ocupe siempre todo el ancho
    // disponible de la página, sin importar cuántas columnas queden visibles.
    const MARGIN = 8
    const pageWidth = pdf.internal.pageSize.getWidth()
    const availableWidth = pageWidth - MARGIN * 2
    const totalRawWidth = rawColDefs.reduce((s, c) => s + c.width, 0)
    const scale = availableWidth / totalRawWidth
    const colDefs = rawColDefs.map(c => ({ ...c, width: c.width * scale }))
    const COLS = colDefs.length

    const body = []
    for (const r of getExportRows()) {
      if (r.type === 'data') {
        const rowValues = {
          'Cod': r.exportCod,
          'Descripción': r.exportDesc,
          'Sub.Parcial': r.exportSubParcial,
          'Modelo': r.modelo,
          'Cap': r.cap,
          'Línea': r.linea,
          'Puesto': r.puesto,
          'T.Obs': fmt(r.tiempoObs),
          'T.Normal': fmt(r.tiempoNorm),
          'Ciclo': r.cicloCs > 0 ? fmt(r.cicloCs) : '—',
          'Takt': r.taktCs > 0 ? fmt(r.taktCs) : '—',
          'Supervisor': r.supervisor,
          'Operario': r.operario,
          'Cant': r.cant,
          'Val%': `${r.valoracion}%`,
          'Fecha': r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR') : '',
        }
        body.push(colDefs.map(c => rowValues[c.header]))
      } else {
        const promStyle = { fontStyle: 'bold', fillColor: [225, 235, 255], textColor: [0, 40, 110] }
        body.push([
          { content: `Prom. ${r.exportCod} — ${r.exportDesc} (${r.n} med.)`, colSpan: 7, styles: promStyle },
          { content: fmt(r.avgObs), styles: promStyle },
          { content: fmt(r.avgNorm), styles: promStyle },
          { content: r.cicloCs > 0 ? fmt(r.cicloCs) : '—', styles: promStyle },
          { content: r.taktCs > 0 ? fmt(r.taktCs) : '—', styles: promStyle },
          ...Array(COLS - 11).fill({ content: '', styles: { fillColor: [225, 235, 255] } }),
        ])
      }
    }

    autoTable(pdf, {
      startY: 26,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: availableWidth,
      head: [colDefs.map(c => c.header)],
      body,
      styles: { fontSize: 5.5, cellPadding: 1.5 },
      headStyles: { fillColor: [26, 115, 232], fontSize: 5.8, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(colDefs.map((c, i) => [i, { cellWidth: c.width }])),
    })
    const hoy = new Date()
    const fechaHoy = `${String(hoy.getDate()).padStart(2,'0')}-${String(hoy.getMonth()+1).padStart(2,'0')}-${hoy.getFullYear()}`
    pdf.save(`tiempos-soldadura-${fechaHoy}.pdf`)
  }

  function exportExcel() {
    const sheetData = getExportRows().map(r => {
      if (r.type === 'data') {
        return {
          'Cod': r.exportCod,
          'Descripción': r.exportDesc,
          'Sub.Parcial': r.exportSubParcial,
          'Modelo': r.modelo,
          'Cap': r.cap,
          'Línea': r.linea,
          'Puesto': r.puesto,
          'T.Obs': fmt(r.tiempoObs),
          'T.Normal': fmt(r.tiempoNorm),
          'Ciclo': r.cicloCs > 0 ? fmt(r.cicloCs) : '',
          'Takt': r.taktCs > 0 ? fmt(r.taktCs) : '',
          'Supervisor': r.supervisor,
          'Operario': r.operario,
          'Cant': r.cant,
          'Val%': r.valoracion,
          'Fecha': r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR') : '',
        }
      } else {
        return {
          'Cod': `Prom. ${r.exportCod} — ${r.exportDesc} (${r.n} med.)`,
          'Descripción': '', 'Sub.Parcial': '', 'Modelo': '', 'Cap': '', 'Línea': '',
          'Puesto': r.puesto,
          'T.Obs': fmt(r.avgObs),
          'T.Normal': fmt(r.avgNorm),
          'Ciclo': r.cicloCs > 0 ? fmt(r.cicloCs) : '',
          'Takt': r.taktCs > 0 ? fmt(r.taktCs) : '',
          'Supervisor': '', 'Operario': '', 'Cant': '', 'Val%': '', 'Fecha': '',
        }
      }
    })
    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tiempos')
    const hoy2 = new Date()
    const fechaHoy2 = `${String(hoy2.getDate()).padStart(2,'0')}-${String(hoy2.getMonth()+1).padStart(2,'0')}-${hoy2.getFullYear()}`
    XLSX.writeFile(wb, `tiempos-soldadura-${fechaHoy2}.xlsx`)
  }

  return (
    <div className="app">
      <Header title="Resumen Soldadura" back="/soldadura" />

      {/* Top tab pills + export */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{
            padding: '7px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13,
          }}>⏱ Tiempos</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isProduccion && <button className="btn btn-success btn-sm" onClick={exportExcel}>📊 Excel</button>}
          <button className="btn btn-primary btn-sm" style={{ background: '#fff', color: 'var(--primary)', border: '1px solid var(--primary)' }} onClick={exportPDF}>📄 PDF</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: '#fff' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar subconjunto..."
          style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 14px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      {/* Week calendar */}
      <div style={{ padding: '10px 12px 0', background: '#fff', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button onClick={() => { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate()-7); return n }); setSelectedDate(null) }}
            style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{weekLabel}</span>
          <button onClick={() => { setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate()+7); return n }); setSelectedDate(null) }}
            style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, paddingBottom: 10 }}>
          {weekDays.map(d => {
            const ds = toDateStr(d)
            const count = countByDate[ds] || 0
            const isSelected = selectedDate === ds
            const isToday = ds === today
            return (
              <div key={ds} onClick={() => toggleDate(ds)} style={{
                borderRadius: 10, padding: '6px 2px 20px', textAlign: 'center', cursor: 'pointer',
                border: isToday && !isSelected ? '1.5px solid orange' : '1.5px solid transparent',
                background: isSelected ? 'var(--primary)' : '#f5f5f5',
                color: isSelected ? '#fff' : 'var(--text-primary)',
                transition: 'all .15s', position: 'relative', minHeight: 56,
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: isSelected ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)' }}>
                  {DAYS_ES[d.getDay()]}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{d.getDate()}</div>
                {count > 0 && (
                  <div style={{
                    position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
                    background: isSelected ? '#fff' : '#4caf50',
                    color: isSelected ? 'var(--primary)' : '#fff',
                    borderRadius: '50%', width: 18, height: 18,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                  }}>{count}</div>
                )}
              </div>
            )
          })}
        </div>

        {selectedDate && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 2px 8px' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Filtrando: {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-AR')}
            </span>
            <button onClick={() => { setSelectedDate(null); setPuestoFilter('todos') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>
              × limpiar
            </button>
          </div>
        )}
      </div>

      {/* Puesto tabs */}
      {puestosConDatos.length > 0 && (
        <div className="tabs">
          <button className={`tab${puestoFilter === 'todos' ? ' active' : ''}`} onClick={() => setPuestoFilter('todos')}>
            Todos ({dateFilteredGroups.length})
          </button>
          {puestosConDatos.map(p => (
            <button key={p} className={`tab${puestoFilter === p ? ' active' : ''}`} onClick={() => setPuestoFilter(p)}>
              {p} ({puestoCounts[p] || 0})
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      <div className="content" style={{ paddingTop: 0 }}>
        {filteredGroups.length === 0 && (
          <div className="empty"><div className="ei">📊</div><p>Sin tiempos registrados</p></div>
        )}
        {filteredGroups.map((g) => {
          const detailUrl = g.dataModeloId
            ? `/soldadura/${encodeURIComponent(g.dataModeloId)}/${g.cod}`
            : null
          const cicloCs = getCicloCs(g)
          const taktCs = getTaktCs(g)
          const overCiclo = cicloCs > 0 && g.tiempoNorm > cicloCs
          const overTakt = taktCs > 0 && g.tiempoNorm > taktCs
          return (
          <div key={`${g.cod}||${g.puesto}`}
            onClick={() => detailUrl && navigate(detailUrl, { state: { from: '/soldadura/tiempos', filtro: { selectedDate, weekStart: weekStart.toISOString(), puestoFilter, search } } })}
            style={{
            background: '#fff', borderRadius: 12, marginBottom: 10,
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            display: 'flex', alignItems: 'center', padding: '12px 14px', gap: 12,
            cursor: detailUrl ? 'pointer' : 'default',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10, flexShrink: 0,
              background: g.type === 'Parcial' ? '#ede7f6' : '#e8f5e9',
              color: g.type === 'Parcial' ? '#512da8' : '#2e7d32',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>🔧</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.parentTitulo || g.titulo}
              </div>
              {g.type === 'Parcial' && g.titulo !== g.parentTitulo && (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {g.titulo}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>
                {g.parentCode ? `${g.parentCode} · ` : ''}{g.cod} · {g.type}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.modeloLabel}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{
                  background: '#e3f2fd', color: '#1565c0',
                  borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                }}>
                  {g.puesto}: {fmt(g.tiempoObs)}
                </span>
                <span style={{
                  background: '#f3e5f5', color: '#6a1b9a',
                  borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                }}>
                  T.N: {fmt(g.tiempoNorm)}
                </span>
                {cicloCs > 0 && (
                  <span style={{
                    background: overCiclo ? '#ffebee' : '#e8f5e9',
                    color: overCiclo ? '#c62828' : '#2e7d32',
                    borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                  }}>
                    Ciclo: {fmt(cicloCs)}
                  </span>
                )}
                {taktCs > 0 && (
                  <span style={{
                    background: overTakt ? '#fff3e0' : '#e3f2fd',
                    color: overTakt ? '#e65100' : '#0277bd',
                    borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                  }}>
                    Takt: {fmt(taktCs)}
                  </span>
                )}
                <span style={{
                  background: '#f5f5f5', color: '#757575',
                  borderRadius: 20, padding: '3px 10px', fontSize: 11,
                }}>
                  {g.count} med.
                </span>
              </div>
            </div>
          </div>
        )})}
      </div>
    </div>
  )
}
