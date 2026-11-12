import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { gruposDias, celdaGrupo, tareasDePuesto, cascadaDePuesto, nivel, pctTexto, faltaTexto } from './planSemanalCalc'

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const fc = f => { const [, m, d] = f.split('-'); return `${d}/${m}` }
const dn = f => DIAS[new Date(f + 'T00:00:00Z').getUTCDay()]
const dur = seg => {
  if (!isFinite(seg) || seg <= 0) return '—'
  const s = Math.round(seg)
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`
}
const num = n => (isFinite(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: 1 }) : '—')
const nombreMes = id => {
  const [y, m] = String(id).split('-').map(Number)
  const t = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const COLOR = {
  verde: { fill: [232, 245, 233], text: [46, 125, 50] },
  naranja: { fill: [255, 243, 224], text: [230, 81, 0] },
  rojo: { fill: [255, 235, 238], text: [198, 40, 40] },
  vacio: { fill: [245, 245, 245], text: [150, 150, 150] },
}

// Cascada de un puesto dibujada a mano: una fila por tarea, cada barra arranca
// donde terminó la anterior; línea punteada = fin del tiempo disponible.
function dibujarCascada(pdf, cas, y, M, W) {
  const H = pdf.internal.pageSize.getHeight()
  const labelW = 92
  const timeW = 22
  const x0 = M + labelW
  const ancho = W - M - timeW - x0
  const rowH = 5
  const escala = Math.max(cas.total, cas.disp, 1)
  const X = v => x0 + (v / escala) * ancho
  const filas = [...cas.filas.map(f => ({ ...f, label: `${f.code} · ${f.desc}`, sub: `${f.plataforma} ${f.cap} · ${num(f.units)} u` })),
    { label: 'Total del puesto', sub: cas.disp > 0 ? `disponible ${dur(cas.disp)}` : 'sin turno', inicio: 0, seg: cas.total, total: true }]
  filas.forEach(f => {
    if (y + rowH > H - 12) { pdf.addPage(); y = 14 }
    pdf.setFillColor(245, 247, 250); pdf.rect(x0, y + 0.4, ancho, rowH - 0.8, 'F')
    const fin = f.inicio + f.seg
    const dentro = Math.max(0, Math.min(fin, cas.disp || 0) - f.inicio)
    if (dentro > 0) {
      if (f.total) pdf.setFillColor(69, 90, 100); else pdf.setFillColor(30, 136, 229)
      pdf.rect(X(f.inicio), y + 1, Math.max(0.3, X(f.inicio + dentro) - X(f.inicio)), rowH - 2, 'F')
    }
    if (f.seg - dentro > 0) {
      pdf.setFillColor(229, 57, 53)
      pdf.rect(X(f.inicio + dentro), y + 1, Math.max(0.3, X(fin) - X(f.inicio + dentro)), rowH - 2, 'F')
    }
    pdf.setTextColor(30); pdf.setFont('helvetica', f.total ? 'bold' : 'normal'); pdf.setFontSize(7)
    pdf.text(pdf.splitTextToSize(f.label, labelW - 2)[0], M, y + 2.4)
    pdf.setFontSize(6); pdf.setTextColor(110)
    pdf.text(f.sub, M, y + 4.6)
    pdf.setFontSize(7); pdf.setTextColor(30)
    pdf.text(dur(f.seg), W - M, y + 3.4, { align: 'right' })
    if (cas.disp > 0) {
      pdf.setDrawColor(38, 50, 56); pdf.setLineWidth(0.4); pdf.setLineDashPattern([0.8, 0.8], 0)
      pdf.line(X(cas.disp), y, X(cas.disp), y + rowH)
      pdf.setLineDashPattern([], 0)
    }
    y += rowH
  })
  if (cas.disp > 0) {
    pdf.setFontSize(6); pdf.setTextColor(38, 50, 56); pdf.setFont('helvetica', 'bold')
    pdf.text('fin del turno', X(cas.disp), y + 2.5, { align: 'center' })
  }
  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(0)
  return y + 4
}

// Exporta el Plan semanal o mensual (lo que se ve en pantalla) para imprimir, A4 apaisado.
export function exportPlanSemanalPdf({ plan, planLinea, lineaSol, periodo, esMes, horas, eficPct }) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const M = 10
  const dias = plan.dias
  const fin = dias[dias.length - 1]?.fecha || periodo
  const totalTxt = esMes ? 'Mes' : 'Semana'

  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15)
  pdf.text(`Plan ${esMes ? 'mensual' : 'semanal'} — Soldadura`, M, 13)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10)
  const per = esMes ? `${nombreMes(periodo)} (${dias.length} días con producción)` : `Semana del ${fc(periodo)} al ${fc(fin)}`
  pdf.text(`Línea ${planLinea} (soldadura ${lineaSol}) · ${per} · ${num(plan.equipos)} equipos`, M, 19)
  pdf.setFontSize(8.5); pdf.setTextColor(110)
  pdf.text(`Generado: ${new Date().toLocaleString('es-AR')}`, W - M, 13, { align: 'right' })
  pdf.text(`Turno de ${horas.toLocaleString('es-AR', { maximumFractionDigits: 2 })} h · eficiencia ${num(eficPct)}% · verde hasta 90%, naranja hasta 100%, rojo si pasa el turno`, M, 24)
  pdf.setTextColor(0)

  // Tabla puestos × días (semana) o puestos × semanas (mes)
  const grupos = gruposDias(dias, esMes)
  const rango = g => {
    const f1 = dias[g.idxs[0]].fecha
    const f2 = dias[g.idxs[g.idxs.length - 1]].fecha
    return f1 === f2 ? fc(f1) : `${fc(f1)}–${fc(f2)}`
  }
  const head = [['Puesto', ...grupos.map(g => {
    if (esMes) {
      const faltaEq = g.idxs.reduce((a, i) => a + (dias[i].faltaEq || 0), 0)
      return `${rango(g)}\n${g.idxs.length} días · ${num(g.equipos)} eq\ndisp. ${dur(g.dispSeg)}${faltaEq > 0 ? `\nno salen ${num(faltaEq)} eq` : ''}`
    }
    const d = dias[g.idxs[0]]
    const t = d.equipos > 0 ? `${num(d.equipos)} eq · ${d.turnos} T${d.turnosEditado ? ' (manual)' : d.turnosEstimados ? '*' : ''}\ndisp. ${dur(d.dispSeg)}` : `${d.turnos} T · sin prod.`
    return `${dn(d.fecha)} ${fc(d.fecha)}\n${t}${d.faltaEq > 0 ? `\nno salen ${num(d.faltaEq)} eq` : ''}`
  }), totalTxt]]
  const niveles = []
  const body = plan.puestos.map(p => {
    const celdas = [...grupos.map(g => celdaGrupo(p, g)), { pct: p.pctTotal, seg: p.totalSeg, faltaSeg: p.faltaSeg, faltaEq: 0 }]
    niveles.push(celdas.map(c => nivel(c.pct)))
    return [p.label, ...celdas.map(c => (c.pct == null ? '—' : `${pctTexto(c.pct)}\n${dur(c.seg)}${c.faltaSeg > 0 ? `\n${faltaTexto(c.faltaSeg, c.faltaEq, dur)}` : ''}`))]
  })
  autoTable(pdf, {
    startY: 28, head, body, theme: 'grid', margin: { left: M, right: M },
    styles: { fontSize: 8, cellPadding: 1.6, halign: 'center', valign: 'middle' },
    headStyles: { fillColor: [21, 101, 192], textColor: 255, fontSize: 7.5 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 28 } },
    didParseCell: d => {
      if (d.section !== 'body' || d.column.index === 0) return
      const c = COLOR[niveles[d.row.index]?.[d.column.index - 1]]
      if (c) { d.cell.styles.fillColor = c.fill; d.cell.styles.textColor = c.text; d.cell.styles.fontStyle = 'bold' }
    },
  })
  if (esMes) {
    pdf.setFontSize(7.5); pdf.setTextColor(110)
    pdf.text('En el mes cada columna es una semana (suma sus días con producción); el detalle por día está en la pantalla y en las alertas.', M, pdf.lastAutoTable.finalY + 4)
    pdf.setTextColor(0)
  }

  // Alertas
  if (plan.alertas.length) {
    autoTable(pdf, {
      startY: pdf.lastAutoTable.finalY + 7, margin: { left: M, right: M }, theme: 'plain',
      head: [[`Alertas de sobrecarga — ${esMes ? 'en el mes' : 'en la semana'} faltan ${dur(plan.faltaSeg)} (horas-persona extra) · aprox. ${num(plan.faltaEq)} equipos no salen`]],
      headStyles: { textColor: [198, 40, 40], fontSize: 10 },
      body: plan.alertas.map(a => [
        `${a.puesto} · ${dn(a.fecha)} ${fc(a.fecha)}: ${pctTexto(a.pct)} — ${faltaTexto(a.faltaSeg, a.faltaEq, dur)} (necesita ${dur(a.seg)}, hay ${dur(a.dispSeg)})` +
        (a.top.length ? ` (más carga: ${a.top.map(t => `${t.plataforma} ${t.cap} ${t.code}`).join(' · ')})` : ''),
      ]),
      styles: { fontSize: 8, cellPadding: 0.8, textColor: [183, 28, 28] },
    })
  }

  // Cada puesto: cascada del período + cantidades por día (semana) o por semana (mes)
  plan.puestos.forEach(p => {
    pdf.addPage()
    let y = 14
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12)
    pdf.text(`${p.label} — ${totalTxt.toLowerCase()}: ${pctTexto(p.pctTotal)} · ${dur(p.totalSeg)}${p.faltaSeg > 0 ? ` · falta ${dur(p.faltaSeg)}` : ''}`, M, y)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(110)
    pdf.text(`Cascada ${esMes ? 'del mes' : 'de la semana'}: cada tarea arranca donde termina la anterior; la línea punteada es el fin del tiempo disponible y lo rojo no entra.`, M, y + 5)
    pdf.setTextColor(0)
    y = dibujarCascada(pdf, cascadaDePuesto(p, dias.map((_, i) => i), dias), y + 9, M, W)

    const filas = tareasDePuesto(p, grupos)
    if (y > H - 30) { pdf.addPage(); y = 14 }
    autoTable(pdf, {
      startY: y + 2, margin: { left: M, right: M }, theme: 'grid',
      head: [['Modelo', 'Código', 'Tarea', ...grupos.map(g => (esMes ? rango(g) : `${dn(g.key)} ${fc(g.key)}`)), 'Tiempo']],
      body: filas.map(r => [
        `${r.plataforma} ${r.cap}`, r.code, r.desc,
        ...r.porDia.map(x => (x ? `${num(x.units)}\n${dur(x.seg)}` : '—')),
        dur(r.segTotal),
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.3, valign: 'middle' },
      headStyles: { fillColor: [225, 229, 235], textColor: 40, fontSize: 7.5 },
      columnStyles: Object.fromEntries([...grupos.map((_, i) => [i + 3, { halign: 'center' }]), [grupos.length + 3, { halign: 'center', fontStyle: 'bold' }]]),
    })
  })

  // Modelos del período
  autoTable(pdf, {
    startY: pdf.lastAutoTable.finalY + 6, margin: { left: M, right: M }, theme: 'grid',
    head: [['Modelo', `Equipos ${esMes ? 'del mes' : 'de la semana'}`, 'Estado']],
    body: plan.modelos.map(m => [`${m.plataforma} ${m.cap}`, num(m.qty), m.ok ? (m.estado || 'En el plan') : m.estado]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [225, 229, 235], textColor: 40 },
    didParseCell: d => {
      if (d.section === 'body' && d.column.index === 2) {
        const m = plan.modelos[d.row.index]
        d.cell.styles.textColor = !m.ok ? [198, 40, 40] : m.estado ? [230, 81, 0] : [46, 125, 50]
      }
    },
  })
  if (dias.some(d => d.turnosEstimados)) {
    pdf.setFontSize(7.5); pdf.setTextColor(110)
    pdf.text('* El Excel no trae turnos ese día: se usó 1 turno.', M, pdf.lastAutoTable.finalY + 5)
  }

  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(130)
    pdf.text(`Página ${i} de ${n}`, W - M, H - 6, { align: 'right' })
  }
  pdf.save(`Plan_${esMes ? 'mensual' : 'semanal'}_${planLinea.replace(/\s+/g, '')}_${periodo}.pdf`)
}
