import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { unidadesTarea } from './puestosCalc'

const mmss = cs => {
  const t = Math.round((cs || 0) / 100)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
const dur = seg => {
  if (!isFinite(seg) || seg <= 0) return '—'
  const s = Math.round(seg)
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`
}
const num = n => (isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '—')

// Exporta la distribución de puestos armada (lo que se ve en pantalla) para imprimir.
export function exportPuestosPdf({
  modelo, cap, linea, params, dot, porPuesto, sinAsignar, bottleneck, meta, diasParaMeta, taktCs,
}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const M = 12

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15)
  pdf.text('Distribución de Puestos — Soldadura', M, 14)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10)
  pdf.text(`${modelo} · ${cap} · Línea ${linea}`, M, 20)
  pdf.setFontSize(8.5); pdf.setTextColor(110)
  pdf.text(`Generado: ${new Date().toLocaleString('es-AR')}`, W - M, 14, { align: 'right' })
  pdf.setTextColor(0)

  const activos = porPuesto.filter(p => p.asignadas.length > 0)
  const resumen = [
    ['Takt de la línea', dot ? `${dur(dot.taktSeg)} (${dot.fuente === 'cargado' ? 'cargado en Takt Time' : 'calculado con la meta'})` : '—'],
    ['Trabajo por equipo', dot ? dur(dot.trabajoSeg) : '—'],
    ['Personas necesarias', dot?.real ? `${dot.real.N} (mínimo teórico ${dot.minTeo})` : '—'],
    ['Personas armadas', `${porPuesto.length} (${activos.length} con tareas)`],
    ['Meta', meta > 0 ? `${meta} equipos en ${params.diasPlazo} días` : '—'],
    ['Turnos', `${params.horasTurno} h × ${params.turnosDia} turno(s) · ${params.eficPct}% eficiencia`],
    ['Puesto cuello de botella', bottleneck ? `${bottleneck.nombre} (${mmss(bottleneck.tcCs)} por equipo)` : '—'],
    ['Ritmo de la línea', bottleneck ? `${num(bottleneck.unHs)} eq/h · ${num(bottleneck.unTurno)} eq/turno · ${num(bottleneck.unDia)} eq/día` : '—'],
    ['Días para la meta', bottleneck && meta > 0 ? `aprox. ${num(diasParaMeta)} días (plazo ${params.diasPlazo})` : '—'],
  ]
  autoTable(pdf, {
    startY: 24, body: resumen, theme: 'grid', margin: { left: M, right: M },
    styles: { fontSize: 8.5, cellPadding: 1.6 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [240, 242, 245], cellWidth: 48 } },
  })

  porPuesto.forEach(p => {
    const pct = taktCs > 0 ? Math.round((p.tcCs / taktCs) * 100) : null
    const esCuello = bottleneck && p.id === bottleneck.id
    // Cantidad que el puesto puede hacer en el turno (ya con la eficiencia aplicada).
    // Cada tarea rinde el ritmo del puesto × su cantidad por equipo × su % (cascada).
    const body = p.asignadas.map(t => {
      // Tarea dividida entre dos puestos: se completa el mismo número en ambos (el del puesto más lento)
      const u = unidadesTarea(porPuesto, t.code)
      return [
        t.code,
        t.desc + (t.share < 1 ? ` (${Math.round(t.share * 100)}%)` : ''),
        `×${t.cant}`,
        mmss(t.tStd),
        mmss(t.tStd * t.cant * t.share),
        num(u.turno),
        dur((t.tStd / 100) * t.share * u.turno),
      ]
    })
    if (!body.length) body.push([{ content: 'Sin tareas asignadas', colSpan: 7, styles: { textColor: 130, fontStyle: 'italic' } }])
    const capacidad = p.asignadas.length
      ? `Capacidad en turno de ${params.horasTurno} h:  ${num(p.unHs)} eq/h  ·  ${num(p.unTurno)} eq/turno  ·  ${num(p.unDia)} eq/día (${params.turnosDia} turno${Number(params.turnosDia) === 1 ? '' : 's'})`
      : ''
    autoTable(pdf, {
      startY: (pdf.lastAutoTable?.finalY || 24) + 5,
      margin: { left: M, right: M },
      head: [[{
        content: `${p.nombre}${esCuello ? '  — CUELLO DE BOTELLA' : ''}   ·   Carga ${mmss(p.tcCs)}${pct !== null ? ` (${pct}% del takt)` : ''}${capacidad ? `\n${capacidad}` : ''}`,
        colSpan: 7,
        styles: { fillColor: esCuello ? [198, 40, 40] : pct !== null && pct > 100 ? [198, 40, 40] : [51, 51, 51], textColor: 255, halign: 'left' },
      }], ['Código', 'Subconjunto', 'Cant.', 'T. estándar', 'Tiempo en puesto', 'Cant. por turno', 'Ocupa del turno']],
      body, theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.4 },
      headStyles: { fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'center', cellWidth: 12 }, 3: { halign: 'center', cellWidth: 19 }, 4: { halign: 'center', cellWidth: 21 }, 5: { halign: 'center', cellWidth: 21, fontStyle: 'bold' }, 6: { halign: 'center', cellWidth: 24 } },
      didParseCell: d => { if (d.section === 'head' && d.row.index === 1) { d.cell.styles.fillColor = [225, 229, 235]; d.cell.styles.textColor = 40 } },
    })
  })

  const hayDivididas = porPuesto.some(p => p.asignadas.some(t => t.share < 1))
  if (hayDivididas) {
    pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.5); pdf.setTextColor(110)
    pdf.text('Las tareas divididas entre dos puestos (%) se completan con el mismo número en ambos: lo define el puesto más lento.', M, (pdf.lastAutoTable?.finalY || 24) + 4.5)
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0)
  }
  if (sinAsignar.length) {
    autoTable(pdf, {
      startY: (pdf.lastAutoTable?.finalY || 24) + (hayDivididas ? 9 : 5), margin: { left: M, right: M },
      head: [[{ content: `Tareas sin asignar (${sinAsignar.length})`, colSpan: 3, styles: { fillColor: [230, 81, 0], textColor: 255, halign: 'left' } }]],
      body: sinAsignar.map(t => [t.code, t.desc, mmss(t.tStd)]),
      theme: 'grid', styles: { fontSize: 8, cellPadding: 1.4 },
      columnStyles: { 0: { cellWidth: 24 }, 2: { cellWidth: 24, halign: 'center' } },
    })
  }

  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(130)
    pdf.text(`Página ${i} de ${n}`, W / 2, 290, { align: 'center' })
  }
  const safe = s => String(s).replace(/[^\w.-]+/g, '_')
  pdf.save(`Puestos_${safe(modelo)}_${safe(cap)}_${safe(linea)}.pdf`)
}
