import { useState } from 'react'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { crearCuenta, ROLE_KEY_DE } from '../utils/cuentas'
import logoUrl from '/logo.png'

const ROLES_CON_NOMBRE = ['Administrador', 'Ingeniería', 'Producción', 'Externo', 'Calidad']

// Roles que se pueden pedir por autogestión — quedan pendientes de aprobación
// de Administración, no dan acceso hasta que un Admin los apruebe.
const ROLES_SOLICITABLES = ['Ingeniería', 'Producción', 'Externo', 'Calidad', 'Administrador']
const SUBROLES_CALIDAD = [{ v: 'jefe', l: 'Jefe' }, { v: 'supervisor', l: 'Supervisor' }, { v: 'auditor', l: 'Auditor' }]

function SolicitudModal({ onClose }) {
  const { rolesSuspendidos, NOMBRE_TO_KEY } = useAuth()
  const rolesSolicitablesVisibles = ROLES_SOLICITABLES.filter(r => r === 'Administrador' || !rolesSuspendidos[NOMBRE_TO_KEY[r]])
  const [form, setForm] = useState({ nombre: '', rol: '', subrol: '', password: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [enviado, setEnviado] = useState(false)

  async function enviar() {
    if (!form.nombre.trim()) { setError('Ingresá tu nombre'); return }
    if (!form.rol) { setError('Elegí el perfil que necesitás'); return }
    if (form.rol === 'Calidad' && !form.subrol) { setError('Elegí tu subrol dentro de Calidad'); return }
    if (form.password.trim().length < 6) { setError('La contraseña tiene que tener 6 caracteres o más'); return }
    setSending(true)
    setError('')
    try {
      // Se crea la cuenta (queda SIN permisos hasta que un Administrador la
      // apruebe) y la solicitud guarda solo el vínculo, nunca la contraseña.
      const nombre = form.nombre.trim()
      const r = await crearCuenta(nombre, ROLE_KEY_DE[form.rol], form.password.trim())
      if (r.existe) { setError('Ya existe una cuenta con ese nombre y perfil (puede estar pendiente de aprobación).'); setSending(false); return }
      if (r.error) { setError(r.error); setSending(false); return }
      await addDoc(collection(db, 'tubysol_solicitudes'), {
        nombre,
        rol: form.rol,
        subrol: form.rol === 'Calidad' ? form.subrol : null,
        uid: r.uid,
        estado: 'pendiente',
        creadoEn: serverTimestamp(),
      })
      setEnviado(true)
    } catch (err) {
      setError('Error al enviar la solicitud: ' + err.message)
    }
    setSending(false)
  }

  return (
    <div className="modal-overlay" onClick={() => !sending && onClose()}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-drag" />
        {enviado ? (
          <>
            <h2>✅ Solicitud enviada</h2>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Tu pedido de acceso quedó pendiente de aprobación. Un Administrador tiene que revisarlo antes de que puedas ingresar con esa cuenta.
            </p>
            <div className="modal-actions">
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>Entendido</button>
            </div>
          </>
        ) : (
          <>
            <h2>Solicitar acceso</h2>
            <div className="modal-field">
              <label>Tu nombre*</label>
              <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Juan García" disabled={sending} />
            </div>
            <div className="modal-field">
              <label>Perfil que necesitás*</label>
              <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value, subrol: '' })} disabled={sending}>
                <option value="">Elegí un perfil</option>
                {rolesSolicitablesVisibles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {form.rol === 'Calidad' && (
              <div className="modal-field">
                <label>Subrol dentro de Calidad*</label>
                <select value={form.subrol} onChange={e => setForm({ ...form, subrol: e.target.value })} disabled={sending}>
                  <option value="">Elegí un subrol</option>
                  {SUBROLES_CALIDAD.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>
            )}
            <div className="modal-field">
              <label>Contraseña que vas a usar*</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Elegí una contraseña (6 o más caracteres)" disabled={sending} />
            </div>
            {error && <div className="login-error">⚠️ {error}</div>}
            <div className="modal-actions">
              <button className="btn btn-grey" onClick={onClose} disabled={sending}>Cancelar</button>
              <button className="btn btn-primary" onClick={enviar} disabled={sending}>{sending ? 'Enviando...' : 'Enviar solicitud'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function Login() {
  const { login, USERS } = useAuth()
  const [username, setUsername] = useState('Administrador')
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSolicitud, setShowSolicitud] = useState(false)
  const mostrarNombre = ROLES_CON_NOMBRE.includes(username)

  async function handleSubmit(e) {
    e.preventDefault()
    if (mostrarNombre && !nombre.trim()) { setError('Ingresá tu nombre'); return }
    if (!password.trim()) { setError('Ingresá tu contraseña'); return }
    setLoading(true)
    setError('')
    await new Promise(r => setTimeout(r, 300))
    const r = await login(username, password, mostrarNombre ? nombre.trim() : null)
    if (r === 'sin-permiso') setError('Tu cuenta todavía no tiene permisos o está desactivada. Consultá con Administración.')
    else if (r !== 'ok') setError('Nombre o contraseña incorrectos. Intentá de nuevo.')
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src={logoUrl} alt="TubySol logo" style={{width:90,height:90,borderRadius:50,objectFit:'cover'}} />
          <h2>TubySol</h2>
          <p>Toma de Tiempos Industrial</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>Área / Rol</label>
            <select value={username} onChange={e => { setUsername(e.target.value); setNombre(''); setError('') }}>
              {USERS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {mostrarNombre && (
            <div className="login-field">
              <label>Tu nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={e => { setNombre(e.target.value); setError('') }}
                placeholder="Ej: Juan García"
                autoComplete="name"
              />
            </div>
          )}
          <div className="login-field">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Ingresá tu contraseña"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="login-error">⚠️ {error}</div>}
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <button
          onClick={() => setShowSolicitud(true)}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginTop: 14, width: '100%', textAlign: 'center' }}
        >
          ¿No tenés cuenta? Solicitar acceso
        </button>
        <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 10, lineHeight: 1.4 }}>
          ¿Olvidaste tu contraseña? Pedísela a Administración.
        </p>
      </div>
      <p className="login-version">TubySol v1.0 — Especialistas en Cronometraje Industrial</p>

      {showSolicitud && <SolicitudModal onClose={() => setShowSolicitud(false)} />}
    </div>
  )
}
