import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import WeekCalendar from '../../components/WeekCalendar'
import { useAuth } from '../../context/AuthContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { compressImage } from '../../utils/compressImage'

// ── Check List Proceso de Soldadura (FR-AC.001-01) ───────────────────────────
// A diferencia de la Auditoría de Tubería (una tabla, una fila por muestra),
// acá cada registro ES un formulario completo — un check list por visita al
// puesto, con preguntas fijas agrupadas en 3 categorías.

const QUESTIONS = [
  { id: '1.1', cat: 1, texto: '¿El operario se encuentra habilitado en la matriz de habilitación de puesto?', extra: { key: 'legajo', label: 'Legajo' } },
  { id: '1.2', cat: 1, texto: '¿Se encuentra completo el formulario FR-MP.005?' },
  { id: '1.3', cat: 1, texto: '¿El visualizador se encuentra disponible, en buen estado para su lectura y corresponde al SC en proceso?' },
  { id: '1.4', cat: 1, texto: '¿Las gavetas con Materiales, se encuentran identificadas según el visualizador?' },
  { id: '1.5', cat: 1, texto: '¿Utilizan los EPP que indican las Hojas de Procesos?' },
  { id: '2.1', cat: 2, texto: '¿Se utiliza el N° de dispositivo que describe la HP? ¿El dispositivo se encuentra identificado con su N° correspondiente?', extra: { key: 'nDispositivo', label: 'N° Disp' } },
  { id: '2.2', cat: 2, texto: '¿El dispositivo se encuentra en condiciones aceptables para ser utilizado?' },
  { id: '2.3', cat: 2, texto: '¿El barrido de nitrógeno se utiliza correctamente y se encuentra en buenas condiciones?' },
  { id: '2.4', cat: 2, texto: '¿El Gas Saber se encuentra en fecha MPP?' },
  { id: '3.1', cat: 3, texto: '¿Se puede observar que el sector mantiene un orden estándar con respecto a materiales en Carros, Contenedores voluminosos, y materiales No conformes?' },
  { id: '3.2', cat: 3, texto: '¿Las diferentes áreas designadas para las diferentes funciones, se encuentran correctamente demarcadas, identificadas y con su color correspondiente (muebles, pisos, gavetas)?' },
  { id: '3.3', cat: 3, texto: '¿Se observa en líneas generales áreas, sectores y puestos limpios? Están libres de materiales o elementos que no correspondan al proceso productivo?' },
]
const CATEGORIAS = { 1: 'DOCUMENTACIÓN', 2: 'HERRAMIENTAS', 3: 'ORDEN, DEMARCACIÓN Y LIMPIEZA' }

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyForm() {
  return {
    fecha: todayStr(),
    turno: '',
    auditor: '',
    supervisor: '',
    subConjunto: '',
    modelo: '',
    puestoNum: '',
    respuestas: Object.fromEntries(QUESTIONS.map(q => [q.id, { resultado: '', observacion: '', extra: '', fotoUrl: '' }])),
  }
}

const inputStyle = {
  width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '9px 10px',
  fontSize: 13, background: '#fff', boxSizing: 'border-box',
}

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

function getImageSize(dataUrl) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve({ w: 4, h: 3 })
    img.src = dataUrl
  })
}

// Carga de foto de evidencia — solo se muestra cuando la pregunta da NOK.
// Mismo patrón de subida a Cloudinary que PhotoGrid.jsx (cámara/galería),
// pero una sola foto por pregunta en vez de una grilla.
function FotoNOK({ fotoUrl, onChange }) {
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const toSend = await compressImage(file)
      const fd = new FormData()
      fd.append('file', toSend)
      fd.append('upload_preset', 'tuberia_fotos')
      fd.append('folder', 'calidad_evidencias')
      const res = await fetch('https://api.cloudinary.com/v1_1/vgia9y4h/image/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.secure_url) onChange(data.secure_url)
    } catch (err) {
      alert('Error al subir la foto: ' + err.message)
    }
    setUploading(false)
    if (e.target) e.target.value = ''
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #ddd' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#c62828', marginBottom: 6 }}>📷 Evidencia fotográfica (NOK)</div>
      {fotoUrl ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <img src={fotoUrl} alt="Evidencia" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd' }} />
          <button type="button" onClick={() => onChange('')} style={{
            position: 'absolute', top: -6, right: -6, background: '#c62828', color: '#fff', border: 'none',
            borderRadius: '50%', width: 20, height: 20, fontSize: 12, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>
      ) : uploading ? (
        <span style={{ fontSize: 12, color: '#e65100', fontWeight: 600 }}>Subiendo...</span>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff3e0', color: '#e65100', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            📷 Cámara
            <input type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff3e0', color: '#e65100', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            🖼 Galería
            <input type="file" accept="image/*" hidden onChange={handleFile} />
          </label>
        </div>
      )}
    </div>
  )
}

export default function CalidadChecklistSoldadura() {
  const { isCalidad, puedeBorrarCalidad } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState([])
  const [logo, setLogo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filtroFecha, setFiltroFecha] = useState(todayStr())

  useEffect(() => {
    if (!isCalidad) { navigate('/'); return }
    const u1 = onSnapshot(collection(db, 'calidad_checklist_soldadura'), snap => {
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
    .sort((a, b) => (a.creadoEn?.seconds || 0) - (b.creadoEn?.seconds || 0))

  const countByDate = {}
  for (const r of registros) { if (r.fecha) countByDate[r.fecha] = (countByDate[r.fecha] || 0) + 1 }

  function abrirNuevo() {
    setForm(emptyForm())
    setEditId(null)
    setShowForm(true)
  }

  // Reabre un check list ya guardado para corregirlo — completa cualquier
  // pregunta que pudiera faltar (por si el registro es viejo y el
  // formulario cambió) con la forma vacía, para no romper el render.
  function abrirExistente(r) {
    const base = emptyForm()
    setForm({
      ...base,
      ...r,
      respuestas: { ...base.respuestas, ...(r.respuestas || {}) },
    })
    setEditId(r.id)
    setShowForm(true)
  }

  function setResp(id, patch) {
    setForm(prev => ({ ...prev, respuestas: { ...prev.respuestas, [id]: { ...prev.respuestas[id], ...patch } } }))
  }

  async function guardar() {
    if (!form.auditor.trim()) { alert('Ingresá el nombre del auditor'); return }
    if (!form.subConjunto.trim()) { alert('Ingresá el subconjunto en proceso'); return }
    setSaving(true)
    try {
      if (editId) {
        await updateDoc(doc(db, 'calidad_checklist_soldadura', editId), { ...form })
      } else {
        await addDoc(collection(db, 'calidad_checklist_soldadura'), { ...form, creadoEn: serverTimestamp() })
      }
      setShowForm(false)
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    }
    setSaving(false)
  }

  async function eliminar(r) {
    if (!confirm(`¿Eliminar este check list (${r.subConjunto} — Puesto ${r.puestoNum})?`)) return
    await deleteDoc(doc(db, 'calidad_checklist_soldadura', r.id))
  }

  async function exportarPDF(r) {
    const pdf = new jsPDF({ orientation: 'portrait' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const MARGIN = 10

    const headTop = 10, headH = 16
    pdf.setDrawColor(0)
    pdf.rect(MARGIN, headTop, pageWidth - MARGIN * 2, headH)
    pdf.line(MARGIN + 42, headTop, MARGIN + 42, headTop + headH)
    pdf.line(pageWidth - MARGIN - 32, headTop, pageWidth - MARGIN - 32, headTop + headH)

    if (logo?.url) {
      try {
        const dataUrl = await toDataURL(logo.url)
        pdf.addImage(dataUrl, MARGIN + 3, headTop + 3, 36, 10, undefined, 'FAST')
      } catch { /* sin logo si falla */ }
    }
    pdf.setFillColor(10, 10, 10)
    pdf.rect(MARGIN + 42, headTop, pageWidth - MARGIN * 2 - 42 - 32, headH, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFontSize(11)
    pdf.setFont(undefined, 'bold')
    pdf.text('CHECK LIST PROCESO DE SOLDADURA', pageWidth / 2 + 5, headTop + headH / 2 + 1, { align: 'center' })
    pdf.setTextColor(0, 0, 0)
    pdf.setFontSize(6)
    pdf.setFont(undefined, 'normal')
    pdf.text('FR-AC.001-01', pageWidth - MARGIN - 30, headTop + 6)
    pdf.text('FECHA: 26-09-2024', pageWidth - MARGIN - 30, headTop + 11)

    let y = headTop + headH + 6
    autoTable(pdf, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      body: [
        [{ content: 'Fecha:', styles: { fontStyle: 'bold', fillColor: [219, 229, 239] } }, r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR') : '',
         { content: 'Turno:', styles: { fontStyle: 'bold', fillColor: [219, 229, 239] } }, r.turno || ''],
        [{ content: 'Auditor:', styles: { fontStyle: 'bold', fillColor: [219, 229, 239] } }, r.auditor || '',
         { content: 'Supervisor:', styles: { fontStyle: 'bold', fillColor: [219, 229, 239] } }, r.supervisor || ''],
        [{ content: 'Sub Conjunto en proceso:', styles: { fontStyle: 'bold', fillColor: [219, 229, 239] } }, { content: r.subConjunto || '', colSpan: 3 }],
        [{ content: 'Modelo:', styles: { fontStyle: 'bold', fillColor: [219, 229, 239] } }, { content: r.modelo || '', colSpan: 3 }],
        [{ content: 'Puesto N°:', styles: { fontStyle: 'bold', fillColor: [219, 229, 239] } }, { content: r.puestoNum || '', colSpan: 3 }],
      ],
      columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 48 }, 2: { cellWidth: 30 }, 3: { cellWidth: 'auto' } },
    })
    y = pdf.lastAutoTable.finalY + 4

    // Igual que el formulario original: la categoría va una sola vez por
    // grupo (celda combinada con rowSpan). Legajo/N° Dispositivo es una
    // columna propia, independiente de Observación (en 1.1/2.1 se pueden
    // completar los dos datos a la vez, uno no reemplaza al otro).
    const catFill = { fillColor: [219, 229, 239], fontStyle: 'bold', halign: 'center', valign: 'middle' }
    const body = []
    for (const cat of [1, 2, 3]) {
      const preguntas = QUESTIONS.filter(q => q.cat === cat)
      preguntas.forEach((q, i) => {
        const resp = r.respuestas?.[q.id] || {}
        const row = []
        if (i === 0) row.push({ content: `${cat}\n${CATEGORIAS[cat]}`, rowSpan: preguntas.length, styles: catFill })
        row.push(
          `${q.id} ${q.texto}`,
          resp.resultado || '',
          q.extra && resp.extra ? { content: `${q.extra.label.toUpperCase()}:\n${resp.extra}`, styles: { fontStyle: 'bold', halign: 'center' } } : '',
          { content: resp.observacion || '', styles: { halign: 'left' } },
        )
        body.push(row)
      })
    }
    autoTable(pdf, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Categoría', 'Pregunta', 'Resultado', 'Legajo / N° Disp', 'Observación']],
      body,
      styles: { fontSize: 7.5, cellPadding: 2.5, valign: 'middle' },
      headStyles: { fillColor: [219, 229, 239], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 16, halign: 'center' }, 3: { cellWidth: 22 }, 4: { cellWidth: 36 } },
      // Colores sólidos (no pastel) igual que la planilla oficial: verde
      // pleno para OK, rojo pleno para NOK, texto blanco encima.
      didParseCell(data) {
        if (data.section !== 'body' || data.column.index !== 2) return
        if (data.cell.raw === 'OK') { data.cell.styles.fillColor = [0, 176, 80]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = 'bold' }
        else if (data.cell.raw === 'NOK') { data.cell.styles.fillColor = [255, 0, 0]; data.cell.styles.textColor = [255, 255, 255]; data.cell.styles.fontStyle = 'bold' }
      },
    })

    pdf.save(`checklist-soldadura-${r.subConjunto || 'sc'}-${r.fecha}.pdf`)
  }

  // Excel con el mismo formato del PDF — logo real, título en barra negra,
  // código de documento, categoría agrupada (merge) y colores sólidos
  // OK/NOK. Usa ExcelJS, igual que el export de Tuberías.
  async function exportarExcel(r) {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Check List')
    const NCOLS = 5
    ws.columns = [{ width: 16 }, { width: 55 }, { width: 12 }, { width: 16 }, { width: 30 }]

    const titleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A0A' } }
    const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBE5EF' } }
    const okFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } }
    const nookFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } }
    const thinBorder = { style: 'thin', color: { argb: 'FFB0B0B0' } }
    const border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

    // Título
    ws.getRow(1).height = 30
    ws.mergeCells(1, 1, 1, NCOLS)
    const titleCell = ws.getCell(1, 1)
    titleCell.value = 'CHECK LIST PROCESO DE SOLDADURA'
    titleCell.fill = titleFill
    titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

    ws.getRow(2).height = 16
    ws.mergeCells(2, 1, 2, NCOLS)
    const codeCell = ws.getCell(2, 1)
    codeCell.value = 'FR-AC.001-01   ·   FECHA: 26-09-2024'
    codeCell.font = { italic: true, size: 9, color: { argb: 'FF444444' } }
    codeCell.alignment = { horizontal: 'center' }

    if (logo?.url) {
      try {
        const dataUrl = await toDataURL(logo.url)
        const [, ext] = dataUrl.match(/^data:image\/(\w+);base64,/) || [, 'png']
        const base64 = dataUrl.split(',')[1]
        const imageId = workbook.addImage({ base64, extension: ext === 'jpeg' ? 'jpeg' : 'png' })
        ws.addImage(imageId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 110, height: 28 } })
      } catch { /* sin logo si falla la descarga */ }
    }

    // Datos generales
    const infoRows = [
      ['Fecha:', r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR') : '', 'Turno:', r.turno || ''],
      ['Auditor:', r.auditor || '', 'Supervisor:', r.supervisor || ''],
      ['Sub Conjunto en proceso:', r.subConjunto || '', '', ''],
      ['Modelo:', r.modelo || '', '', ''],
      ['Puesto N°:', r.puestoNum || '', '', ''],
    ]
    infoRows.forEach((cols, i) => {
      const rowNum = 3 + i
      const row = ws.getRow(rowNum)
      row.getCell(1).value = cols[0]
      row.getCell(1).font = { bold: true, size: 9 }
      row.getCell(1).fill = headFill
      row.getCell(1).border = border
      if (i < 2) {
        row.getCell(2).value = cols[1]
        row.getCell(2).border = border
        row.getCell(3).value = cols[2]
        row.getCell(3).font = { bold: true, size: 9 }
        row.getCell(3).fill = headFill
        row.getCell(3).border = border
        row.getCell(4).value = cols[3]
        row.getCell(4).border = border
      } else {
        ws.mergeCells(rowNum, 2, rowNum, 4)
        row.getCell(2).value = cols[1]
        row.getCell(2).font = { bold: true }
        row.getCell(2).alignment = { horizontal: 'center' }
        for (let c = 2; c <= 4; c++) row.getCell(c).border = border
      }
    })

    // Tabla de preguntas
    let rIdx = 8
    ws.getRow(rIdx).height = 16
    const head = ws.getRow(rIdx)
    ;['Categoría', 'Pregunta', 'Resultado', 'Legajo / N° Disp', 'Observación'].forEach((h, i) => {
      const cell = head.getCell(i + 1)
      cell.value = h
      cell.fill = headFill
      cell.font = { bold: true, size: 9 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = border
    })
    rIdx++

    for (const cat of [1, 2, 3]) {
      const preguntas = QUESTIONS.filter(q => q.cat === cat)
      const startRow = rIdx
      preguntas.forEach(q => {
        const resp = r.respuestas?.[q.id] || {}
        const row = ws.getRow(rIdx)
        row.getCell(2).value = `${q.id} ${q.texto}`
        row.getCell(2).alignment = { wrapText: true, vertical: 'middle' }
        row.getCell(2).font = { size: 8.5 }

        const resCell = row.getCell(3)
        resCell.value = resp.resultado || ''
        resCell.alignment = { horizontal: 'center', vertical: 'middle' }
        if (resp.resultado === 'OK') { resCell.fill = okFill; resCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 } }
        else if (resp.resultado === 'NOK') { resCell.fill = nookFill; resCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 } }

        if (q.extra && resp.extra) {
          row.getCell(4).value = `${q.extra.label.toUpperCase()}: ${resp.extra}`
          row.getCell(4).font = { bold: true, size: 8.5 }
          row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }
        }
        row.getCell(5).value = resp.observacion || ''
        row.getCell(5).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        row.getCell(5).font = { size: 8.5 }

        for (let c = 1; c <= 5; c++) row.getCell(c).border = border
        rIdx++
      })
      if (preguntas.length > 1) ws.mergeCells(startRow, 1, rIdx - 1, 1)
      const catCell = ws.getCell(startRow, 1)
      catCell.value = `${cat}\n${CATEGORIAS[cat]}`
      catCell.fill = headFill
      catCell.font = { bold: true, size: 9 }
      catCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `checklist-soldadura-${r.subConjunto || 'sc'}-${r.fecha}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  function itemsConEvidencia(r) {
    return QUESTIONS.filter(q => r.respuestas?.[q.id]?.resultado === 'NOK' && r.respuestas[q.id].fotoUrl)
  }

  // Documento aparte "EVIDENCIA FOTOGRAFICA DE NC" — un bloque por cada
  // pregunta NOK que tenga foto cargada, agrupados por categoría, con la
  // misma estructura de la planilla real (franja celeste de título, columna
  // de categoría a la izquierda, foto grande, leyenda debajo).
  async function exportarEvidenciasPDF(r) {
    const items = itemsConEvidencia(r)
    if (!items.length) return
    const pdf = new jsPDF({ orientation: 'portrait' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const MARGIN = 10
    const catColW = 16
    const photoMaxW = pageW - MARGIN * 2 - catColW
    const photoMaxH = 95

    let y = MARGIN

    function drawTitleBar() {
      pdf.setFillColor(219, 229, 239)
      pdf.setDrawColor(0)
      pdf.rect(MARGIN, y, pageW - MARGIN * 2, 10, 'FD')
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(12)
      pdf.setFont(undefined, 'bold')
      pdf.text('EVIDENCIA FOTOGRAFICA DE NC', pageW / 2, y + 7, { align: 'center' })
      pdf.setFont(undefined, 'normal')
      y += 10
    }
    drawTitleBar()

    for (const q of items) {
      const resp = r.respuestas[q.id]
      let dataUrl, dims
      try {
        dataUrl = await toDataURL(resp.fotoUrl)
        dims = await getImageSize(dataUrl)
      } catch { continue }

      const ratio = Math.min(photoMaxW / dims.w, photoMaxH / dims.h)
      const drawW = dims.w * ratio
      const drawH = dims.h * ratio
      const captionH = 12
      const blockH = photoMaxH + captionH + 6

      if (y + blockH > pageH - MARGIN) {
        pdf.addPage()
        y = MARGIN
        drawTitleBar()
      }

      const blockTop = y
      pdf.setDrawColor(0)
      pdf.rect(MARGIN, blockTop, catColW, blockH)
      pdf.rect(MARGIN + catColW, blockTop, pageW - MARGIN * 2 - catColW, blockH)

      // Categoría, texto rotado verticalmente en la columna izquierda.
      // jsPDF no calcula bien el centrado (align:'center') combinado con
      // rotación (angle) — queda desplazado fuera de la caja. Se centra a
      // mano: con el texto rotado 90°, "avanza" hacia arriba desde el punto
      // de inicio, así que ese punto se corre hacia abajo la mitad de su
      // ancho para que el centro quede a mitad del bloque.
      pdf.setFontSize(8)
      pdf.setFont(undefined, 'bold')
      const catText = `${q.cat} - ${CATEGORIAS[q.cat]}`
      const catTextW = pdf.getTextWidth(catText)
      pdf.text(catText, MARGIN + catColW / 2 + 1.5, blockTop + blockH / 2 + catTextW / 2, { angle: 90 })
      pdf.setFont(undefined, 'normal')

      // Foto centrada dentro del box
      const imgX = MARGIN + catColW + (photoMaxW - drawW) / 2
      const imgY = blockTop + 3 + (photoMaxH - drawH) / 2
      pdf.addImage(dataUrl, imgX, imgY, drawW, drawH, undefined, 'FAST')

      // Leyenda (observación de esa pregunta)
      pdf.setFontSize(9)
      pdf.setFont(undefined, 'bold')
      pdf.text(resp.observacion || q.texto, pageW / 2, blockTop + photoMaxH + 3 + 6, { align: 'center', maxWidth: pageW - MARGIN * 2 - catColW - 10 })
      pdf.setFont(undefined, 'normal')

      y = blockTop + blockH + 6
    }

    pdf.save(`evidencias-nc-${r.subConjunto || 'sc'}-${r.fecha}.pdf`)
  }

  return (
    <div className="app">
      <Header title="Calidad — Check List Soldadura" back="/calidad" />

      <div className="content">
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={abrirNuevo}>
          + Nuevo check list
        </button>

        <WeekCalendar selectedDate={filtroFecha} onSelect={setFiltroFecha} countByDate={countByDate} />

        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && registrosDelDia.length === 0 && (
          <div className="empty"><div className="ei">🔧</div><p>Sin check lists para esta fecha.</p></div>
        )}

        {registrosDelDia.map(r => {
          const nok = QUESTIONS.filter(q => r.respuestas?.[q.id]?.resultado === 'NOK').length
          return (
            <div key={r.id} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.subConjunto} <span style={{ fontWeight: 400, color: '#888' }}>· {r.modelo}</span></div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Puesto {r.puestoNum} · Turno {r.turno || '—'} · Auditor: {r.auditor} · Sup: {r.supervisor || '—'}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {isCalidad && (
                    <button onClick={() => abrirExistente(r)} style={{ background: '#e0f2f1', color: '#00796b', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>✏️</button>
                  )}
                  <button onClick={() => exportarPDF(r)} style={{ background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>📄</button>
                  <button onClick={() => exportarExcel(r)} style={{ background: '#e8f5e9', color: '#2e7d32', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>📊</button>
                  {itemsConEvidencia(r).length > 0 && (
                    <button onClick={() => exportarEvidenciasPDF(r)} style={{ background: '#fff3e0', color: '#e65100', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>📎</button>
                  )}
                  {puedeBorrarCalidad && (
                    <button onClick={() => eliminar(r)} style={{ background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>🗑</button>
                  )}
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: nok > 0 ? '#c62828' : '#2e7d32' }}>
                {nok > 0 ? `⚠ ${nok} punto${nok !== 1 ? 's' : ''} NOK` : '✓ Todo OK'}
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="modal-drag" />
            <h2>{editId ? 'Editar check list' : 'Nuevo check list'}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="modal-field"><label>Fecha</label><input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} disabled={saving} /></div>
              <div className="modal-field"><label>Turno</label><input value={form.turno} onChange={e => setForm({ ...form, turno: e.target.value })} placeholder="Mañana / Tarde / Noche" disabled={saving} /></div>
            </div>
            <div className="modal-field"><label>Auditor*</label><input value={form.auditor} onChange={e => setForm({ ...form, auditor: e.target.value })} disabled={saving} /></div>
            <div className="modal-field"><label>Supervisor</label><input value={form.supervisor} onChange={e => setForm({ ...form, supervisor: e.target.value })} disabled={saving} /></div>
            <div className="modal-field"><label>Sub Conjunto en proceso*</label><input value={form.subConjunto} onChange={e => setForm({ ...form, subConjunto: e.target.value })} placeholder="Ej: Válvula de 4 vías" disabled={saving} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="modal-field"><label>Modelo</label><input value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} placeholder="Ej: 12FC INVERTER" disabled={saving} /></div>
              <div className="modal-field"><label>Puesto N°</label><input value={form.puestoNum} onChange={e => setForm({ ...form, puestoNum: e.target.value })} disabled={saving} /></div>
            </div>

            {[1, 2, 3].map(cat => (
              <div key={cat} style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 8px' }}>{cat}. {CATEGORIAS[cat]}</div>
                {QUESTIONS.filter(q => q.cat === cat).map(q => (
                  <div key={q.id} style={{ background: '#f8f9fa', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, marginBottom: 8 }}><strong>{q.id}</strong> {q.texto}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={form.respuestas[q.id].resultado} onChange={e => setResp(q.id, { resultado: e.target.value })} style={{ ...inputStyle, width: 90, flexShrink: 0 }}>
                        <option value="">—</option>
                        <option value="OK">OK</option>
                        <option value="NOK">NOK</option>
                      </select>
                      {q.extra && (
                        <input value={form.respuestas[q.id].extra} onChange={e => setResp(q.id, { extra: e.target.value })} placeholder={q.extra.label} style={{ ...inputStyle, width: 90, flexShrink: 0 }} disabled={saving} />
                      )}
                      <input value={form.respuestas[q.id].observacion} onChange={e => setResp(q.id, { observacion: e.target.value })} placeholder="Observación (opcional)" style={inputStyle} disabled={saving} />
                    </div>
                    {form.respuestas[q.id].resultado === 'NOK' && (
                      <FotoNOK fotoUrl={form.respuestas[q.id].fotoUrl} onChange={url => setResp(q.id, { fotoUrl: url })} />
                    )}
                  </div>
                ))}
              </div>
            ))}

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
