import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase'
import Header from '../../components/Header'
import WeekCalendar from '../../components/WeekCalendar'
import { fmt } from '../../components/Timer'
import { useAuth } from '../../context/AuthContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// Piezas PP del catálogo (tuberia_bd), cargadas una sola vez por sesión
let ppCache = null

const PUESTOS = ['OMS-1', 'OMS-2', 'TJ-1', 'TJ-2', 'TJ-3', 'TJ-4', 'BLM', 'CC', 'CTDA']

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Arma las filas (una por plano) a partir de tuberia_tiempos — si se pasa
// dateFilter, cada puesto solo cuenta las mediciones de ese día puntual
// (promedios y totales recalculados sobre ese subconjunto), igual que hace
// el Resumen de Soldadura con su filtro de fecha.
function computeRows(tiemposAll, bdInfo, dateFilter) {
  return Object.entries(tiemposAll).map(([plano, tiempos]) => {
    const entries = bdInfo[plano] || []
    const titulo = entries.find(e => e.titulo)?.titulo || entries.find(e => e.codigoCano)?.codigoCano || null
    const modelos = [...new Set(
      entries.map(e => [e.modelo, e.cap].filter(Boolean).join(' ')).filter(Boolean)
    )]
    const puestosConDatos = []
    const puestoAvgs = {}
    let totalMeds = 0
    let sumObs = 0
    for (const p of PUESTOS) {
      let meds = tiempos[p]?.mediciones || []
      if (dateFilter) meds = meds.filter(m => m.fecha && toDateStr(new Date(m.fecha)) === dateFilter)
      if (!meds.length) continue
      puestosConDatos.push(p)
      puestoAvgs[p] = Math.round(meds.reduce((a, m) => a + m.tiempoObs, 0) / meds.length)
      totalMeds += meds.length
      sumObs += meds.reduce((a, m) => a + m.tiempoObs, 0)
    }
    return { plano, titulo, modelos, puestosConDatos, puestoAvgs, totalMeds, avgObs: totalMeds > 0 ? Math.round(sumObs / totalMeds) : 0 }
  }).filter(r => r.totalMeds > 0).sort((a, b) => Number(a.plano) - Number(b.plano))
}

// Promedio de velocidad de un puesto — solo entre las mediciones que la
// tienen cargada (campo nuevo, las mediciones viejas no la tienen).
// Una fila por plano y máquina con el promedio de sus mediciones (para exportar
// "solo promedios"). Respeta el día elegido y, si hay una pestaña de máquina
// activa, solo esa máquina. Ordenado por plano (como el resto del resumen).
function filasPromedio(rows, tiemposAll, dateFilter, maqFilter) {
  const out = []
  for (const r of rows) {
    for (const puesto of PUESTOS) {
      if (maqFilter && maqFilter !== 'todas' && puesto !== maqFilter) continue
      let meds = tiemposAll[r.plano]?.[puesto]?.mediciones || []
      if (dateFilter) meds = meds.filter(m => m.fecha && toDateStr(new Date(m.fecha)) === dateFilter)
      if (!meds.length) continue
      const avg = Math.round(meds.reduce((a, m) => a + m.tiempoObs, 0) / meds.length)
      const fechas = meds.filter(m => m.fecha).map(m => new Date(m.fecha)).sort((a, b) => a - b)
      const f = d => d.toLocaleDateString('es-AR')
      const fecha = !fechas.length ? '-' : f(fechas[0]) === f(fechas[fechas.length - 1]) ? f(fechas[0]) : `${f(fechas[0])} – ${f(fechas[fechas.length - 1])}`
      out.push({
        plano: r.plano, titulo: r.titulo || '-', equipos: r.modelos.join(' / ') || '-', puesto,
        n: meds.length, avg, vel: promVelPuesto(meds), fecha,
      })
    }
  }
  return out
}

function promVelPuesto(meds) {
  const conVel = (meds || []).filter(m => m.velocidad != null)
  if (!conVel.length) return null
  return Math.round(conVel.reduce((a, m) => a + m.velocidad, 0) / conVel.length)
}

const IconTriangle = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 3v18h18L3 3z"/>
  </svg>
)

export default function TuberiasTiempos() {
  const navigate = useNavigate()
  const { isProduccion } = useAuth()
  const [tiemposAll, setTiemposAll] = useState({})
  const [bdInfo, setBdInfo] = useState({})
  const [search, setSearch] = useState('')
  const [maqFilter, setMaqFilter] = useState('todas')
  const [selectedDate, setSelectedDate] = useState(null)
  const [soloPromedios, setSoloPromedios] = useState(false) // exportar una fila por plano y máquina con el promedio

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'tuberia_tiempos'), async snap => {
      const data = {}
      const planos = []
      snap.docs.forEach(d => {
        data[d.id] = d.data()
        planos.push(d.id)
      })
      setTiemposAll(data)

      if (!planos.length) return
      const info = {}
      const agregar = item => {
        const key = String(item.plano).trim()
        if (!planoSet.has(key)) return
        if (!info[key]) info[key] = []
        const entry = { titulo: item.titulo || null, codigoCano: item.codigoCano || null, modelo: item.modelo || null, cap: item.cap || null }
        if (!info[key].some(e => e.modelo === entry.modelo && e.cap === entry.cap)) info[key].push(entry)
      }
      const planoSet = new Set(planos.map(x => String(x).trim()))
      // 1) Todas las piezas PP en una sola consulta (la misma que usan Cobertura y el
      //    Tablero, que sabemos que anda); se guarda en memoria para no repetirla.
      try {
        if (!ppCache) ppCache = (await getDocs(query(collection(db, 'tuberia_bd'), where('pieza', '==', 'PP')))).docs.map(d => d.data())
        ppCache.forEach(item => { if (item.plano != null) agregar(item) })
      } catch { /* se prueba con la búsqueda por plano de abajo */ }
      // 2) Los planos que siguen sin datos se buscan puntualmente (como texto y como número,
      //    por si alguna importación vieja guardó el plano distinto).
      const faltan = planos.filter(x => !info[String(x).trim()])
      const consultas = []
      for (let i = 0; i < faltan.length; i += 30) {
        const chunk = faltan.slice(i, i + 30)
        consultas.push(chunk)
        const nums = chunk.filter(x => /^\d+$/.test(x)).map(Number)
        if (nums.length) consultas.push(nums)
      }
      for (const chunk of consultas) {
        let snapBd
        try { snapBd = await getDocs(query(collection(db, 'tuberia_bd'), where('plano', 'in', chunk))) } catch { continue }
        snapBd.docs.forEach(d => { const item = d.data(); if (item.plano != null) agregar(item) })
      }
      setBdInfo(info)
    }, () => {})
    return unsub
  }, [])

  // rowsAllTime decide qué pestañas de máquina se muestran (siempre todo el
  // historial); rows es lo que realmente se lista/exporta, recalculado sobre
  // el día elegido en el calendario si hay uno — mismo patrón que usa el
  // Resumen de Soldadura.
  const rowsAllTime = computeRows(tiemposAll, bdInfo, null)
  const rows = selectedDate ? computeRows(tiemposAll, bdInfo, selectedDate) : rowsAllTime

  const searched = !search ? rows : rows.filter(r =>
    `${r.plano} ${r.titulo || ''} ${r.modelos.join(' ')}`.toLowerCase().includes(search.toLowerCase())
  )

  const filtered = maqFilter === 'todas' ? searched : searched.filter(r => r.puestosConDatos.includes(maqFilter))

  const puestosVisibles = PUESTOS.filter(p => rowsAllTime.some(r => r.puestosConDatos.includes(p)))
  const puestoCounts = {}
  puestosVisibles.forEach(p => { puestoCounts[p] = rows.filter(r => r.puestosConDatos.includes(p)).length })

  // Cuántos planos distintos tuvieron al menos una medición en cada día —
  // para los puntitos verdes del calendario.
  const countByDate = {}
  Object.values(tiemposAll).forEach(tiempos => {
    const diasDeEstePlano = new Set()
    PUESTOS.forEach(p => {
      (tiempos[p]?.mediciones || []).forEach(m => {
        if (m.fecha) diasDeEstePlano.add(toDateStr(new Date(m.fecha)))
      })
    })
    diasDeEstePlano.forEach(ds => { countByDate[ds] = (countByDate[ds] || 0) + 1 })
  })

  function exportPDFPromedios() {
    const pdf = new jsPDF({ orientation: 'landscape' })
    pdf.setFontSize(14)
    pdf.text('Tiempos de Producción — Tuberías (promedio por caño y máquina)', 14, 14)
    pdf.setFontSize(9)
    pdf.text(`Generado: ${new Date().toLocaleString('es-AR')}${selectedDate ? ` · Día: ${selectedDate.split('-').reverse().join('/')}` : ''}${maqFilter !== 'todas' ? ` · Máquina: ${maqFilter}` : ''}`, 14, 20)
    const filas = filasPromedio(filtered, tiemposAll, selectedDate, maqFilter)
    autoTable(pdf, {
      startY: 26,
      head: [['Plano', 'Título', 'Equipos', 'Máquina', 'Med.', 'Tiempo prom.', 'Vel. prom.', 'Fecha']],
      body: filas.map(x => [x.plano, x.titulo, x.equipos, x.puesto, x.n, fmt(x.avg), x.vel != null ? `${x.vel}%` : '-', x.fecha]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [26, 115, 232], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 14 }, 1: { cellWidth: 55 }, 2: { cellWidth: 80 }, 3: { cellWidth: 18 },
        4: { cellWidth: 10 }, 5: { cellWidth: 24, fontStyle: 'bold' }, 6: { cellWidth: 16 }, 7: { cellWidth: 32 },
      },
    })
    const hoy = new Date()
    const fechaStr = `${String(hoy.getDate()).padStart(2,'0')}-${String(hoy.getMonth()+1).padStart(2,'0')}-${hoy.getFullYear()}`
    pdf.save(`tiempos-tuberia-promedios-${selectedDate || fechaStr}.pdf`)
  }

  function exportExcelPromedios() {
    const filas = filasPromedio(filtered, tiemposAll, selectedDate, maqFilter)
    const ws = XLSX.utils.json_to_sheet(filas.map(x => ({
      Plano: x.plano,
      Título: x.titulo,
      Equipos: x.equipos,
      Máquina: x.puesto,
      Mediciones: x.n,
      'Tiempo promedio': fmt(x.avg),
      'Tiempo promedio (s)': Math.round(x.avg) / 100,
      'Vel. promedio (%)': x.vel != null ? x.vel : '',
      Fecha: x.fecha,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Promedios')
    const hoy = new Date()
    const fechaStr = `${String(hoy.getDate()).padStart(2,'0')}-${String(hoy.getMonth()+1).padStart(2,'0')}-${hoy.getFullYear()}`
    XLSX.writeFile(wb, `tiempos-tuberia-promedios-${selectedDate || fechaStr}.xlsx`)
  }

  function exportPDF() {
    if (soloPromedios) return exportPDFPromedios()
    const pdf = new jsPDF({ orientation: 'landscape' })
    pdf.setFontSize(14)
    pdf.text('Tiempos de Producción — Tuberías', 14, 14)
    pdf.setFontSize(9)
    pdf.text(`Generado: ${new Date().toLocaleString('es-AR')}${selectedDate ? ` · Día: ${selectedDate.split('-').reverse().join('/')}` : ''}`, 14, 20)

    const promStyle = { fontStyle: 'bold', fillColor: [225, 235, 255], textColor: [0, 40, 110] }
    const body = []

    for (const r of filtered) {
      const equipos = r.modelos.join(' / ') || '-'
      const titulo = r.titulo || '-'
      const tiemposPP = tiemposAll[r.plano] || {}
      const allMeds = []

      const allVels = []
      for (const puesto of PUESTOS) {
        let meds = tiemposPP[puesto]?.mediciones || []
        if (selectedDate) meds = meds.filter(m => m.fecha && toDateStr(new Date(m.fecha)) === selectedDate)
        meds.forEach((m, i) => {
          const fecha = m.fecha ? new Date(m.fecha).toLocaleDateString('es-AR') : '-'
          const vel = m.velocidad != null ? `${m.velocidad}%` : '-'
          body.push([r.plano, titulo, equipos, puesto, i + 1, fmt(m.tiempoObs), vel, fecha])
          allMeds.push(m.tiempoObs)
          if (m.velocidad != null) allVels.push(m.velocidad)
        })
      }

      if (allMeds.length > 0) {
        const avg = Math.round(allMeds.reduce((a, b) => a + b, 0) / allMeds.length)
        const avgVel = allVels.length ? `${Math.round(allVels.reduce((a, b) => a + b, 0) / allVels.length)}%` : ''
        body.push([
          { content: `Promedio Plano ${r.plano} — ${allMeds.length} medición${allMeds.length !== 1 ? 'es' : ''}`, colSpan: 5, styles: promStyle },
          { content: fmt(avg), styles: promStyle },
          { content: avgVel, styles: promStyle },
          { content: '', styles: { fillColor: [225, 235, 255] } },
        ])
      }
    }

    autoTable(pdf, {
      startY: 26,
      head: [['Plano', 'Título', 'Equipos', 'Máquina', '#', 'Tiempo', 'Vel.', 'Fecha']],
      body,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [26, 115, 232], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 55 },
        2: { cellWidth: 92 },
        3: { cellWidth: 18 },
        4: { cellWidth: 8 },
        5: { cellWidth: 22 },
        6: { cellWidth: 14 },
        7: { cellWidth: 20 },
      },
    })

    const hoy = new Date()
    const fechaStr = `${String(hoy.getDate()).padStart(2,'0')}-${String(hoy.getMonth()+1).padStart(2,'0')}-${hoy.getFullYear()}`
    pdf.save(`tiempos-tuberia-${selectedDate || fechaStr}.pdf`)
  }

  function exportExcel() {
    if (soloPromedios) return exportExcelPromedios()
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      Plano: r.plano,
      Título: r.titulo || '-',
      Modelos: r.modelos.join(' / '),
      ...Object.fromEntries(r.puestosConDatos.map(p => {
        let meds = (tiemposAll[r.plano]?.[p]?.mediciones) || []
        if (selectedDate) meds = meds.filter(m => m.fecha && toDateStr(new Date(m.fecha)) === selectedDate)
        const avgVel = promVelPuesto(meds)
        const valor = avgVel != null ? `${fmt(r.puestoAvgs[p])} (Vel. ${avgVel}%)` : fmt(r.puestoAvgs[p])
        return [p, valor]
      })),
      'Total Mediciones': r.totalMeds,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tiempos')
    const hoy2 = new Date()
    const fechaStr2 = `${String(hoy2.getDate()).padStart(2,'0')}-${String(hoy2.getMonth()+1).padStart(2,'0')}-${hoy2.getFullYear()}`
    XLSX.writeFile(wb, `tiempos-tuberia-${selectedDate || fechaStr2}.xlsx`)
  }

  return (
    <div className="app">
      <Header title="Resumen Tiempos" back="/tuberias" />

      <div className="search-bar" style={{ top: 56 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar plano o modelo..." />
      </div>

      <div className="tabs">
        <button className={`tab${maqFilter === 'todas' ? ' active' : ''}`} onClick={() => setMaqFilter('todas')}>
          Todas ({rows.length})
        </button>
        {puestosVisibles.map(p => (
          <button key={p} className={`tab${maqFilter === p ? ' active' : ''}`} onClick={() => setMaqFilter(p)}>
            {p} ({puestoCounts[p]})
          </button>
        ))}
      </div>

      <div className="content">
        <WeekCalendar selectedDate={selectedDate} onSelect={d => setSelectedDate(d === selectedDate ? null : d)} countByDate={countByDate} />
        {selectedDate && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6, marginBottom: 8 }}>
            <button className="btn btn-sm" onClick={() => setSelectedDate(null)} style={{ background: '#eee', color: '#555' }}>
              × Ver todo el historial
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Exportar:</span>
          {[[false, 'Todas las mediciones'], [true, 'Solo promedios']].map(([v, t]) => (
            <button key={t} onClick={() => setSoloPromedios(v)} style={{
              padding: '5px 12px', borderRadius: 16, border: '1.5px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              borderColor: soloPromedios === v ? '#1a73e8' : '#d0d0d0', background: soloPromedios === v ? '#1a73e8' : '#fff', color: soloPromedios === v ? '#fff' : '#333',
            }}>{t}</button>
          ))}
        </div>
        {soloPromedios && (
          <div style={{ fontSize: 11.5, color: '#666', marginBottom: 6 }}>
            Una fila por plano y máquina con el tiempo promedio, la velocidad promedio y la cantidad de mediciones.
          </div>
        )}
        <div className="actions-bar">
          <button className="btn btn-primary btn-sm" onClick={exportPDF}>📄 PDF</button>
          {!isProduccion && <button className="btn btn-success btn-sm" onClick={exportExcel}>📊 Excel</button>}
        </div>

        {filtered.some(r => !r.modelos.length) && (
          <div style={{ fontSize: 11.5, color: '#b26a00', background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
            {filtered.filter(r => !r.modelos.length).length} plano(s) no figuran en el catálogo de Tuberías (o todavía se está cargando), por eso su Título y Equipos salen vacíos en los exports.
          </div>
        )}

        {filtered.length === 0 && (
          <div className="empty"><div className="ei">📊</div><p>Sin tiempos registrados</p></div>
        )}

        {filtered.map((r, i) => (
          <div key={i} className="card" onClick={() => navigate(`/tuberias/tiempos/${r.plano}`)}>
            {/* Icon */}
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: '#e3f2fd', color: '#0277bd',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconTriangle />
            </div>

            {/* Content */}
            <div className="info" style={{ gap: 4 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Plano {r.plano}</h3>

              {/* Models on one line separated by · */}
              {r.modelos.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
                  {r.modelos.join(' · ')}
                </p>
              )}

              {/* Per-puesto chips with time */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
                {r.puestosConDatos.map(p => (
                  <span key={p} style={{
                    fontSize: 11, background: '#e3f2fd', color: '#0277bd',
                    borderRadius: 6, padding: '3px 8px', fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace',
                    letterSpacing: 0.5,
                  }}>
                    {p}: {fmt(r.puestoAvgs[p])}
                  </span>
                ))}
              </div>
            </div>

            <div className="arrow">›</div>
          </div>
        ))}
      </div>
    </div>
  )
}
