import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import WeekCalendar from '../../components/WeekCalendar'
import { useAuth } from '../../context/AuthContext'
import jsPDF from 'jspdf'
import ExcelJS from 'exceljs'
import { compressImage } from '../../utils/compressImage'

// ── Check List Producto Terminado de Soldadura ────────────────────────────────
// A diferencia de los otros dos check lists de Calidad, acá el registro no es
// "una muestra" ni "una visita al puesto": es **un turno completo** (Fecha +
// Turno), que se va completando de a poco durante el día — 1er, 2do y 3er
// muestreo, cada uno con 3 líneas (ODU1/IDU/ODU2) y su propio Sub Conjunto /
// Modelo / Lote. Por eso hay un solo registro por Fecha+Turno: se crea con el
// primer muestreo y se reabre más tarde para sumar el segundo y el tercero,
// sin pisar lo ya cargado.

const LINEAS = ['ODU1', 'IDU', 'ODU2']
const MUESTREOS = ['1° MUESTREO', '2° MUESTREO', '3° MUESTREO']
const TURNOS = ['Mañana', 'Tarde', 'Noche']

// Paleta exacta del formulario oficial (distinta de los otros dos check
// lists, que usan título negro + header celeste).
const C_TITLE = [68, 114, 196]        // azul de la barra de título
const C_OBS = [184, 204, 228]         // azul grisáceo de la franja "Obs:"
const C_GREY = [217, 217, 217]        // gris — "Ítem" y el nombre de línea (ODU1/IDU/ODU2)
const C_PEACH_LIGHT = [252, 228, 214] // durazno claro — etiquetas Sub Conjunto:/Modelo:/Lote:
const C_PEACH = [248, 203, 173]       // durazno — valores cargados y N/A
const C_OK = [0, 176, 80]             // verde sólido
const C_NOK = [255, 0, 0]             // rojo sólido
const C_WHITE = [255, 255, 255]

// Dibuja una celda con borde negro, relleno y texto centrado (o alineado a
// la izquierda), con wrap opcional. El formulario oficial tiene celdas
// combinadas en dos ejes (columna vertical rotada a la izquierda, nombre de
// línea abarcando dos filas, resultado abarcando las 3 subcolumnas de su
// muestreo) — autoTable no puede representar eso, así que el PDF se dibuja
// celda por celda.
function drawCell(pdf, x, y, w, h, opts = {}) {
  const { fill = C_WHITE, text = '', size = 7, bold = false, align = 'center', color = [0, 0, 0], wrap = false } = opts
  const padX = 1.5
  pdf.setFillColor(fill[0], fill[1], fill[2])
  pdf.setDrawColor(0)
  pdf.setLineWidth(0.2)
  pdf.rect(x, y, w, h, 'FD')
  if (text === '' || text == null) return
  pdf.setFontSize(size)
  pdf.setFont(undefined, bold ? 'bold' : 'normal')
  pdf.setTextColor(color[0], color[1], color[2])
  const lines = wrap ? pdf.splitTextToSize(String(text), w - padX * 2) : [String(text)]
  const lh = size * 0.40
  const ty = y + h / 2 - (lines.length * lh) / 2 + lh * 0.78
  lines.forEach((ln, i) => {
    if (align === 'center') pdf.text(ln, x + w / 2, ty + i * lh, { align: 'center' })
    else pdf.text(ln, x + padX, ty + i * lh)
  })
}

const QUESTIONS = [
  { id: '1.1', texto: '¿El carro de SC se encuentra correctamente identificado? (SC, modelo, etc)' },
  { id: '1.2', texto: '¿La presencia y posiciones de accesorios corresponden al SC auditado? (verificar con visualizadores de preformado de soldadura)' },
  { id: '1.3', texto: 'Inspección visual de puntos de soldadura (fugas, poros, exceso de aporte, estética, linealidad, montaje)' },
  { id: '1.4', texto: '¿Se aprecia una correcta manipulación, estiba y resguardo de los sub conjuntos?' },
]

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyMuestra() {
  return {
    subConjunto: '', modelo: '', lote: '',
    respuestas: Object.fromEntries(QUESTIONS.map(q => [q.id, { resultado: '', observacion: '', fotoUrl: '' }])),
  }
}

function emptyForm() {
  return {
    fecha: todayStr(),
    turno: '',
    auditor: '',
    supervisor: '',
    observacionGeneral: '',
    lineas: Object.fromEntries(LINEAS.map(l => [l, [emptyMuestra(), emptyMuestra(), emptyMuestra()]])),
  }
}

// Al abrir un registro ya guardado, completa cualquier hueco (línea o
// muestra faltante) con la forma vacía — por si el documento se creó con una
// versión anterior de la pantalla, nunca debería romper el formulario.
function normalizarForm(r) {
  const base = emptyForm()
  return {
    ...base,
    fecha: r.fecha || base.fecha,
    turno: r.turno || '',
    auditor: r.auditor || '',
    supervisor: r.supervisor || '',
    observacionGeneral: r.observacionGeneral || '',
    lineas: Object.fromEntries(LINEAS.map(l => {
      const muestras = r.lineas?.[l] || []
      return [l, [0, 1, 2].map(i => ({
        ...emptyMuestra(),
        ...muestras[i],
        respuestas: { ...emptyMuestra().respuestas, ...(muestras[i]?.respuestas || {}) },
      }))]
    })),
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

// Misma foto de evidencia que ya usa Check List Soldadura — cámara/galería,
// solo visible cuando la pregunta da NOK.
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

export default function CalidadChecklistProductoTerminado() {
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
  const [openLinea, setOpenLinea] = useState(LINEAS[0])

  useEffect(() => {
    if (!isCalidad) { navigate('/'); return }
    const u1 = onSnapshot(collection(db, 'calidad_checklist_producto_terminado'), snap => {
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
    setForm({ ...emptyForm(), fecha: filtroFecha })
    setEditId(null)
    setOpenLinea(LINEAS[0])
    setShowForm(true)
  }

  function abrirExistente(r) {
    setForm(normalizarForm(r))
    setEditId(r.id)
    setOpenLinea(LINEAS[0])
    setShowForm(true)
  }

  // Si se cambia Fecha o Turno y ya existe un registro con esa combinación
  // (y no es el que se está editando), ofrece continuarlo en vez de crear
  // un duplicado — así el pedido de "un solo registro por turno" se cumple
  // aunque el auditor abra "+ Nuevo" por error para sumar el 2°/3° muestreo.
  function chequearDuplicado(fecha, turno) {
    if (!fecha || !turno) return
    const existente = registros.find(r => r.fecha === fecha && r.turno === turno && r.id !== editId)
    if (!existente) return
    if (confirm(`Ya hay un check list cargado para ${turno} del ${fecha} — ¿querés abrirlo para sumar el próximo muestreo en vez de crear uno nuevo?`)) {
      abrirExistente(existente)
    }
  }

  function setMuestra(linea, idx, patch) {
    setForm(prev => ({
      ...prev,
      lineas: {
        ...prev.lineas,
        [linea]: prev.lineas[linea].map((m, i) => i === idx ? { ...m, ...patch } : m),
      },
    }))
  }
  function setResp(linea, idx, qId, patch) {
    setForm(prev => ({
      ...prev,
      lineas: {
        ...prev.lineas,
        [linea]: prev.lineas[linea].map((m, i) => i === idx
          ? { ...m, respuestas: { ...m.respuestas, [qId]: { ...m.respuestas[qId], ...patch } } }
          : m),
      },
    }))
  }

  async function guardar() {
    if (!form.turno) { alert('Elegí el turno'); return }
    if (!form.auditor.trim()) { alert('Ingresá el nombre del auditor'); return }
    setSaving(true)
    try {
      if (editId) {
        await updateDoc(doc(db, 'calidad_checklist_producto_terminado', editId), { ...form, actualizadoEn: serverTimestamp() })
      } else {
        await addDoc(collection(db, 'calidad_checklist_producto_terminado'), { ...form, creadoEn: serverTimestamp() })
      }
      setShowForm(false)
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    }
    setSaving(false)
  }

  async function eliminar(r) {
    if (!confirm(`¿Eliminar el check list de ${r.turno} del ${r.fecha}?`)) return
    await deleteDoc(doc(db, 'calidad_checklist_producto_terminado', r.id))
  }

  // ── Resumen por registro (para la card de la lista) ────────────────────────
  function resumen(r) {
    let muestrasCargadas = 0, nok = 0
    for (const l of LINEAS) {
      for (const m of (r.lineas?.[l] || [])) {
        if (m?.subConjunto?.trim()) muestrasCargadas++
        for (const q of QUESTIONS) if (m?.respuestas?.[q.id]?.resultado === 'NOK') nok++
      }
    }
    return { muestrasCargadas, nok }
  }

  function itemsConEvidencia(r) {
    const items = []
    for (const l of LINEAS) {
      (r.lineas?.[l] || []).forEach((m, idx) => {
        for (const q of QUESTIONS) {
          const resp = m?.respuestas?.[q.id]
          if (resp?.resultado === 'NOK' && resp.fotoUrl) items.push({ linea: l, muestreoIdx: idx, q, resp, subConjunto: m.subConjunto })
        }
      })
    }
    return items
  }

  // ── Export PDF ───────────────────────────────────────────────────────────
  // Réplica celda por celda del formulario oficial. La grilla es:
  //   [Sub Conjunto Terminado (vertical, rotado)] [Ítem] [3 muestreos × (Sub Conjunto | Modelo | Lote)]
  // El nombre de la línea (ODU1/IDU/ODU2) va como celda gris dentro de la
  // columna Ítem abarcando las dos filas de encabezado del bloque, y el
  // resultado OK/NOK/N/A de cada pregunta ocupa las 3 subcolumnas de su
  // muestreo — igual que en el original.
  async function exportarPDF(r) {
    const pdf = new jsPDF({ orientation: 'landscape' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const M = 8
    const availW = pageW - M * 2

    const vertW = 11                              // columna vertical rotada
    const itemW = 92                              // columna de ítems / preguntas
    const subW = (availW - vertW - itemW) / 9     // 3 muestreos × 3 subcolumnas
    const muestreoW = subW * 3
    const gridX = M + vertW + itemW               // donde arrancan los muestreos

    let y = M

    // ── Barra de título: logo a la izquierda, franja azul con el nombre ──
    const titleH = 13
    const logoW = 45
    drawCell(pdf, M, y, logoW, titleH, { fill: C_WHITE })
    if (logo?.url) {
      try {
        const dataUrl = await toDataURL(logo.url)
        pdf.addImage(dataUrl, M + 4, y + 2, 37, 9, undefined, 'FAST')
      } catch { /* sin logo si falla */ }
    }
    drawCell(pdf, M + logoW, y, availW - logoW, titleH, {
      fill: C_TITLE, text: 'CHECK LIST PRODUCTO TERMINADO DE SOLDADURA', size: 13, bold: true,
    })
    y += titleH

    // ── Encabezado: Fecha/Auditor/Supervisor a la izquierda, Turno y los
    //    3 muestreos a la derecha. La celda "Ítem" abarca las 3 filas. ──
    const hRow = 5.5
    const headH = hRow * 3
    const obsH = r.observacionGeneral?.trim() ? 6 : 0
    drawCell(pdf, M, y, vertW, headH + obsH, { fill: C_GREY, text: 'Ítem', size: 7, bold: true })

    const labelW = 25
    const valW = itemW - labelW
    const fechaTxt = r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR') : ''
    const filasHead = [['Fecha:', fechaTxt], ['Auditor:', r.auditor || ''], ['Supervisor:', r.supervisor || '']]
    filasHead.forEach(([label, val], i) => {
      drawCell(pdf, M + vertW, y + i * hRow, labelW, hRow, { text: label, size: 7.5, bold: true, align: 'left' })
      drawCell(pdf, M + vertW + labelW, y + i * hRow, valW, hRow, { text: val, size: 7.5, bold: true, align: 'left' })
    })
    // Fila 1 derecha: "Turno:" sobre los dos primeros muestreos, el valor sobre el tercero
    drawCell(pdf, gridX, y, muestreoW * 2, hRow, { text: 'Turno:', size: 7.5, bold: true })
    drawCell(pdf, gridX + muestreoW * 2, y, muestreoW, hRow, { text: (r.turno || '').toUpperCase(), size: 7.5, bold: true })
    // Filas 2-3 derecha: los 3 muestreos, cada uno abarcando las dos filas
    MUESTREOS.forEach((m, i) => {
      drawCell(pdf, gridX + i * muestreoW, y + hRow, muestreoW, hRow * 2, { text: m, size: 8, bold: true })
    })
    y += headH

    if (obsH) {
      drawCell(pdf, M + vertW, y, availW - vertW, obsH, {
        fill: C_OBS, text: `Obs: ${r.observacionGeneral}`, size: 9, bold: true,
      })
      y += obsH
    }

    // ── Un bloque por línea (ODU1 / IDU / ODU2) ──
    for (const linea of LINEAS) {
      const muestras = r.lineas?.[linea] || [emptyMuestra(), emptyMuestra(), emptyMuestra()]
      const rowLabels = 4.5   // Sub Conjunto: / Modelo: / Lote:
      const rowValues = 6.5   // valores cargados

      // Alto de cada fila de pregunta según cuántas líneas ocupa su texto
      pdf.setFontSize(6.5)
      const qHeights = QUESTIONS.map(q => {
        const lines = pdf.splitTextToSize(`${q.id} ${q.texto}`, itemW - 3)
        return Math.max(8, lines.length * 2.7 + 3.5)
      })
      const blockH = rowLabels + rowValues + qHeights.reduce((a, b) => a + b, 0)

      if (y + blockH > pageH - M) { pdf.addPage(); y = M }

      // Columna vertical rotada, abarcando el bloque entero
      drawCell(pdf, M, y, vertW, blockH, { fill: C_WHITE })
      pdf.setFontSize(7)
      pdf.setFont(undefined, 'bold')
      pdf.setTextColor(0, 0, 0)
      const vTxt = 'Sub Conjunto Terminado'
      const vTxtW = pdf.getTextWidth(vTxt)
      pdf.text(vTxt, M + vertW / 2 + 1.2, y + blockH / 2 + vTxtW / 2, { angle: 90 })
      pdf.setFont(undefined, 'normal')

      // Nombre de la línea — celda gris que abarca las dos filas de encabezado
      drawCell(pdf, M + vertW, y, itemW, rowLabels + rowValues, { fill: C_GREY, text: linea, size: 9.5, bold: true })

      // Etiquetas Sub Conjunto: / Modelo: / Lote: por muestreo
      for (let i = 0; i < 3; i++) {
        ['Sub Conjunto:', 'Modelo:', 'Lote:'].forEach((lab, j) => {
          drawCell(pdf, gridX + (i * 3 + j) * subW, y, subW, rowLabels, {
            fill: C_PEACH_LIGHT, text: lab, size: 5.5, bold: true, align: 'left',
          })
        })
      }
      // Valores cargados
      muestras.forEach((m, i) => {
        [m.subConjunto, m.modelo, m.lote].forEach((v, j) => {
          drawCell(pdf, gridX + (i * 3 + j) * subW, y + rowLabels, subW, rowValues, {
            fill: C_PEACH, text: v || '', size: 6, bold: true, wrap: true,
          })
        })
      })

      // Preguntas — el resultado ocupa las 3 subcolumnas de su muestreo
      let yy = y + rowLabels + rowValues
      QUESTIONS.forEach((q, qi) => {
        const h = qHeights[qi]
        drawCell(pdf, M + vertW, yy, itemW, h, { text: `${q.id} ${q.texto}`, size: 6.5, wrap: true })
        muestras.forEach((m, i) => {
          const val = m.respuestas?.[q.id]?.resultado || ''
          const fill = val === 'OK' ? C_OK : val === 'NOK' ? C_NOK : val === 'N/A' ? C_PEACH : C_WHITE
          const color = (val === 'OK' || val === 'NOK') ? C_WHITE : [0, 0, 0]
          drawCell(pdf, gridX + i * muestreoW, yy, muestreoW, h, { fill, text: val, size: 7, bold: true, color })
        })
        yy += h
      })

      y += blockH
    }

    pdf.save(`checklist-producto-terminado-${r.turno || 'turno'}-${r.fecha}.pdf`)
  }

  // ── Export Excel ─────────────────────────────────────────────────────────
  // Misma grilla que el PDF: col A = "Sub Conjunto Terminado" rotado en
  // vertical, col B = Ítem, cols C..K = 3 muestreos × (Sub Conjunto | Modelo
  // | Lote). El nombre de línea y los resultados van combinados igual que en
  // el formulario oficial.
  async function exportarExcel(r) {
    const workbook = new ExcelJS.Workbook()
    const ws = workbook.addWorksheet('Check List')
    const NCOLS = 11 // A vertical + B ítem + 9 subcolumnas
    ws.columns = [{ width: 4 }, { width: 52 }, ...Array(9).fill({ width: 13 })]

    const fillOf = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
    const titleFill = fillOf('FF4472C4')
    const obsFill = fillOf('FFB8CCE4')
    const greyFill = fillOf('FFD9D9D9')
    const peachLightFill = fillOf('FFFCE4D6')
    const peachFill = fillOf('FFF8CBAD')
    const whiteFill = fillOf('FFFFFFFF')
    const okFill = fillOf('FF00B050')
    const nookFill = fillOf('FFFF0000')
    const thin = { style: 'thin', color: { argb: 'FF000000' } }
    const border = { top: thin, bottom: thin, left: thin, right: thin }
    const bordear = row => { for (let c = 1; c <= NCOLS; c++) ws.getCell(row, c).border = border }

    // ── Título: logo sobre A1:B1, franja azul en C1:K1 ──
    ws.getRow(1).height = 30
    ws.mergeCells(1, 1, 1, 2)
    ws.getCell(1, 1).fill = whiteFill
    ws.mergeCells(1, 3, 1, NCOLS)
    const titleCell = ws.getCell(1, 3)
    titleCell.value = 'CHECK LIST PRODUCTO TERMINADO DE SOLDADURA'
    titleCell.fill = titleFill
    titleCell.font = { bold: true, size: 13 }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    bordear(1)

    if (logo?.url) {
      try {
        const dataUrl = await toDataURL(logo.url)
        const [, ext] = dataUrl.match(/^data:image\/(\w+);base64,/) || [, 'png']
        const base64 = dataUrl.split(',')[1]
        const imageId = workbook.addImage({ base64, extension: ext === 'jpeg' ? 'jpeg' : 'png' })
        ws.addImage(imageId, { tl: { col: 0.1, row: 0.1 }, ext: { width: 110, height: 28 } })
      } catch { /* sin logo si falla la descarga */ }
    }

    // ── Encabezado: Fecha/Auditor/Supervisor en B, Turno y muestreos a la derecha ──
    const headStart = 2
    const infoRows = [
      `Fecha:   ${r.fecha ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR') : ''}`,
      `Auditor:   ${r.auditor || ''}`,
      `Supervisor:   ${r.supervisor || ''}`,
    ]
    infoRows.forEach((txt, i) => {
      const row = headStart + i
      ws.getRow(row).height = 15
      const cell = ws.getCell(row, 2)
      cell.value = txt
      cell.font = { bold: true, size: 9 }
      cell.alignment = { horizontal: 'left', vertical: 'middle' }
      bordear(row)
    })
    // "Turno:" sobre los dos primeros muestreos, el valor sobre el tercero
    ws.mergeCells(headStart, 3, headStart, 8)
    const turnoLabel = ws.getCell(headStart, 3)
    turnoLabel.value = 'Turno:'
    turnoLabel.font = { bold: true, size: 9 }
    turnoLabel.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.mergeCells(headStart, 9, headStart, 11)
    const turnoVal = ws.getCell(headStart, 9)
    turnoVal.value = (r.turno || '').toUpperCase()
    turnoVal.font = { bold: true, size: 9 }
    turnoVal.alignment = { horizontal: 'center', vertical: 'middle' }
    // Los 3 muestreos, abarcando las dos filas siguientes
    MUESTREOS.forEach((m, i) => {
      const startCol = 3 + i * 3
      ws.mergeCells(headStart + 1, startCol, headStart + 2, startCol + 2)
      const cell = ws.getCell(headStart + 1, startCol)
      cell.value = m
      cell.font = { bold: true, size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })

    let rIdx = headStart + 3

    if (r.observacionGeneral?.trim()) {
      ws.mergeCells(rIdx, 2, rIdx, NCOLS)
      const obsCell = ws.getCell(rIdx, 2)
      obsCell.value = `Obs: ${r.observacionGeneral}`
      obsCell.fill = obsFill
      obsCell.font = { bold: true, size: 10 }
      obsCell.alignment = { horizontal: 'center', vertical: 'middle' }
      bordear(rIdx)
      rIdx++
    }

    // Celda "Ítem" en la columna A, abarcando todo el encabezado
    ws.mergeCells(headStart, 1, rIdx - 1, 1)
    const itemHeadCell = ws.getCell(headStart, 1)
    itemHeadCell.value = 'Ítem'
    itemHeadCell.fill = greyFill
    itemHeadCell.font = { bold: true, size: 9 }
    itemHeadCell.alignment = { horizontal: 'center', vertical: 'middle' }

    // ── Un bloque por línea ──
    for (const linea of LINEAS) {
      const muestras = r.lineas?.[linea] || [emptyMuestra(), emptyMuestra(), emptyMuestra()]
      const blockStart = rIdx

      // Fila de etiquetas Sub Conjunto: / Modelo: / Lote:
      ws.getRow(rIdx).height = 14
      for (let i = 0; i < 3; i++) {
        ['Sub Conjunto:', 'Modelo:', 'Lote:'].forEach((lab, j) => {
          const cell = ws.getCell(rIdx, 3 + i * 3 + j)
          cell.value = lab
          cell.fill = peachLightFill
          cell.font = { bold: true, size: 8 }
          cell.alignment = { horizontal: 'left', vertical: 'middle' }
        })
      }
      bordear(rIdx)
      rIdx++

      // Fila de valores cargados
      ws.getRow(rIdx).height = 18
      muestras.forEach((m, i) => {
        [m.subConjunto || '', m.modelo || '', m.lote || ''].forEach((v, j) => {
          const cell = ws.getCell(rIdx, 3 + i * 3 + j)
          cell.value = v
          cell.fill = peachFill
          cell.font = { bold: true, size: 8.5 }
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        })
      })
      bordear(rIdx)
      rIdx++

      // Nombre de la línea — celda gris en la columna Ítem, abarcando las dos filas
      ws.mergeCells(blockStart, 2, blockStart + 1, 2)
      const lineaCell = ws.getCell(blockStart, 2)
      lineaCell.value = linea
      lineaCell.fill = greyFill
      lineaCell.font = { bold: true, size: 11 }
      lineaCell.alignment = { horizontal: 'center', vertical: 'middle' }

      // Preguntas — el resultado ocupa las 3 subcolumnas de su muestreo
      for (const q of QUESTIONS) {
        ws.getRow(rIdx).height = 26
        const qCell = ws.getCell(rIdx, 2)
        qCell.value = `${q.id} ${q.texto}`
        qCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }
        qCell.font = { size: 8.5 }
        muestras.forEach((m, i) => {
          const startCol = 3 + i * 3
          ws.mergeCells(rIdx, startCol, rIdx, startCol + 2)
          const cell = ws.getCell(rIdx, startCol)
          const val = m.respuestas?.[q.id]?.resultado || ''
          cell.value = val
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
          if (val === 'OK') { cell.fill = okFill; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 } }
          else if (val === 'NOK') { cell.fill = nookFill; cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 } }
          else if (val === 'N/A') { cell.fill = peachFill; cell.font = { size: 9 } }
        })
        bordear(rIdx)
        rIdx++
      }

      // Columna vertical rotada, abarcando el bloque entero
      ws.mergeCells(blockStart, 1, rIdx - 1, 1)
      const vertCell = ws.getCell(blockStart, 1)
      vertCell.value = 'Sub Conjunto Terminado'
      vertCell.font = { bold: true, size: 9 }
      vertCell.alignment = { horizontal: 'center', vertical: 'middle', textRotation: 90 }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `checklist-producto-terminado-${r.turno || 'turno'}-${r.fecha}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Export Evidencia fotográfica de NC (mismo patrón que Check List Soldadura) ──
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

    for (const item of items) {
      let dataUrl, dims
      try {
        dataUrl = await toDataURL(item.resp.fotoUrl)
        dims = await getImageSize(dataUrl)
      } catch { continue }

      const ratio = Math.min(photoMaxW / dims.w, photoMaxH / dims.h)
      const drawW = dims.w * ratio
      const drawH = dims.h * ratio
      const captionH = 12
      const blockH = photoMaxH + captionH + 6

      if (y + blockH > pageH - MARGIN) { pdf.addPage(); y = MARGIN; drawTitleBar() }

      const blockTop = y
      pdf.setDrawColor(0)
      pdf.rect(MARGIN, blockTop, catColW, blockH)
      pdf.rect(MARGIN + catColW, blockTop, pageW - MARGIN * 2 - catColW, blockH)

      pdf.setFontSize(8)
      pdf.setFont(undefined, 'bold')
      const catText = `${item.linea} · ${item.q.id}`
      const catTextW = pdf.getTextWidth(catText)
      pdf.text(catText, MARGIN + catColW / 2 + 1.5, blockTop + blockH / 2 + catTextW / 2, { angle: 90 })
      pdf.setFont(undefined, 'normal')

      const imgX = MARGIN + catColW + (photoMaxW - drawW) / 2
      const imgY = blockTop + 3 + (photoMaxH - drawH) / 2
      pdf.addImage(dataUrl, imgX, imgY, drawW, drawH, undefined, 'FAST')

      pdf.setFontSize(9)
      pdf.setFont(undefined, 'bold')
      const caption = item.resp.observacion || `${item.subConjunto || item.linea} — ${item.q.texto}`
      pdf.text(caption, pageW / 2, blockTop + photoMaxH + 3 + 6, { align: 'center', maxWidth: pageW - MARGIN * 2 - catColW - 10 })
      pdf.setFont(undefined, 'normal')

      y = blockTop + blockH + 6
    }

    pdf.save(`evidencias-nc-producto-terminado-${r.turno || 'turno'}-${r.fecha}.pdf`)
  }

  return (
    <div className="app">
      <Header title="Calidad — Producto Terminado" back="/calidad" />

      <div className="content">
        <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={abrirNuevo}>
          + Nuevo / continuar check list
        </button>

        <WeekCalendar selectedDate={filtroFecha} onSelect={setFiltroFecha} countByDate={countByDate} />

        {loading && <div className="spinner"><div className="spin" /></div>}
        {!loading && registrosDelDia.length === 0 && (
          <div className="empty"><div className="ei">📦</div><p>Sin check lists para esta fecha.</p></div>
        )}

        {registrosDelDia.map(r => {
          const { muestrasCargadas, nok } = resumen(r)
          return (
            <div key={r.id} style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Turno {r.turno || '—'}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>Auditor: {r.auditor} · Sup: {r.supervisor || '—'} · {muestrasCargadas}/9 muestras</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button onClick={() => abrirExistente(r)} style={{ background: '#e0f2f1', color: '#00796b', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 11, cursor: 'pointer' }}>✏️</button>
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
                {nok > 0 ? `⚠ ${nok} punto${nok !== 1 ? 's' : ''} NOK` : muestrasCargadas > 0 ? '✓ Todo OK' : 'Sin cargar todavía'}
              </div>
            </div>
          )
        })}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh', overflowY: 'auto' }}>
            <div className="modal-drag" />
            <h2>{editId ? 'Completar check list' : 'Nuevo check list'}</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="modal-field">
                <label>Fecha</label>
                <input type="date" value={form.fecha} onChange={e => { setForm({ ...form, fecha: e.target.value }); chequearDuplicado(e.target.value, form.turno) }} disabled={saving} />
              </div>
              <div className="modal-field">
                <label>Turno*</label>
                <select value={form.turno} onChange={e => { setForm({ ...form, turno: e.target.value }); chequearDuplicado(form.fecha, e.target.value) }} disabled={saving}>
                  <option value="">— Elegir —</option>
                  {TURNOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-field"><label>Auditor*</label><input value={form.auditor} onChange={e => setForm({ ...form, auditor: e.target.value })} disabled={saving} /></div>
            <div className="modal-field"><label>Supervisor</label><input value={form.supervisor} onChange={e => setForm({ ...form, supervisor: e.target.value })} disabled={saving} /></div>
            <div className="modal-field"><label>Observación general (opcional)</label><input value={form.observacionGeneral} onChange={e => setForm({ ...form, observacionGeneral: e.target.value })} placeholder="Ej: En cada recorrido se muestrean 3 subconjuntos" disabled={saving} /></div>

            {LINEAS.map(linea => {
              const cargadas = form.lineas[linea].filter(m => m.subConjunto.trim()).length
              const isOpen = openLinea === linea
              return (
                <div key={linea} style={{ marginTop: 14, border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden' }}>
                  <div onClick={() => setOpenLinea(isOpen ? null : linea)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                    background: '#e0f2f1', padding: '10px 12px',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#00796b' }}>Sub Conjunto Terminado — {linea}</span>
                    <span style={{ fontSize: 11, color: '#00796b' }}>{cargadas}/3 · {isOpen ? '▲' : '▼'}</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: 10 }}>
                      {MUESTREOS.map((label, idx) => {
                        const m = form.lineas[linea][idx]
                        return (
                          <div key={idx} style={{ background: '#f8f9fa', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                              <input value={m.subConjunto} onChange={e => setMuestra(linea, idx, { subConjunto: e.target.value })} placeholder="Sub Conjunto" style={inputStyle} disabled={saving} />
                              <input value={m.modelo} onChange={e => setMuestra(linea, idx, { modelo: e.target.value })} placeholder="Modelo" style={inputStyle} disabled={saving} />
                              <input value={m.lote} onChange={e => setMuestra(linea, idx, { lote: e.target.value })} placeholder="Lote" style={inputStyle} disabled={saving} />
                            </div>
                            {QUESTIONS.map(q => (
                              <div key={q.id} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 8, marginBottom: 6 }}>
                                <div style={{ fontSize: 11.5, marginBottom: 6 }}><strong>{q.id}</strong> {q.texto}</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <select value={m.respuestas[q.id].resultado} onChange={e => setResp(linea, idx, q.id, { resultado: e.target.value })} style={{ ...inputStyle, width: 84, flexShrink: 0 }}>
                                    <option value="">—</option>
                                    <option value="OK">OK</option>
                                    <option value="NOK">NOK</option>
                                    <option value="N/A">N/A</option>
                                  </select>
                                  <input value={m.respuestas[q.id].observacion} onChange={e => setResp(linea, idx, q.id, { observacion: e.target.value })} placeholder="Observación (opcional)" style={inputStyle} disabled={saving} />
                                </div>
                                {m.respuestas[q.id].resultado === 'NOK' && (
                                  <FotoNOK fotoUrl={m.respuestas[q.id].fotoUrl} onChange={url => setResp(linea, idx, q.id, { fotoUrl: url })} />
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}

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
