import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, addDoc, deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import WeekCalendar from '../../components/WeekCalendar'
import { useAuth } from '../../context/AuthContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'

// ── Auditoría de Tubería — Corte y Conformado (FR-AC.032) ────────────────────
// Perfil "Calidad": carga cada muestra auditada con un formulario en vez de
// escribir directo en el Excel/PDF, y exporta un PDF con el mismo formato del
// formulario oficial (mismas columnas, mismo código de documento).

// Mismas máquinas semiautomáticas que ya se usan en Tuberías (cronómetro,
// resumen, cobertura) — para que el desplegable de Máquina no se desincronice,
// si se agrega una nueva ahí hay que sumarla acá también.
const PUESTOS_TUBERIA = ['OMS-1', 'OMS-2', 'TJ-1', 'TJ-2', 'TJ-3', 'TJ-4', 'BLM', 'CC', 'CTDA']

const CHECK_FIELDS = [
  { key: 'planoPlantillaConformado', label: 'Plano Plantilla conformado' },
  { key: 'diametroInternoHolgado', label: 'Diámetro interno (Holgado)' },
  { key: 'diametroInternoAjustado', label: 'Diámetro interno (Ajustado)' },
  { key: 'virolado', label: 'Virolado' },
  { key: 'abocardado', label: 'Abocardado' },
  { key: 'reduccion', label: 'Reducción' },
  { key: 'punzonado', label: 'Punzonado' },
  { key: 'aplastamiento', label: 'Aplastamiento' },
  { key: 'estrangulamiento', label: 'Estrangulamiento (15%)' },
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function nowHHMM() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const emptyForm = {
  idControl: null,
  fecha: todayStr(),
  codigoMuestra: '',
  idPlanoPlantilla: '',
  hora: nowHHMM(),
  turno: '',
  auditor: '',
  maquina: '',
  diametroExterno: '',
  caudalMedicion: '',
  longitudPlano: '',
  longitudCorte: '',
  observaciones: '',
  planoPlantillaConformado: '',
  diametroInternoHolgado: '',
  diametroInternoAjustado: '',
  virolado: '',
  abocardado: '',
  reduccion: '',
  punzonado: '',
  aplastamiento: '',
  estrangulamiento: '',
}

const inputStyle = {
  width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '9px 10px',
  fontSize: 13, background: '#fff', boxSizing: 'border-box',
}

function OkNaSelect({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      <option value="">—</option>
      <option value="OK">OK</option>
      <option value="NOOK">NOOK</option>
      <option value="OBS">Obs.</option>
      <option value="N/A">N/A</option>
    </select>
  )
}

const RAW_COL_DEFS = [
  { header: 'ID', key: 'idControl', width: 8 },
  { header: 'Fecha', key: 'fecha', width: 14 },
  { header: 'Código de muestra', key: 'codigoMuestra', width: 22 },
  { header: 'ID - Plano Plantilla', key: 'idPlanoPlantilla', width: 16 },
  { header: 'Hora', key: 'hora', width: 10 },
  { header: 'Turno', key: 'turno', width: 8 },
  { header: 'Auditor', key: 'auditor', width: 16 },
  { header: 'Máquina', key: 'maquina', width: 14 },
  { header: 'Plano Plantilla conformado', key: 'planoPlantillaConformado', width: 15 },
  { header: 'Diámetro int. (Holgado)', key: 'diametroInternoHolgado', width: 13 },
  { header: 'Diámetro int. (Ajustado)', key: 'diametroInternoAjustado', width: 13 },
  { header: 'Diámetro externo', key: 'diametroExterno', width: 12 },
  { header: 'Virolado', key: 'virolado', width: 11 },
  { header: 'Caudal (Medición)', key: 'caudalMedicion', width: 13 },
  { header: 'Longitud según Plano', key: 'longitudPlano', width: 13 },
  { header: 'Longitud de Corte', key: 'longitudCorte', width: 13 },
  { header: 'Abocardado', key: 'abocardado', width: 11 },
  { header: 'Reducción', key: 'reduccion', width: 11 },
  { header: 'Punzonado', key: 'punzonado', width: 11 },
  { header: 'Aplastamiento', key: 'aplastamiento', width: 12 },
  { header: 'Estrangulamiento (15%)', key: 'estrangulamiento', width: 13 },
  { header: 'Observaciones', key: 'observaciones', width: 22 },
]
const FREE_KEYS = ['idControl', 'fecha', 'codigoMuestra', 'idPlanoPlantilla', 'hora', 'turno', 'auditor', 'maquina', 'diametroExterno', 'caudalMedicion', 'longitudPlano', 'longitudCorte', 'observaciones']

function celda(r, key) {
  const v = r[key]
  if (key === 'fecha') return v ? new Date(v + 'T12:00:00').toLocaleDateString('es-AR') : ''
  if (key === 'idControl') return v ? `#${v}` : ''
  return v || (FREE_KEYS.includes(key) ? '' : 'N/A')
}

// Próximo ID correlativo — uno más que el mayor ya usado en todo el
// historial (no por fecha), así cada control nuevo tiene un número único
// creciente sin importar cuándo se cargue.
function nextIdControl(registros) {
  const max = registros.reduce((m, r) => Math.max(m, r.idControl || 0), 0)
  return max + 1
}

async function uploadLogoToCloudinary(file) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('upload_preset', 'tuberia_fotos')
  fd.append('folder', 'calidad_config')
  const res = await fetch('https://api.cloudinary.com/v1_1/vgia9y4h/image/upload', { method: 'POST', body: fd })
  const data = await res.json()
  if (!data.secure_url) throw new Error(data.error?.message || 'Error Cloudinary')
  return { url: data.secure_url, public_id: data.public_id }
}

// Convierte una imagen (URL de Cloudinary) a dataURL para poder incrustarla
// en el PDF con pdf.addImage — jsPDF no puede tomar una URL remota directo.
function toDataURL(url) {
  return fetch(url)
    .then(r => r.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    }))
}

export default function CalidadAuditorias() {
  const { isCalidad, isAdmin, puedeBorrarCalidad } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState([])
  const [logo, setLogo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [filtroFecha, setFiltroFecha] = useState(todayStr())
  const [showLogoCfg, setShowLogoCfg] = useState(false)

  useEffect(() => {
    if (!isCalidad) { navigate('/'); return }
    const u1 = onSnapshot(collection(db, 'calidad_auditorias'), snap => {
      setRegistros(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }, () => setLoading(false))
    const u2 = onSnapshot(doc(db, 'config', 'calidad_logo'), snap => {
      setLogo(snap.exists() ? snap.data() : null)
    }, () => {})
    return () => { u1(); u2() }
  }, [isCalidad, navigate])

  if (!isCalidad) return null

  const registrosDelDia = registros
    .filter(r => r.fecha === filtroFecha)
    .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''))

  const countByDate = {}
  for (const r of registros) { if (r.fecha) countByDate[r.fecha] = (countByDate[r.fecha] || 0) + 1 }

  function abrirNuevo() {
    setForm({ ...emptyForm, fecha: filtroFecha, idControl: nextIdControl(registros) })
    setShowForm(true)
  }

  async function guardar() {
    if (!form.codigoMuestra.trim()) { alert('Ingresá el código de muestra'); return }
    if (!form.auditor.trim()) { alert('Ingresá el nombre del auditor'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'calidad_auditorias'), {
        ...form,
        creadoEn: serverTimestamp(),
      })
      setShowForm(false)
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    }
    setSaving(false)
  }

  async function eliminar(r) {
    if (!confirm(`¿Eliminar la muestra "${r.codigoMuestra}"?`)) return
    await deleteDoc(doc(db, 'calidad_auditorias', r.id))
  }

  async function cambiarLogo(file) {
    if (!file) return
    try {
      const { url, public_id } = await uploadLogoToCloudinary(file)
      await setDoc(doc(db, 'config', 'calidad_logo'), { url, public_id })
    } catch (err) {
      alert('Error al subir el logo: ' + err.message)
    }
  }

  async function exportarPDF() {
    const pdf = new jsPDF({ orientation: 'landscape' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const MARGIN = 8

    // Recuadro de cabecera con logo (si está configurado), título y código de documento
    const headTop = 8, headH = 16
    pdf.setDrawColor(0)
    pdf.rect(MARGIN, headTop, pageWidth - MARGIN * 2, headH)
    pdf.line(MARGIN + 48, headTop, MARGIN + 48, headTop + headH)
    pdf.line(pageWidth - MARGIN - 38, headTop, pageWidth - MARGIN - 38, headTop + headH)

    if (logo?.url) {
      try {
        const dataUrl = await toDataURL(logo.url)
        pdf.addImage(dataUrl, MARGIN + 4, headTop + 3, 40, 10, undefined, 'FAST')
      } catch { /* si falla la descarga del logo, se exporta sin él */ }
    }

    pdf.setFillColor(10, 10, 10)
    pdf.rect(MARGIN + 48, headTop, pageWidth - MARGIN * 2 - 48 - 38, headH, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(12)
    pdf.setFont(undefined, 'bold')
    pdf.text('AUDITORIA DE TUBERIA - CORTE Y CONFORMADO', pageWidth / 2 - 5, headTop + headH / 2 + 1, { align: 'center' })

    pdf.setTextColor(0, 0, 0)
    pdf.setFontSize(6.5)
    pdf.setFont(undefined, 'normal')
    pdf.text('FR-AC.032', pageWidth - MARGIN - 36, headTop + 5)
    pdf.text('REV: 01', pageWidth - MARGIN - 36, headTop + 9)
    pdf.text(`FECHA: ${new Date().toLocaleDateString('es-AR')}`, pageWidth - MARGIN - 36, headTop + 13)

    const availableWidth = pageWidth - MARGIN * 2
    const totalRawWidth = RAW_COL_DEFS.reduce((s, c) => s + c.width, 0)
    const scale = availableWidth / totalRawWidth
    const colDefs = RAW_COL_DEFS.map(c => ({ ...c, width: c.width * scale }))

    const body = registrosDelDia.map(r => colDefs.map(c => celda(r, c.key)))

    autoTable(pdf, {
      startY: headTop + headH + 4,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: availableWidth,
      head: [colDefs.map(c => c.header)],
      body,
      styles: { fontSize: 5.5, cellPadding: 1.5, halign: 'center' },
      headStyles: { fillColor: [219, 229, 239], textColor: [0, 0, 0], fontSize: 5.5, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(colDefs.map((c, i) => [i, { cellWidth: c.width, halign: c.key === 'observaciones' ? 'left' : 'center' }])),
      // OK en verde, NOOK en rojo — solo en las columnas de control (las de
      // texto libre, como Auditor u Observaciones, no se pintan aunque
      // coincida el texto por casualidad).
      didParseCell(data) {
        if (data.section !== 'body') return
        const key = colDefs[data.column.index]?.key
        if (!CHECK_FIELDS.some(f => f.key === key)) return
        if (data.cell.raw === 'OK') {
          data.cell.styles.fillColor = [232, 245, 233]
          data.cell.styles.textColor = [46, 125, 50]
          data.cell.styles.fontStyle = 'bold'
        } else if (data.cell.raw === 'NOOK') {
          data.cell.styles.fillColor = [255, 235, 238]
          data.cell.styles.textColor = [198, 40, 40]
          data.cell.styles.fontStyle = 'bold'
        } else if (data.cell.raw === 'OBS') {
          data.cell.styles.fillColor = [255, 249, 196]
          data.cell.styles.textColor = [245, 127, 23]
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })

    pdf.save(`auditoria-tuberia-${filtroFecha}.pdf`)
  }

  // Excel con el mismo look que el PDF — logo real incluido, barra de título,
  // código de documento, encabezado celeste, OK verde / NOOK rojo. Usa
  // ExcelJS en vez de xlsx-js-style porque esa no soporta incrustar imágenes;
  // ExcelJS sí, así que el logo configurado en "⚙️ Configurar logo del PDF"
  // sale igual acá que en el PDF.
  async function exportarExcel() {
    const NCOLS = RAW_COL_DEFS.length
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Auditoría')
    ws.columns = RAW_COL_DEFS.map(c => ({ width: Math.max(10, Math.round(c.width * 0.9)) }))

    const titleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A0A' } }
    const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBE5EF' } }
    const okFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } }
    const nookFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } }
    const obsFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } }
    const thinBorder = { style: 'thin', color: { argb: 'FFB0B0B0' } }
    const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

    // Fila 1: título en barra negra (deja lugar a la izquierda para el logo)
    ws.getRow(1).height = 34
    ws.mergeCells(1, 1, 1, NCOLS)
    const titleCell = ws.getCell(1, 1)
    titleCell.value = 'AUDITORIA DE TUBERIA - CORTE Y CONFORMADO'
    titleCell.fill = titleFill
    titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

    // Fila 2: código de documento
    ws.getRow(2).height = 16
    ws.mergeCells(2, 1, 2, NCOLS)
    const codeCell = ws.getCell(2, 1)
    codeCell.value = `FR-AC.032   ·   REV: 01   ·   FECHA: ${new Date().toLocaleDateString('es-AR')}`
    codeCell.font = { italic: true, size: 9, color: { argb: 'FF444444' } }
    codeCell.alignment = { horizontal: 'center' }

    // Logo real (si está configurado en config/calidad_logo) sobre la barra de título
    if (logo?.url) {
      try {
        const dataUrl = await toDataURL(logo.url)
        const [, ext] = dataUrl.match(/^data:image\/(\w+);base64,/) || [, 'png']
        const base64 = dataUrl.split(',')[1]
        const imageId = workbook.addImage({ base64, extension: ext === 'jpeg' ? 'jpeg' : ext === 'png' ? 'png' : 'png' })
        ws.addImage(imageId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 120, height: 30 } })
      } catch { /* si falla la descarga del logo, se exporta sin él */ }
    }

    // Fila 3: encabezado de columnas
    ws.getRow(3).height = 24
    const headerRow = ws.getRow(3)
    RAW_COL_DEFS.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1)
      cell.value = c.header
      cell.fill = headFill
      cell.font = { bold: true, size: 9 }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = border
    })

    // Filas de datos, con OK/NOOK coloreados igual que en el PDF
    const checkKeys = new Set(CHECK_FIELDS.map(f => f.key))
    registrosDelDia.forEach((r, ri) => {
      const row = ws.getRow(4 + ri)
      RAW_COL_DEFS.forEach((c, ci) => {
        const cell = row.getCell(ci + 1)
        const isCheck = checkKeys.has(c.key)
        const val = r[c.key]
        cell.value = celda(r, c.key)
        cell.border = border
        cell.font = { size: 9 }
        cell.alignment = { horizontal: c.key === 'observaciones' ? 'left' : 'center' }
        if (isCheck && val === 'OK') { cell.fill = okFill; cell.font = { size: 9, bold: true, color: { argb: 'FF2E7D32' } } }
        else if (isCheck && val === 'NOOK') { cell.fill = nookFill; cell.font = { size: 9, bold: true, color: { argb: 'FFC62828' } } }
        else if (isCheck && val === 'OBS') { cell.fill = obsFill; cell.font = { size: 9, bold: true, color: { argb: 'FFF57F17' } } }
      })
    })

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auditoria-tuberia-${filtroFecha}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <Header title="Calidad — Auditoría de Tubería" back="/calidad" />

      <div className="content">
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={abrirNuevo}>
          + Nueva muestra auditada
        </button>

        <WeekCalendar selectedDate={filtroFecha} onSelect={setFiltroFecha} countByDate={countByDate} />

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={exportarPDF} disabled={!registrosDelDia.length} style={{
            background: registrosDelDia.length ? '#e3f2fd' : '#f0f0f0', color: registrosDelDia.length ? '#1565c0' : '#aaa',
            border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700,
            cursor: registrosDelDia.length ? 'pointer' : 'default', whiteSpace: 'nowrap',
          }}>
            📄 Exportar PDF
          </button>
          <button onClick={exportarExcel} disabled={!registrosDelDia.length} style={{
            background: registrosDelDia.length ? '#e8f5e9' : '#f0f0f0', color: registrosDelDia.length ? '#2e7d32' : '#aaa',
            border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 700,
            cursor: registrosDelDia.length ? 'pointer' : 'default', whiteSpace: 'nowrap',
          }}>
            📊 Exportar Excel
          </button>
        </div>

        {isAdmin && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setShowLogoCfg(o => !o)} style={{
              background: 'none', border: 'none', color: '#1565c0', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0,
            }}>
              ⚙️ {showLogoCfg ? 'Ocultar' : 'Configurar'} logo del PDF
            </button>
            {showLogoCfg && (
              <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 12, marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                {logo?.url
                  ? <img src={logo.url} alt="Logo" style={{ height: 32, objectFit: 'contain' }} />
                  : <span style={{ fontSize: 12, color: '#999' }}>Sin logo configurado</span>}
                <label style={{ background: '#e3f2fd', color: '#1565c0', borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {logo?.url ? 'Reemplazar' : 'Subir logo'}
                  <input type="file" accept="image/*" hidden onChange={e => cambiarLogo(e.target.files?.[0])} />
                </label>
              </div>
            )}
          </div>
        )}

        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && registrosDelDia.length === 0 && (
          <div className="empty"><div className="ei">📋</div><p>Sin muestras auditadas para esta fecha.</p></div>
        )}

        {registrosDelDia.map(r => (
          <div key={r.id} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {r.idControl && <span style={{ color: '#1565c0' }}>#{r.idControl} · </span>}
                  {r.codigoMuestra} <span style={{ fontWeight: 400, color: '#888' }}>· {r.idPlanoPlantilla}</span>
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{r.hora} · Turno {r.turno || '—'} · {r.auditor} · {r.maquina}</div>
              </div>
              {puedeBorrarCalidad && (
                <button onClick={() => eliminar(r)} style={{ background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {CHECK_FIELDS.map(f => r[f.key] && (
                <span key={f.key} style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                  background: r[f.key] === 'OK' ? '#e8f5e9' : r[f.key] === 'NOOK' ? '#ffebee' : r[f.key] === 'OBS' ? '#fff9c4' : '#f5f5f5',
                  color: r[f.key] === 'OK' ? '#2e7d32' : r[f.key] === 'NOOK' ? '#c62828' : r[f.key] === 'OBS' ? '#f57f17' : '#999',
                }}>{f.label.split(' ')[0]}: {r[f.key]}</span>
              ))}
            </div>
            {r.observaciones && <div style={{ fontSize: 11, color: '#666', marginTop: 6, fontStyle: 'italic' }}>{r.observaciones}</div>}
          </div>
        ))}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="modal-drag" />
            <h2>Nueva muestra auditada</h2>
            <div style={{ display: 'inline-block', background: '#e3f2fd', color: '#1565c0', borderRadius: 6, padding: '3px 10px', fontSize: 12.5, fontWeight: 700, marginBottom: 10 }}>
              ID #{form.idControl}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
              <div className="modal-field"><label>Fecha</label><input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} disabled={saving} /></div>
              <div className="modal-field"><label>Hora</label><input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} disabled={saving} /></div>
            </div>
            <div className="modal-field"><label>Código de muestra*</label><input value={form.codigoMuestra} onChange={e => setForm({ ...form, codigoMuestra: e.target.value })} placeholder="Ej: 10101001A00024" disabled={saving} /></div>
            <div className="modal-field"><label>ID - Plano Plantilla</label><input value={form.idPlanoPlantilla} onChange={e => setForm({ ...form, idPlanoPlantilla: e.target.value })} placeholder="Ej: 173" disabled={saving} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
              <div className="modal-field"><label>Turno</label><input value={form.turno} onChange={e => setForm({ ...form, turno: e.target.value })} placeholder="M / T / N" disabled={saving} /></div>
              <div className="modal-field">
                <label>Máquina</label>
                <select value={form.maquina} onChange={e => setForm({ ...form, maquina: e.target.value })} disabled={saving}>
                  <option value="">— Elegir —</option>
                  {PUESTOS_TUBERIA.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-field"><label>Auditor*</label><input value={form.auditor} onChange={e => setForm({ ...form, auditor: e.target.value })} placeholder="Nombre" disabled={saving} /></div>

            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '14px 0 6px' }}>CONTROLES</div>
            {CHECK_FIELDS.map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ flex: 1, fontSize: 12.5 }}>{f.label}</span>
                <div style={{ width: 90 }}>
                  <OkNaSelect value={form[f.key]} onChange={v => setForm({ ...form, [f.key]: v })} />
                </div>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              <div className="modal-field"><label>Diámetro externo</label><input value={form.diametroExterno} onChange={e => setForm({ ...form, diametroExterno: e.target.value })} placeholder="Ej: 6,00" disabled={saving} /></div>
              <div className="modal-field"><label>Caudal (Medición)</label><input value={form.caudalMedicion} onChange={e => setForm({ ...form, caudalMedicion: e.target.value })} disabled={saving} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
              <div className="modal-field"><label>Longitud según Plano</label><input value={form.longitudPlano} onChange={e => setForm({ ...form, longitudPlano: e.target.value })} placeholder="Número o N/A" disabled={saving} /></div>
              <div className="modal-field"><label>Longitud de Corte</label><input value={form.longitudCorte} onChange={e => setForm({ ...form, longitudCorte: e.target.value })} placeholder="Número o N/A" disabled={saving} /></div>
            </div>
            <div className="modal-field"><label>Observaciones</label><textarea value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} rows={2} disabled={saving} /></div>

            <div className="modal-actions">
              <button className="btn btn-grey" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
