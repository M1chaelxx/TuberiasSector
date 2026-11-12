import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { descargarRespaldo } from '../utils/respaldo'

export default function Home() {
  const navigate = useNavigate()
  const { user, isAdmin, isIngenieria, isExterno, isCalidad, cambiarClave } = useAuth()
  const [avisosCount, setAvisosCount] = useState(0)
  const [solicitudesCount, setSolicitudesCount] = useState(0)
  const [respaldando, setRespaldando] = useState(false)
  const [showClave, setShowClave] = useState(false)
  const [claveForm, setClaveForm] = useState({ actual: '', nueva: '', repetir: '' })
  const [claveMsg, setClaveMsg] = useState('')
  const [claveBusy, setClaveBusy] = useState(false)

  async function guardarClave() {
    if (claveForm.nueva !== claveForm.repetir) { setClaveMsg('Las dos contraseñas nuevas no coinciden'); return }
    setClaveBusy(true)
    const r = await cambiarClave(claveForm.actual, claveForm.nueva)
    setClaveBusy(false)
    if (r === 'ok') { setShowClave(false); setClaveForm({ actual: '', nueva: '', repetir: '' }); setClaveMsg(''); alert('✅ Contraseña cambiada') }
    else if (r === 'clave-corta') setClaveMsg('La contraseña nueva tiene que tener 6 caracteres o más')
    else if (r === 'clave-actual') setClaveMsg('La contraseña actual no es correcta')
    else if (r === 'sin-cuenta') setClaveMsg('Tu cuenta todavía no se pasó al sistema seguro. Salí y volvé a entrar con tu contraseña.')
    else setClaveMsg('No se pudo cambiar la contraseña. Intentá de nuevo.')
  }

  async function hacerRespaldo() {
    setRespaldando(true)
    try {
      const c = await descargarRespaldo()
      const total = Object.values(c).reduce((a, b) => a + b, 0)
      alert(`✅ Respaldo descargado: ${total} registros en ${Object.keys(c).length} colecciones. Las contraseñas no se incluyen.`)
    } catch (err) {
      alert('No se pudo hacer el respaldo: ' + err.message)
    }
    setRespaldando(false)
  }

  useEffect(() => {
    const q = query(collection(db, 'avisos'), where('estado', 'in', ['pendiente', 'urgente', 'normal', 'alta', 'atencion']))
    const unsub = onSnapshot(q, snap => setAvisosCount(snap.size), () => {})
    return unsub
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    const q = query(collection(db, 'tubysol_solicitudes'), where('estado', '==', 'pendiente'))
    const unsub = onSnapshot(q, snap => setSolicitudesCount(snap.size), () => {})
    return unsub
  }, [isAdmin])

  const soloCalidad = user?.role === 'calidad'

  const tiles = isExterno
    ? [
        { id: 'modelos', icon: '🔩', name: 'Modelos', sub: 'Subconjuntos · Piezas · Especificaciones', color: '#e3f2fd', path: '/externo/modelos' },
        { id: 'visualizadores', icon: '📎', name: 'Visualizadores', sub: 'Planos de montaje en PDF', color: '#ffebee', path: '/externo/visualizadores' },
        { id: 'avisos',    icon: '📋', name: 'Avisos',     sub: 'Tablón de avisos del área',         color: '#fff3e0', path: '/avisos', badge: avisosCount || null },
      ]
    : soloCalidad
    ? [
        { id: 'calidad', icon: '📋', name: 'Calidad', sub: 'Auditorías de Tubería y Soldadura', color: '#e0f2f1', path: '/calidad' },
        { id: 'tablero', icon: '📊', name: 'Tablero', sub: 'KPIs · Cuadro de mando', color: '#ede7f6', path: '/tablero' },
        { id: 'avisos',  icon: '📋', name: 'Avisos',  sub: 'Tablón de avisos del área',                 color: '#fff3e0', path: '/avisos', badge: avisosCount || null },
        { id: 'instruc', icon: '📖', name: 'Instrucciones', sub: 'Guía de uso de la app',              color: '#e8f5e9', path: '/instrucciones' },
      ]
    : [
        { id: 'soldadura', icon: '🔧', name: 'Soldadura', sub: 'Subconjuntos · Tiempos por puesto', color: '#ffebee', path: '/soldadura' },
        { id: 'tuberias',  icon: '🔩', name: 'Tuberías',  sub: 'Planos · Tiempos por máquina',     color: '#e3f2fd', path: '/tuberias' },
        ...(isCalidad ? [{ id: 'calidad', icon: '📋', name: 'Calidad', sub: 'Auditorías de Tubería y Soldadura', color: '#e0f2f1', path: '/calidad' }] : []),
        ...(isIngenieria ? [
          { id: 'tablero', icon: '📊', name: 'Tablero', sub: 'KPIs · Cuadro de mando', color: '#ede7f6', path: '/tablero' },
        ] : []),
        { id: 'avisos',    icon: '📋', name: 'Avisos',     sub: 'Tablón de avisos del área',         color: '#fff3e0', path: '/avisos', badge: avisosCount || null },
        { id: 'instruc',   icon: '📖', name: 'Instrucciones', sub: 'Guía de uso de la app',         color: '#e8f5e9', path: '/instrucciones' },
      ]

  return (
    <div className="app">
      <Header title="TubySol" />

      <div style={{background:'#fff',padding:'12px 16px',borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:13,color:'var(--text-secondary)'}}>
          Bienvenido, <strong>{user?.display}</strong>
        </div>
        <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>
          Precisión y Medida de Tiempo — Cronometraje Industrial
        </div>
      </div>

      <div className="home-grid">
        {tiles.map(t => (
          <div key={t.id} className="home-tile" style={{background:t.color}} onClick={() => navigate(t.path)}>
            {t.badge && <span className="tile-badge">{t.badge}</span>}
            <span className="tile-icon">{t.icon}</span>
            <div className="tile-name">{t.name}</div>
            <div className="tile-sub">{t.sub}</div>
          </div>
        ))}
      </div>

      {isAdmin && (
        <div style={{padding:'0 12px 8px', display:'flex', gap:8, flexWrap:'wrap'}}>
          <button
            onClick={() => navigate('/admin/usuarios')}
            style={{ flex: 1, position: 'relative', background: '#fff', border: '1.5px solid #1a73e8', color: '#1a73e8', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            ⚙️ Usuarios
            {solicitudesCount > 0 && (
              <span style={{ position: 'absolute', top: -6, right: -6, background: '#d32f2f', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                {solicitudesCount}
              </span>
            )}
          </button>
          <button
            onClick={() => navigate('/admin/operarios')}
            style={{ flex: 1, background: '#fff', border: '1.5px solid #1a73e8', color: '#1a73e8', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            👤 Operarios
          </button>
          <button
            onClick={() => navigate('/admin/visualizadores')}
            style={{ flex: 1, background: '#fff', border: '1.5px solid #1a73e8', color: '#1a73e8', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            📎 Visualizadores
          </button>
          <button
            onClick={hacerRespaldo}
            disabled={respaldando}
            style={{ flex: 1, background: '#fff', border: '1.5px solid #2e7d32', color: '#2e7d32', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: respaldando ? 'wait' : 'pointer', minWidth: 120 }}
          >
            {respaldando ? 'Respaldando…' : '💾 Respaldo'}
          </button>
        </div>
      )}

      <div style={{padding:'0 12px 8px'}}>
        <div className="detail-section">
          <div className="section-header">📊 Resumen del día</div>
          <div className="field-row">
            <span className="label">Fecha</span>
            <span className="value">{new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}</span>
          </div>
          <div className="field-row">
            <span className="label">Usuario</span>
            <span className="value">{user?.display}</span>
          </div>
          <div className="field-row">
            <span className="label">Contraseña</span>
            <span className="value">
              <button onClick={() => { setShowClave(true); setClaveMsg('') }} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0 }}>🔑 Cambiar</button>
            </span>
          </div>
          <div className="field-row">
            <span className="label">Avisos pendientes</span>
            <span className="value" style={{color: avisosCount > 0 ? 'var(--danger)' : 'var(--success)'}}>
              {avisosCount > 0 ? `${avisosCount} pendientes` : 'Sin pendientes ✓'}
            </span>
          </div>
        </div>
      </div>
      {showClave && (
        <div className="modal-overlay" onClick={() => !claveBusy && setShowClave(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-drag" />
            <h2>Cambiar mi contraseña</h2>
            <div className="modal-field"><label>Contraseña actual</label>
              <input type="password" value={claveForm.actual} onChange={e => setClaveForm({ ...claveForm, actual: e.target.value })} autoComplete="current-password" /></div>
            <div className="modal-field"><label>Contraseña nueva (6 o más caracteres)</label>
              <input type="password" value={claveForm.nueva} onChange={e => setClaveForm({ ...claveForm, nueva: e.target.value })} autoComplete="new-password" /></div>
            <div className="modal-field"><label>Repetí la nueva</label>
              <input type="password" value={claveForm.repetir} onChange={e => setClaveForm({ ...claveForm, repetir: e.target.value })} autoComplete="new-password" /></div>
            {claveMsg && <div className="login-error">⚠️ {claveMsg}</div>}
            <div className="modal-actions">
              <button className="btn btn-grey" onClick={() => setShowClave(false)} disabled={claveBusy}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarClave} disabled={claveBusy}>{claveBusy ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
