import { useState, useRef } from 'react'

// Selector de fecha por semana con puntos indicando qué días tienen datos —
// mismo patrón que ya usa el Resumen de Soldadura/Tuberías. Reemplaza al
// <input type="date"> nativo, que no permite marcar días con contenido (el
// calendario del navegador no se puede customizar).
const DAYS_ES = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

export default function WeekCalendar({ selectedDate, onSelect, countByDate = {} }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date()))
  const jumpRef = useRef()

  // Para consultas de fechas lejanas (análisis históricos) — el calendario
  // nativo del navegador sirve acá solo como "selector rápido de fecha
  // puntual" (sin puntos, oculto), no como el filtro visible principal.
  function jumpToDate(dateStr) {
    if (!dateStr) return
    onSelect(dateStr)
    setWeekStart(startOfWeek(new Date(dateStr + 'T12:00:00')))
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
  const today = toDateStr(new Date())
  const weekLabel = (() => {
    const s = weekDays[0], e = weekDays[6]
    const sameMonth = s.getMonth() === e.getMonth()
    return sameMonth
      ? `${s.getDate()} – ${e.getDate()} ${MONTHS_ES[s.getMonth()]} ${s.getFullYear()}`
      : `${s.getDate()} ${MONTHS_ES[s.getMonth()]} – ${e.getDate()} ${MONTHS_ES[e.getMonth()]} ${s.getFullYear()}`
  })()

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 10px 4px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 6, position: 'relative' }}>
        <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
          style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>‹</button>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', flex: 1, textAlign: 'center' }}>{weekLabel}</span>
        <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
          style={{ background: 'none', border: '1px solid #ddd', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>›</button>
        <button onClick={() => jumpRef.current?.showPicker ? jumpRef.current.showPicker() : jumpRef.current?.click()}
          title="Ir a una fecha específica"
          style={{ background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>📅</button>
        <input ref={jumpRef} type="date" value={selectedDate || ''} onChange={e => jumpToDate(e.target.value)}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, paddingBottom: 8 }}>
        {weekDays.map(d => {
          const ds = toDateStr(d)
          const count = countByDate[ds] || 0
          const isSelected = selectedDate === ds
          const isToday = ds === today
          return (
            <div key={ds} onClick={() => onSelect(ds)} style={{
              borderRadius: 10, padding: '5px 2px 16px', textAlign: 'center', cursor: 'pointer',
              border: isToday && !isSelected ? '1.5px solid orange' : '1.5px solid transparent',
              background: isSelected ? 'var(--primary)' : '#f5f5f5',
              color: isSelected ? '#fff' : 'var(--text-primary)',
              transition: 'all .15s', position: 'relative', minHeight: 48,
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: isSelected ? 'rgba(255,255,255,0.75)' : 'var(--text-secondary)' }}>
                {DAYS_ES[d.getDay()]}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 1 }}>{d.getDate()}</div>
              {count > 0 && (
                <div style={{
                  position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                  background: isSelected ? '#fff' : '#4caf50',
                  color: isSelected ? 'var(--primary)' : '#fff',
                  borderRadius: '50%', width: 15, height: 15,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                }}>{count}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
