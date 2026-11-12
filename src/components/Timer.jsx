// Formato mm:ss:cc usado en toda la app para mostrar tiempos.
// (El componente <Timer> que vivía acá se eliminó en V212 junto con
// TuberiasDetail.jsx, su única pantalla consumidora.)
function fmt(cs) {
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(c).padStart(2,'0')}`
}

export { fmt }
