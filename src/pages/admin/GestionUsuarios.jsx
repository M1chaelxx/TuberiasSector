import { useState, useEffect } from 'react'
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { crearCuenta, uidDeCuenta, escribirRol, emailDe } from '../../utils/cuentas'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const ROLES = ['Administrador', 'Ingeniería', 'Producción', 'Externo', 'Calidad']
const ROLE_KEYS = { 'Administrador': 'admin', 'Ingeniería': 'ingenieria', 'Producción': 'produccion', 'Externo': 'externo', 'Calidad': 'calidad' }
const ROLE_COLORS = { 'admin': '#7B1FA2', 'ingenieria': '#1565C0', 'produccion': '#2A7D32', 'externo': '#E65100', 'calidad': '#00796B' }

// Subdivisión interna del perfil Calidad — Auditor no puede borrar registros
// (ver AuthContext.puedeBorrarCalidad), Jefe/Supervisor sí. Es solo un dato
// más del perfil, no un perfil aparte: sigue habiendo una sola contraseña de
// Calidad por persona.
const SUBROLES_CALIDAD = ['Jefe', 'Supervisor', 'Auditor']
const SUBROL_KEYS = { 'Jefe': 'jefe', 'Supervisor': 'supervisor', 'Auditor': 'auditor' }
const SUBROL_LABEL = { jefe: 'Jefe', supervisor: 'Supervisor', auditor: 'Auditor' }

export default function GestionUsuarios() {
  const { isAdmin, rolesSuspendidos } = useAuth()
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [showNewUser, setShowNewUser] = useState(false)
  const [newForm, setNewForm] = useState({ nombre: '' })
  const [saving, setSaving] = useState(false)
  const [expandedUser, setExpandedUser] = useState(null)
  const [addingRole, setAddingRole] = useState(null)
  const [roleForm, setRoleForm] = useState({ password: '' })
  const [showResueltas, setShowResueltas] = useState(false)
  const [resolviendo, setResolviendo] = useState(null)
  const [showInactivos, setShowInactivos] = useState({})
  // Guía de "contraseña olvidada" de un perfil
  const [guia, setGuia] = useState(null) // { userId, roleKey }
  const [guiaClave, setGuiaClave] = useState('')
  const [guiaMsg, setGuiaMsg] = useState('')
  const [guiaBusy, setGuiaBusy] = useState(false)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    const unsub = onSnapshot(collection(db, 'tubysol_usuarios'), snap => {
      setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.nombre.localeCompare(b.nombre)))
    })
    const unsub2 = onSnapshot(collection(db, 'tubysol_solicitudes'), snap => {
      setSolicitudes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, () => {})
    return () => { unsub(); unsub2() }
  }, [isAdmin])

  const hayClavesViejas = usuarios.some(u => u.password || Object.values(u.perfiles || {}).some(p => p && p.password)) || solicitudes.some(sol => sol.password)
  const pendientes = solicitudes.filter(s => s.estado === 'pendiente')
  const resueltas = solicitudes.filter(s => s.estado !== 'pendiente')

  // Aprobar: si ya existe un usuario con ese nombre (agregando otro perfil a
  // alguien que ya tenía uno), le suma el perfil nuevo; si no existe, lo crea.
  async function aprobarSolicitud(s) {
    setResolviendo(s.id)
    try {
      const roleKey = ROLE_KEYS[s.rol]
      const subrol = roleKey === 'calidad' && s.subrol ? s.subrol : null
      let uid = s.uid
      // Solicitudes anteriores a las cuentas seguras traen la contraseña: se
      // crea la cuenta ahora y se borra la contraseña de la solicitud.
      if (!uid) {
        if (!s.password) { alert('Esta solicitud no tiene cuenta ni contraseña. Rechazala y que la vuelvan a pedir.'); setResolviendo(null); return }
        const r = await crearCuenta(s.nombre, roleKey, s.password)
        if (r.existe) { alert('Ya existe una cuenta con ese nombre y perfil.'); setResolviendo(null); return }
        if (r.error) { alert('No se pudo crear la cuenta: ' + r.error); setResolviendo(null); return }
        uid = r.uid
      }
      await escribirRol(uid, { nombre: s.nombre, roleKey, habilitado: true, subrol })
      const perfilData = { habilitado: true, uid }
      if (subrol) perfilData.subrol = subrol

      const existente = usuarios.find(u => u.nombre.trim().toLowerCase() === s.nombre.trim().toLowerCase())
      if (existente) {
        await updateDoc(doc(db, 'tubysol_usuarios', existente.id), { [`perfiles.${roleKey}`]: perfilData })
      } else {
        await addDoc(collection(db, 'tubysol_usuarios'), { nombre: s.nombre, perfiles: { [roleKey]: perfilData } })
      }
      await updateDoc(doc(db, 'tubysol_solicitudes', s.id), { estado: 'aprobada', resueltoEn: serverTimestamp(), uid, password: deleteField() })
    } catch (err) {
      alert('Error al aprobar: ' + err.message)
    }
    setResolviendo(null)
  }

  async function rechazarSolicitud(s) {
    setResolviendo(s.id)
    try {
      await updateDoc(doc(db, 'tubysol_solicitudes', s.id), { estado: 'rechazada', resueltoEn: serverTimestamp() })
    } catch (err) {
      alert('Error al rechazar: ' + err.message)
    }
    setResolviendo(null)
  }

  async function crearUsuario() {
    if (!newForm.nombre.trim()) { alert('Ingresá el nombre'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'tubysol_usuarios'), {
        nombre: newForm.nombre.trim(),
        perfiles: {}
      })
      setNewForm({ nombre: '' })
      setShowNewUser(false)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  // El registro de rol (tubysol_roles/{uid}) es lo que usan las reglas de
  // Firestore: se mantiene igual que el perfil cuando cambia algo.
  async function sincronizarRol(userId, roleKey, cambios) {
    const usuario = usuarios.find(u => u.id === userId)
    const perfil = usuario?.perfiles?.[roleKey]
    if (!perfil?.uid) return
    await escribirRol(perfil.uid, {
      nombre: usuario.nombre, roleKey,
      habilitado: cambios.habilitado ?? (perfil.habilitado !== false),
      subrol: cambios.subrol ?? perfil.subrol ?? null,
    })
  }

  async function quitarRol(userId, roleKey) {
    const usuario = usuarios.find(u => u.id === userId)
    const uid = usuario?.perfiles?.[roleKey]?.uid
    if (uid) await deleteDoc(doc(db, 'tubysol_roles', uid))
  }

  async function agregarPerfil(userId, roleName) {
    const clave = roleForm.password.trim()
    if (!clave) { alert('Ingresá la contraseña del perfil'); return }
    if (clave.length < 6) { alert('La contraseña tiene que tener 6 caracteres o más'); return }
    const roleKey = ROLE_KEYS[roleName]
    if (roleKey === 'calidad' && !roleForm.subrol) { alert('Elegí el subrol (Jefe / Supervisor / Auditor)'); return }
    const usuario = usuarios.find(u => u.id === userId)
    if (!usuario) return
    setSaving(true)
    try {
      let r = await crearCuenta(usuario.nombre, roleKey, clave)
      // Si la cuenta ya existía (perfil que se había eliminado), se vuelve a
      // vincular con esa misma contraseña.
      if (r.existe) r = await uidDeCuenta(usuario.nombre, roleKey, clave)
      if (r.error) { alert(r.error); setSaving(false); return }
      const subrol = roleKey === 'calidad' ? roleForm.subrol : null
      await escribirRol(r.uid, { nombre: usuario.nombre, roleKey, habilitado: true, subrol })
      const perfilData = { habilitado: true, uid: r.uid }
      if (subrol) perfilData.subrol = subrol
      await updateDoc(doc(db, 'tubysol_usuarios', userId), { [`perfiles.${roleKey}`]: perfilData })
      setAddingRole(null)
      setRoleForm({ password: '' })
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  async function cambiarSubrolCalidad(userId, subrol) {
    setSaving(true)
    try {
      const userRef = doc(db, 'tubysol_usuarios', userId)
      await updateDoc(userRef, { [`perfiles.calidad.subrol`]: subrol })
      await sincronizarRol(userId, 'calidad', { subrol })
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  async function togglePerfilHabilitado(userId, roleKey, currentState) {
    setSaving(true)
    try {
      const userRef = doc(db, 'tubysol_usuarios', userId)
      await updateDoc(userRef, {
        [`perfiles.${roleKey}.habilitado`]: !currentState
      })
      await sincronizarRol(userId, roleKey, { habilitado: !currentState })
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  async function eliminarPerfil(userId, roleKey) {
    if (!confirm(`¿Eliminar este perfil?`)) return
    setSaving(true)
    try {
      const userRef = doc(db, 'tubysol_usuarios', userId)
      await quitarRol(userId, roleKey)
      await updateDoc(userRef, {
        [`perfiles.${roleKey}`]: null
      })
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  // Suspender un perfil del sistema entero (ej: Calidad, si ya no se usa en
  // la planta) — deja de ofrecerse en los desplegables (Login, Solicitar
  // acceso, este mismo "+Agregar perfil"), sin tocar a los usuarios que ya
  // lo tenían asignado. 'Administrador' no es suspendible, para no poder
  // dejar a todos afuera de la app por error.
  async function toggleRolSuspendido(roleKey, actualmenteSuspendido) {
    await setDoc(doc(db, 'config', 'roles_suspendidos'), { [roleKey]: !actualmenteSuspendido }, { merge: true })
  }

  // Borra las contraseñas en texto plano que hayan quedado de antes (perfiles
  // que nunca pasaron a cuenta segura y solicitudes viejas).
  async function limpiarClavesViejas() {
    if (!confirm('Se borran todas las contraseñas viejas guardadas en texto plano. Los perfiles que no tengan cuenta segura tendrán que volver a agregarse. ¿Continuar?')) return
    setSaving(true)
    try {
      for (const u of usuarios) {
        const cambios = {}
        if (u.password) cambios.password = deleteField()
        for (const [roleKey, perfil] of Object.entries(u.perfiles || {})) {
          if (perfil && perfil.password) cambios[`perfiles.${roleKey}.password`] = deleteField()
        }
        if (Object.keys(cambios).length) await updateDoc(doc(db, 'tubysol_usuarios', u.id), cambios)
      }
      for (const sol of solicitudes) {
        if (sol.password) await updateDoc(doc(db, 'tubysol_solicitudes', sol.id), { password: deleteField() })
      }
      alert('✅ Contraseñas viejas borradas')
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  // Segunda mitad de "contraseña olvidada": con la cuenta vieja ya eliminada en
  // Firebase, se crea una nueva con la contraseña elegida y se vuelve a enlazar.
  async function crearClaveNueva() {
    const usuario = usuarios.find(u => u.id === guia.userId)
    const perfil = usuario?.perfiles?.[guia.roleKey]
    if (!usuario || !perfil) return
    if (guiaClave.length < 6) { setGuiaMsg('La contraseña nueva tiene que tener 6 caracteres o más'); return }
    setGuiaBusy(true)
    setGuiaMsg('')
    try {
      const r = await crearCuenta(usuario.nombre, guia.roleKey, guiaClave)
      if (r.existe) { setGuiaMsg('Esa cuenta todavía existe en Firebase. Eliminala primero (paso 1) y volvé a probar.'); setGuiaBusy(false); return }
      if (r.error) { setGuiaMsg(r.error); setGuiaBusy(false); return }
      if (perfil.uid) await deleteDoc(doc(db, 'tubysol_roles', perfil.uid)).catch(() => {})
      await escribirRol(r.uid, { nombre: usuario.nombre, roleKey: guia.roleKey, habilitado: perfil.habilitado !== false, subrol: perfil.subrol || null })
      await updateDoc(doc(db, 'tubysol_usuarios', usuario.id), { [`perfiles.${guia.roleKey}.uid`]: r.uid })
      setGuia(null)
      setGuiaClave('')
      alert('✅ Listo. Pasale la contraseña nueva a la persona: ya puede entrar y cambiarla desde el Inicio con "🔑 Cambiar".')
    } catch (err) {
      setGuiaMsg('Error: ' + err.message)
    }
    setGuiaBusy(false)
  }

  async function eliminarUsuario(u) {
    if (!confirm(`¿Eliminar usuario "${u.nombre}" completamente?`)) return
    for (const perfil of Object.values(u.perfiles || {})) {
      if (perfil?.uid) await deleteDoc(doc(db, 'tubysol_roles', perfil.uid)).catch(() => {})
    }
    await deleteDoc(doc(db, 'tubysol_usuarios', u.id))
    setExpandedUser(null)
  }

  return (
    <div className="app">
      <Header title="Gestión de Usuarios" back="/" />

      <div className="content">

        {hayClavesViejas && (
          <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 12.5, color: '#c62828', lineHeight: 1.5 }}>
            ⚠️ Quedan contraseñas viejas guardadas en texto plano.
            <button onClick={limpiarClavesViejas} disabled={saving} style={{ display: 'block', marginTop: 8, background: '#c62828', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🧹 Borrar contraseñas viejas
            </button>
          </div>
        )}

        {/* Solicitudes de acceso pendientes */}
        {pendientes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e65100', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              🔔 Solicitudes de acceso pendientes ({pendientes.length})
            </div>
            {pendientes.map(s => (
              <div key={s.id} style={{ background: '#fff8e1', border: '1px solid #ffcc80', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{s.nombre}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                  Pide: <strong>{s.rol}</strong>{s.rol === 'Calidad' && s.subrol ? ` · ${SUBROL_LABEL[s.subrol] || s.subrol}` : ''}
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  {s.uid ? '🔒 Eligió su contraseña (no se muestra)' : `Contraseña propuesta (solicitud anterior): ${s.password || '—'}`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={() => rechazarSolicitud(s)} disabled={resolviendo === s.id}
                    style={{ flex: 1, background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✗ Rechazar
                  </button>
                  <button onClick={() => aprobarSolicitud(s)} disabled={resolviendo === s.id}
                    style={{ flex: 1, background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {resolviendo === s.id ? '...' : '✓ Aprobar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {resueltas.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <button onClick={() => setShowResueltas(o => !o)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
              {showResueltas ? 'Ocultar' : 'Ver'} solicitudes resueltas ({resueltas.length})
            </button>
            {showResueltas && resueltas.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f9f9f9', borderRadius: 8, marginTop: 6, fontSize: 12 }}>
                <span>{s.nombre} · {s.rol}</span>
                <span style={{ fontWeight: 700, color: s.estado === 'aprobada' ? '#2e7d32' : '#c62828' }}>
                  {s.estado === 'aprobada' ? '✓ Aprobada' : '✗ Rechazada'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Perfiles del sistema — suspender un tipo de perfil entero (ej: Calidad,
            si ya no se usa) para que deje de aparecer en los desplegables de
            Login/Solicitar acceso/Agregar perfil. No afecta a quien ya lo tenga
            asignado — es distinto del Activo/Inactivo por usuario de más abajo. */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            🎚️ Perfiles del sistema
          </div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
            {ROLES.filter(r => r !== 'Administrador').map((r, i, arr) => {
              const roleKey = ROLE_KEYS[r]
              const suspendido = !!rolesSuspendidos[roleKey]
              return (
                <div key={r} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: suspendido ? '#999' : '#111' }}>{r}</span>
                  <button onClick={() => toggleRolSuspendido(roleKey, suspendido)}
                    style={{ background: suspendido ? '#fff3e0' : '#e8f5e9', color: suspendido ? '#e65100' : '#2e7d32', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {suspendido ? '⏸ Suspendido' : '✓ Activo'}
                  </button>
                </div>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: '#999', marginTop: 6, lineHeight: 1.4 }}>
            Un perfil suspendido no aparece más en los desplegables para elegirlo — quienes ya lo tenían asignado no se ven afectados.
          </div>
        </div>

        {/* Botón nuevo usuario */}
        {!showNewUser && (
          <button
            onClick={() => setShowNewUser(true)}
            style={{ width: '100%', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}
          >
            + Nuevo usuario
          </button>
        )}

        {/* Formulario nuevo usuario */}
        {showNewUser && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px #0002', border: '1.5px dashed #1a73e8' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#1a73e8' }}>Crear nuevo usuario</div>
            <div className="modal-field">
              <label>Nombre completo*</label>
              <input value={newForm.nombre} onChange={e => setNewForm({ ...newForm, nombre: e.target.value })} placeholder="Ej: Juan García" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setShowNewUser(false); setNewForm({ nombre: '' }) }} style={{ flex: 1, background: '#eee', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={crearUsuario} disabled={saving} style={{ flex: 2, background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {saving ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </div>
        )}

        {/* Lista de usuarios */}
        {usuarios.map(u => (
          <div key={u.id} style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, border: '1px solid #e0e0e0' }}>

            {/* Header usuario */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 12 }}
              onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{u.nombre}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {Object.keys(u.perfiles || {}).length} perfil{Object.keys(u.perfiles || {}).length !== 1 ? 'es' : ''} configurado{Object.keys(u.perfiles || {}).length !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ fontSize: 18, color: '#bbb', fontWeight: 300, transform: expandedUser === u.id ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>›</div>
            </div>

            {/* Expandido: perfiles y acciones */}
            {expandedUser === u.id && (
              <>
                {/* Perfiles existentes — los inactivos quedan colapsados aparte para
                    no ensuciar la vista (mismo patrón que "solicitudes resueltas"),
                    sin dejar de estar a un toque de distancia para reactivarlos. */}
                <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#666', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Perfiles</div>
                  {Object.keys(u.perfiles || {}).length === 0 ? (
                    <div style={{ fontSize: 13, color: '#999', padding: '8px 0' }}>Sin perfiles. Agregá uno abajo.</div>
                  ) : (() => {
                    const entradas = Object.entries(u.perfiles).filter(([, perfil]) => perfil)
                    const activos = entradas.filter(([, perfil]) => perfil.habilitado !== false)
                    const inactivos = entradas.filter(([, perfil]) => perfil.habilitado === false)

                    function PerfilRow([roleKey, perfil]) {
                      const roleLabel = Object.keys(ROLE_KEYS).find(k => ROLE_KEYS[k] === roleKey)
                      const color = ROLE_COLORS[roleKey]
                      return (
                        <div key={roleKey} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#f9f9f9', borderLeft: `3px solid ${color}`, borderRadius: 8, marginBottom: 8, opacity: perfil.habilitado === false ? 0.7 : 1 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color }}>{roleLabel}</div>
                            <div style={{ fontSize: 12, color: '#666', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {perfil.uid ? '🔒 Cuenta segura' : <span style={{ color: '#c62828' }}>⚠️ Sin cuenta segura: eliminá este perfil y volvé a agregarlo</span>}
                            </div>
                            {roleKey === 'calidad' && (
                              <select value={perfil.subrol || ''} onChange={e => cambiarSubrolCalidad(u.id, e.target.value)}
                                style={{ marginTop: 6, fontSize: 11, padding: '4px 6px', borderRadius: 4, border: '1px solid #ccc', color: perfil.subrol ? '#333' : '#c62828' }}>
                                <option value="">Sin subrol — elegir</option>
                                {SUBROLES_CALIDAD.map(s => <option key={s} value={SUBROL_KEYS[s]}>{s}</option>)}
                              </select>
                            )}
                          </div>
                          <button onClick={() => togglePerfilHabilitado(u.id, roleKey, perfil.habilitado)}
                            style={{ background: perfil.habilitado ? '#e8f5e9' : '#fff3e0', color: perfil.habilitado ? '#2e7d32' : '#e65100', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {perfil.habilitado ? '✓ Activo' : '✗ Inactivo'}
                          </button>
                          {perfil.uid && (
                            <button onClick={() => { setGuia({ userId: u.id, roleKey }); setGuiaClave(''); setGuiaMsg('') }}
                              title="Contraseña olvidada"
                              style={{ background: '#fff8e1', color: '#e65100', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}>🔑</button>
                          )}
                          <button onClick={() => eliminarPerfil(u.id, roleKey)}
                            style={{ background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}>🗑️</button>
                        </div>
                      )
                    }

                    return (
                      <>
                        {activos.length === 0 && (
                          <div style={{ fontSize: 13, color: '#999', padding: '8px 0' }}>Sin perfiles activos.</div>
                        )}
                        {activos.map(PerfilRow)}
                        {inactivos.length > 0 && (
                          <>
                            <button onClick={() => setShowInactivos(p => ({ ...p, [u.id]: !p[u.id] }))}
                              style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0 8px' }}>
                              {showInactivos[u.id] ? 'Ocultar' : 'Ver'} perfiles inactivos ({inactivos.length})
                            </button>
                            {showInactivos[u.id] && inactivos.map(PerfilRow)}
                          </>
                        )}
                      </>
                    )
                  })()}
                </div>

                {/* Agregar perfil */}
                {addingRole === u.id ? (
                  <div style={{ background: '#e3f2fd', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1565c0', marginBottom: 8 }}>Agregar nuevo perfil</div>
                    <select onChange={e => setRoleForm({ roleKey: ROLE_KEYS[e.target.value], password: '' })} defaultValue=""
                      style={{ width: '100%', padding: '8px 0', borderRadius: 4, border: '1px solid #ccc', marginBottom: 8, fontSize: 13 }}>
                      <option value="">Seleccioná un perfil</option>
                      {ROLES.map(r => {
                        const rKey = ROLE_KEYS[r]
                        if (Object.keys(u.perfiles || {}).includes(rKey)) return null
                        if (rKey !== 'admin' && rolesSuspendidos[rKey]) return null
                        return <option key={r} value={r}>{r}</option>
                      })}
                    </select>
                    {roleForm.roleKey && (
                      <>
                        {roleForm.roleKey === 'calidad' && (
                          <select onChange={e => setRoleForm({ ...roleForm, subrol: e.target.value })} defaultValue=""
                            style={{ width: '100%', padding: '8px 0', borderRadius: 4, border: '1px solid #ccc', marginBottom: 8, fontSize: 13 }}>
                            <option value="">Elegí el subrol</option>
                            {SUBROLES_CALIDAD.map(s => <option key={s} value={SUBROL_KEYS[s]}>{s}</option>)}
                          </select>
                        )}
                        <input type="password" value={roleForm.password} onChange={e => setRoleForm({ ...roleForm, password: e.target.value })}
                          placeholder="Contraseña para este perfil (6 o más caracteres)" style={{ width: '100%', padding: '8px 0', borderRadius: 4, border: '1px solid #ccc', marginBottom: 8, fontSize: 13 }} />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setAddingRole(null); setRoleForm({ password: '' }) }}
                            style={{ flex: 1, background: '#eee', border: 'none', borderRadius: 4, padding: '8px 0', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                          <button onClick={() => agregarPerfil(u.id, Object.keys(ROLE_KEYS).find(k => ROLE_KEYS[k] === roleForm.roleKey))} disabled={saving}
                            style={{ flex: 1, background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Agregar</button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <button onClick={() => setAddingRole(u.id)} style={{ width: '100%', background: '#e3f2fd', color: '#1565c0', border: '1px solid #90caf9', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                    + Agregar perfil
                  </button>
                )}

                {/* Eliminar usuario */}
                <button onClick={() => eliminarUsuario(u)} style={{ width: '100%', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  🗑️ Eliminar usuario
                </button>
              </>
            )}
          </div>
        ))}

        {usuarios.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#999' }}>
            <div style={{ fontSize: 13 }}>Sin usuarios. Creá uno para comenzar.</div>
          </div>
        )}
      </div>

      {guia && (() => {
        const usuario = usuarios.find(u => u.id === guia.userId)
        if (!usuario) return null
        const correo = emailDe(usuario.nombre, guia.roleKey)
        const rolLabel = Object.keys(ROLE_KEYS).find(k => ROLE_KEYS[k] === guia.roleKey)
        return (
          <div className="modal-overlay" onClick={() => !guiaBusy && setGuia(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-drag" />
              <h2>🔑 Contraseña olvidada</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 0 }}>
                <b>{usuario.nombre}</b> · {rolLabel}. Sus datos no se tocan: solo se reemplaza su contraseña.
              </p>
              <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Paso 1 — En Firebase, eliminá su cuenta</div>
                <div style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>
                  Firebase → Authentication → Usuarios → buscá este correo y, en los tres puntitos, <b>Eliminar cuenta</b>:
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <code style={{ flex: 1, fontSize: 12, background: '#fff', padding: '6px 8px', borderRadius: 6, wordBreak: 'break-all' }}>{correo}</code>
                  <button onClick={() => navigator.clipboard?.writeText(correo)} style={{ background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Copiar</button>
                </div>
                <a href="https://console.firebase.google.com/project/bd-tuberias/authentication/users" target="_blank" rel="noreferrer"
                  style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>Abrir Firebase → Usuarios ↗</a>
              </div>
              <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Paso 2 — Elegí la contraseña nueva</div>
                <input type="password" value={guiaClave} onChange={e => { setGuiaClave(e.target.value); setGuiaMsg('') }}
                  placeholder="Contraseña nueva (6 o más caracteres)" autoComplete="new-password"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }} />
              </div>
              {guiaMsg && <div className="login-error" style={{ marginTop: 10 }}>⚠️ {guiaMsg}</div>}
              <div className="modal-actions">
                <button className="btn btn-grey" onClick={() => setGuia(null)} disabled={guiaBusy}>Cancelar</button>
                <button className="btn btn-primary" onClick={crearClaveNueva} disabled={guiaBusy}>{guiaBusy ? 'Creando...' : 'Crear contraseña nueva'}</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
