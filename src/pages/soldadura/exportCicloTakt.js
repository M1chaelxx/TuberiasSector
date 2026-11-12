import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { db } from '../../firebase'
import { fmt } from '../../components/Timer'

const PUESTOS_SOL = [
  'SOL-01', 'SOL-02', 'SOL-03', 'SOL-04', 'SOL-05', 'SOL-06',
  'SOL-07', 'SOL-08', 'SOL-09', 'SOL-10', 'SOL-11', 'SOL-12',
  'SOL-13', 'SOL-14', 'SOL-15', 'SOL-16', 'SOL-17', 'SOL-18',
  'Preformado',
]

function parseTime(str) {
  if (!str) return 0
  const p = String(str).split(':').map(Number)
  if (p.length === 3) return p[0] * 6000 + p[1] * 100 + p[2]
  if (p.length === 2) return p[0] * 6000 + p[1] * 100
  return 0
}

// Tareas de un modelo+cap (Completo + Parciales con código propio) con el
// mismo storageKey que usan las mediciones y los ciclos (||P cuando un
// Parcial comparte código con su propio Completo).
function tareasDe(modelo) {
  const out = []
  for (const s of (modelo.subconjuntos || [])) {
    const codeC = s.codCompleto || s.codigo
    if (!codeC) continue
    out.push({ code: codeC, desc: s.descGral || s.titulo || codeC, tipo: 'Completo', linea: s.linea || '', storageKey: codeC })
    for (const par of (s.parciales || [])) {
      if (!par.codParcial) continue
      out.push({
        code: par.codParcial, desc: par.descSubc || par.codParcial, tipo: 'Parcial', linea: s.linea || '',
        storageKey: par.codParcial === codeC ? `${par.codParcial}||P` : par.codParcial,
      })
    }
  }
  return out
}

// Promedio total del subconjunto: todas sus mediciones (en cualquier puesto),
// tiempo normal por unidad (tiempoNorm ÷ cantidad de subconjuntos).
function promedioDe(tiemposDoc, storageKey) {
  const vals = []
  const puestos = []
  for (const p of PUESTOS_SOL) {
    const meds = tiemposDoc?.[storageKey]?.[p]?.mediciones || []
    if (meds.length) puestos.push(p)
    meds.forEach(m => vals.push((m.tiempoNorm || 0) / (m.subconjuntosQty || 1)))
  }
  if (!vals.length) return { avg: 0, n: 0, puestos }
  return { avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), n: vals.length, puestos }
}

export async function exportarCicloTaktPDF(filtroModelo = '') {
  const [modelosSnap, tiemposSnap, ciclosSnap, taktSnap] = await Promise.all([
    getDocs(collection(db, 'soldadura_modelos')),
    getDocs(collection(db, 'soldadura_tiempos')),
    getDoc(doc(db, 'config', 'ciclos_soldadura')),
    getDoc(doc(db, 'config', 'takt_soldadura')),
  ])
  const ciclos = ciclosSnap.exists() ? ciclosSnap.data() : {}
  const takt = taktSnap.exists() ? taktSnap.data() : {}
  const tiempos = {}
  tiemposSnap.docs.forEach(d => { tiempos[d.id] = d.data() })

  const modelos = modelosSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => !filtroModelo || (m.modelo || m.id) === filtroModelo)
    .sort((a, b) => `${a.modelo || a.id} ${a.cap || ''}`.localeCompare(`${b.modelo || b.id} ${b.cap || ''}`))
  if (!modelos.length) return false

  const pdf = new jsPDF({ orientation: 'landscape' })
  const pageW = pdf.internal.pageSize.getWidth()
  pdf.setFontSize(14)
  pdf.text('Ciclo y Takt Time — Soldadura', 14, 14)
  pdf.setFontSize(9)
  pdf.text(
    `Generado: ${new Date().toLocaleString('es-AR')}${filtroModelo ? ` · Modelo: ${filtroModelo}` : ' · Todos los modelos'}`,
    14, 20,
  )
  pdf.text('T. Normal prom.: promedio de todas las mediciones del subconjunto (tiempo normal por unidad, todos los puestos).', 14, 25)

  let y = 30
  for (const m of modelos) {
    const tareas = tareasDe(m)
    if (!tareas.length) continue
    const lineas = [...new Set(tareas.map(t => t.linea).filter(Boolean))].sort()

    // Takt por línea (clave docId||línea; cae al docId legado si no hay por línea)
    const taktTxt = lineas.length
      ? lineas.map(l => `${l}: ${takt[`${m.id}||${l}`] || takt[m.id] || '—'}`).join('    ')
      : (takt[m.id] || '—')

    if (y > 170) { pdf.addPage(); y = 14 }
    pdf.setFontSize(11)
    pdf.setFont(undefined, 'bold')
    pdf.text(`${m.modelo || m.id}  —  ${m.cap || ''}`, 14, y)
    pdf.setFont(undefined, 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(180, 90, 0)
    pdf.text(`Takt Time  ${taktTxt}`, pageW - 14, y, { align: 'right' })
    pdf.setTextColor(0, 0, 0)

    const body = tareas.map(t => {
      const cicloStr = ciclos[`${m.id}||${t.storageKey}`]
      const { avg, n, puestos } = promedioDe(tiempos[m.id], t.storageKey)
      return [
        t.linea || '—', t.code, t.desc, t.tipo,
        parseTime(cicloStr) > 0 ? fmt(parseTime(cicloStr)) : '—',
        n ? fmt(avg) : '—',
        n ? String(n) : '0',
        puestos.join(', ') || '—',
      ]
    })

    autoTable(pdf, {
      startY: y + 3,
      head: [['Línea', 'Código', 'Descripción', 'Tipo', 'Ciclo', 'T. Normal prom.', 'Med.', 'Puestos medidos']],
      body,
      styles: { fontSize: 7.5, cellPadding: 1.6 },
      headStyles: { fillColor: [26, 115, 232], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 24 }, 3: { cellWidth: 20 }, 4: { cellWidth: 26, halign: 'center' }, 5: { cellWidth: 30, halign: 'center', fontStyle: 'bold' }, 6: { cellWidth: 12, halign: 'center' } },
      margin: { left: 14, right: 14 },
    })
    y = pdf.lastAutoTable.finalY + 10
  }

  const h = new Date()
  const f = `${String(h.getDate()).padStart(2, '0')}-${String(h.getMonth() + 1).padStart(2, '0')}-${h.getFullYear()}`
  pdf.save(`ciclo-takt-soldadura-${f}.pdf`)
  return true
}
