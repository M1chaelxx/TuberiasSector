import * as XLSX from 'xlsx'

// Lee el Excel "Secuencia de producción" (hoja única, una fila por lote:
// LINEA / Orden / Modelo / … / Qty / IN / OUT, y a la derecha una grilla con
// las unidades de cada día). Devuelve las cantidades agrupadas por mes:
//   { 'YYYY-MM': { items: [{ linea, plataforma, cap, qty, marcas }], dias: { 'IDU': n, … },
//                  diario: { 'YYYY-MM-DD': { 'IDU': { turnos, items: [{ plataforma, cap, qty }] } } } } }
// `diario` es lo que usa el Plan semanal (unidades de cada modelo por día y los
// turnos de cada línea que trae el Excel).
// Se usa la grilla diaria (no el Qty del lote) porque un lote puede cruzar
// de un mes al siguiente.

const LINEAS = ['IDU', 'ODU I', 'ODU II']
const MARCAS = ['MIDEA', 'SURREY', 'COMFEE', 'CARRIER']

// Serie de Excel → "YYYY-MM"
function mesDeSerial(v) {
  return new Date((v - 25569) * 864e5).toISOString().slice(0, 7)
}

// Serie de Excel → "YYYY-MM-DD"
function diaDeSerial(v) {
  return new Date((v - 25569) * 864e5).toISOString().slice(0, 10)
}

// "IDU MIDEA INVERTER AG R32 22FC" → { marca: 'MIDEA', plataforma: 'INVERTER AG R32', cap: '22FC' }
export function parseModeloSecuencia(txt) {
  const t = String(txt || '').trim().toUpperCase().split(/\s+/)
  if (t[0] === 'IDU' || t[0] === 'ODU') t.shift()
  let marca = ''
  if (MARCAS.includes(t[0])) marca = t.shift()
  let cap = ''
  if (t.length && /^\d+F[CS]$/.test(t[t.length - 1])) cap = t.pop()
  return { marca, plataforma: t.join(' '), cap }
}

// Clave para comparar nombres de modelo sin importar mayúsculas ni el orden de
// las palabras ("AG FIJO R32" = "Fijo AG R32").
export function claveModelo(nombre) {
  return String(nombre || '').toUpperCase().trim().split(/\s+/).filter(Boolean).sort().join(' ')
}

export function parseSecuencia(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  const hIdx = rows.findIndex(r => String(r[1]).trim().toUpperCase() === 'LINEA' && String(r[3]).trim().toUpperCase() === 'MODELO')
  if (hIdx < 0) throw new Error('No encontré la fila de encabezados (LINEA / Modelo). ¿Es el Excel de Secuencia?')
  const hdr = rows[hIdx]
  const cols = []
  hdr.forEach((v, i) => { if (i > 8 && typeof v === 'number' && v > 40000) cols.push({ i, mes: mesDeSerial(v) }) })
  if (!cols.length) throw new Error('No encontré las columnas de fechas de la secuencia.')

  // Turnos por día de cada línea: las 3 filas que siguen a la etiqueta "TURNOS"
  const turnosDe = {}
  const tIdx = rows.findIndex(r => String(r[9]).trim().toUpperCase() === 'TURNOS')
  if (tIdx >= 0 && tIdx < hIdx) {
    for (const r of rows.slice(tIdx, tIdx + 3)) {
      const l = String(r[11]).trim()
      if (LINEAS.includes(l)) turnosDe[l] = r
    }
  }

  const fechas = {}
  cols.forEach(c => { fechas[c.i] = diaDeSerial(hdr[c.i]) })
  const meses = {}
  const diasSet = {} // mes -> línea -> Set(columna con producción)
  for (const r of rows.slice(hIdx + 1)) {
    const linea = String(r[1]).trim()
    if (!LINEAS.includes(linea) || !r[3]) continue
    const { marca, plataforma, cap } = parseModeloSecuencia(r[3])
    if (!plataforma || !cap) continue
    for (const { i, mes } of cols) {
      const q = Number(r[i]) || 0
      if (q <= 0) continue
      const m = (meses[mes] ||= { items: [], dias: {}, diario: {} })
      let it = m.items.find(x => x.linea === linea && x.plataforma === plataforma && x.cap === cap)
      if (!it) { it = { linea, plataforma, cap, qty: 0, marcas: {} }; m.items.push(it) }
      it.qty += q
      if (marca) it.marcas[marca] = (it.marcas[marca] || 0) + q
      ;((diasSet[mes] ||= {})[linea] ||= new Set()).add(i)
      const dia = ((m.diario ||= {})[fechas[i]] ||= {})
      const dl = (dia[linea] ||= { turnos: Number(turnosDe[linea]?.[i]) || 0, items: [] })
      const di = dl.items.find(x => x.plataforma === plataforma && x.cap === cap)
      if (di) di.qty += q
      else dl.items.push({ plataforma, cap, qty: q })
    }
  }
  for (const mes of Object.keys(meses)) {
    for (const l of LINEAS) meses[mes].dias[l] = diasSet[mes]?.[l]?.size || 0
    meses[mes].items.sort((a, b) => b.qty - a.qty)
  }
  return meses
}
