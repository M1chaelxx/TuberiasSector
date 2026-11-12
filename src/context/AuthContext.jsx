import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { doc, onSnapshot, getDoc } from 'firebase/firestore'
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { db, auth, authListo } from '../firebase'
import { emailDe, ROLE_KEY_DE, ROLE_LABEL_DE } from '../utils/cuentas'

const ALL_USERNAMES = ['Administrador', 'Ingeniería', 'Producción', 'Externo', 'Calidad']
// Mismo mapeo nombre->roleKey que ya usa GestionUsuarios (ROLE_KEYS) — se
// duplica acá porque AuthContext no importa de esa pantalla.
const NOMBRE_TO_KEY = ROLE_KEY_DE

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // El usuario guardado en la pestaña solo evita el parpadeo al recargar: la
  // sesión real es la de Firebase Authentication y el rol sale de su registro
  // en Firestore (tubysol_roles), que es lo que validan las reglas.
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('tubysol_user')) } catch { return null }
  })
  // Perfiles suspendidos por Admin en Gestión de Usuarios — dejan de
  // ofrecerse en los desplegables (Login, Solicitar acceso, Agregar perfil),
  // sin tocar los usuarios que ya lo tenían asignado. 'Administrador' nunca
  // se suspende, para no poder dejar a todos afuera de la app por error.
  const [rolesSuspendidos, setRolesSuspendidos] = useState({})
  const loginEnCurso = useRef(false)

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'roles_suspendidos'), snap => {
      setRolesSuspendidos(snap.exists() ? snap.data() : {})
    }, () => {})
    return unsub
  }, [])

  // Perfil de la persona logueada (según su registro de rol en Firestore)
  async function usuarioDeCuenta(fu) {
    const snap = await getDoc(doc(db, 'tubysol_roles', fu.uid))
    if (!snap.exists() || snap.data().habilitado === false) return null
    const r = snap.data()
    return { username: ROLE_LABEL_DE[r.roleKey] || r.roleKey, role: r.roleKey, display: r.nombre, calidadSubrol: r.roleKey === 'calidad' ? (r.subrol || null) : null, uid: fu.uid }
  }

  function guardarUsuario(u) {
    setUser(u)
    if (u) sessionStorage.setItem('tubysol_user', JSON.stringify(u))
    else sessionStorage.removeItem('tubysol_user')
  }

  useEffect(() => {
    let vivo = true
    const unsub = onAuthStateChanged(auth, async fu => {
      if (loginEnCurso.current) return
      if (!fu) { if (vivo) guardarUsuario(null); return }
      try {
        const u = await usuarioDeCuenta(fu)
        if (!vivo) return
        if (u) guardarUsuario(u)
        else { await signOut(auth); guardarUsuario(null) }
      } catch { /* sin conexión: queda lo guardado en la pestaña */ }
    })
    return () => { vivo = false; unsub() }
  }, [])

  // Devuelve: 'ok' | 'error' | 'sin-permiso'
  async function login(username, password, nombre = null) {
    const nom = (nombre || '').trim()
    if (!nom) return 'error'
    loginEnCurso.current = true
    try {
      await authListo
      const roleKey = ROLE_KEY_DE[username] || 'produccion'
      const cred = await signInWithEmailAndPassword(auth, emailDe(nom, roleKey), password.trim())
      const u = await usuarioDeCuenta(cred.user)
      if (!u) { await signOut(auth); return 'sin-permiso' }
      guardarUsuario(u)
      return 'ok'
    } catch {
      return 'error'
    } finally {
      loginEnCurso.current = false
    }
  }

  // Cambiar la propia contraseña (hace falta la actual)
  async function cambiarClave(actual, nueva) {
    const fu = auth.currentUser
    if (!fu || !fu.email) return 'sin-cuenta'
    if (nueva.length < 6) return 'clave-corta'
    try {
      await reauthenticateWithCredential(fu, EmailAuthProvider.credential(fu.email, actual))
      await updatePassword(fu, nueva)
      return 'ok'
    } catch (e) {
      return ['auth/invalid-credential', 'auth/wrong-password'].includes(e.code) ? 'clave-actual' : 'error'
    }
  }

  function logout() {
    guardarUsuario(null)
    signOut(auth).catch(() => {})
  }

  const isAdmin = user?.role === 'admin'
  const isIngenieria = user?.role === 'admin' || user?.role === 'ingenieria'
  const isProduccion = user?.role === 'produccion'
  const isExterno = user?.role === 'externo'
  const isCalidad = user?.role === 'admin' || user?.role === 'calidad'
  // Auditor es el único subrol de Calidad sin permiso de borrado — Jefe,
  // Supervisor, un perfil sin subrol asignado (legacy) y Admin sí pueden.
  const puedeBorrarCalidad = isCalidad && user?.calidadSubrol !== 'auditor'

  const USERS = ALL_USERNAMES.filter(u => u === 'Administrador' || !rolesSuspendidos[NOMBRE_TO_KEY[u]])

  return (
    <AuthContext.Provider value={{
      user, login, logout, cambiarClave, isAdmin, isIngenieria, isProduccion, isExterno, isCalidad, puedeBorrarCalidad,
      USERS, rolesSuspendidos, NOMBRE_TO_KEY,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
