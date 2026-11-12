import { initializeApp, getApps } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase'

// Cada perfil de cada persona es una cuenta de Firebase Authentication. El
// correo es interno (no se muestra): nombre + perfil, así la persona sigue
// entrando con perfil + nombre + contraseña como siempre.
const DOMINIO = 'tubysol.app'

export const ROLE_KEY_DE = { 'Administrador': 'admin', 'Ingeniería': 'ingenieria', 'Producción': 'produccion', 'Externo': 'externo', 'Calidad': 'calidad' }
export const ROLE_LABEL_DE = Object.fromEntries(Object.entries(ROLE_KEY_DE).map(([k, v]) => [v, k]))

export function slugNombre(nombre) {
  return String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function emailDe(nombre, roleKey) {
  return `${slugNombre(nombre)}.${roleKey}@${DOMINIO}`
}

// Segunda instancia de Firebase solo para crear cuentas sin cerrar la sesión
// de quien está logueado (crear una cuenta inicia sesión con ella).
function authSecundaria() {
  const app = getApps().find(a => a.name === 'cuentas') || initializeApp(firebaseConfig, 'cuentas')
  return getAuth(app)
}

// Crea la cuenta (nombre + perfil) y devuelve su uid. Si ya existe una cuenta
// con ese nombre y perfil, devuelve { existe: true } (sin tocarla).
export async function crearCuenta(nombre, roleKey, password) {
  const a = authSecundaria()
  try {
    const cred = await createUserWithEmailAndPassword(a, emailDe(nombre, roleKey), password)
    const uid = cred.user.uid
    await signOut(a)
    return { uid }
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') return { existe: true }
    if (e.code === 'auth/weak-password') return { error: 'La contraseña tiene que tener 6 caracteres o más.' }
    return { error: e.message }
  }
}

// Para volver a vincular una cuenta que ya existía (perfil eliminado y vuelto
// a agregar): con su contraseña se obtiene su uid.
export async function uidDeCuenta(nombre, roleKey, password) {
  const a = authSecundaria()
  try {
    const cred = await signInWithEmailAndPassword(a, emailDe(nombre, roleKey), password)
    const uid = cred.user.uid
    await signOut(a)
    return { uid }
  } catch {
    return { error: 'Esa cuenta ya existe y la contraseña no coincide.' }
  }
}

// Registro de rol de la cuenta: lo que usan las reglas de Firestore para saber
// qué puede hacer cada persona. Solo el Administrador lo puede escribir.
export function escribirRol(uid, { nombre, roleKey, habilitado = true, subrol = null }) {
  return setDoc(doc(db, 'tubysol_roles', uid), { nombre, roleKey, habilitado, subrol: subrol || null, actualizadoEn: serverTimestamp() })
}
