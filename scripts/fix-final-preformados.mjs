/**
 * Fix definitivo basado en el Excel como fuente de verdad:
 *
 * REGLA: Un Preformado tiene "Pref" en el nombre.
 * - Si CodComp == CodParc → necesitan clave separada en Firestore (usa ||P para el Parcial)
 * - Si CodComp != CodParc → ya tienen claves distintas, no se toca nada
 *
 * ACCIONES:
 * 1. Revertir SC069||P en WRAC 2025_12FS (SC069 tiene CodParc=SC118, no necesita ||P)
 * 2. Re-separar PR024 en WRAC 2025_09FS (CodComp==CodParc, fue revertido por error)
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyD5ooKRGZoNVGLYMq61P6ZDEFcHcVFpgZQ',
  authDomain: 'bd-tuberias.firebaseapp.com',
  projectId: 'bd-tuberias',
  storageBucket: 'bd-tuberias.firebasestorage.app',
  messagingSenderId: '490401360995',
  appId: '1:490401360995:web:c914c69b20a78410cadc56',
}

const PUESTOS_SOL = [
  'SOL-01','SOL-02','SOL-03','SOL-04','SOL-05','SOL-06',
  'SOL-07','SOL-08','SOL-09','SOL-10','SOL-11','SOL-12',
  'SOL-13','SOL-14','SOL-15','SOL-16','SOL-17','SOL-18',
]

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

function mergeMediciones(existing, incoming) {
  const dates = new Set((existing || []).map(m => m.fecha))
  const toAdd = (incoming || []).filter(m => !dates.has(m.fecha))
  return [...(existing || []), ...toAdd]
}

// ── 1. Revertir SC069||P → SC069 (merge de vuelta) ──────────────────────────
async function revertirSC069() {
  const modeloId = 'WRAC 2025_12FS'
  const ref = doc(db, 'soldadura_tiempos', modeloId)
  const snap = await getDoc(ref)
  if (!snap.exists()) { console.log('No existe WRAC 2025_12FS'); return }

  const data = snap.data()
  if (!data['SC069||P']) { console.log('SC069||P no existe, nada que revertir'); return }

  const parcialData = data['SC069||P']
  const completoData = data['SC069'] || {}

  // Merge de vuelta al Completo
  const merged = { ...completoData }
  for (const [puesto, val] of Object.entries(parcialData)) {
    if (!merged[puesto]) {
      merged[puesto] = val
    } else {
      merged[puesto] = {
        ...merged[puesto],
        mediciones: mergeMediciones(merged[puesto].mediciones, val.mediciones),
      }
    }
  }

  const newData = { ...data, 'SC069': merged }
  delete newData['SC069||P']
  await setDoc(ref, newData)
  console.log('✓ SC069||P revertido → SC069 en WRAC 2025_12FS')
}

// ── 2. Separar PR024 en WRAC 2025_09FS ──────────────────────────────────────
async function separarPR024() {
  const modeloId = 'WRAC 2025_09FS'
  const ref = doc(db, 'soldadura_tiempos', modeloId)
  const snap = await getDoc(ref)
  if (!snap.exists()) { console.log('No existe WRAC 2025_09FS'); return }

  const data = snap.data()
  const entry = data['PR024']
  if (!entry) { console.log('No hay datos de PR024'); return }

  // Separar: Preformado + _fotos quedan en PR024 (Completo)
  //          SOL-xx van a PR024||P (Parcial)
  const completoData = {}
  const parcialData = { ...(data['PR024||P'] || {}) }

  for (const [key, val] of Object.entries(entry)) {
    if (PUESTOS_SOL.includes(key)) {
      // Va al Parcial
      if (!parcialData[key]) {
        parcialData[key] = val
      } else {
        parcialData[key] = {
          ...parcialData[key],
          mediciones: mergeMediciones(parcialData[key].mediciones, val.mediciones),
        }
      }
    } else {
      // Preformado, _fotos u otro → queda en Completo
      completoData[key] = val
    }
  }

  const newData = { ...data, 'PR024': completoData, 'PR024||P': parcialData }
  await setDoc(ref, newData)
  console.log('✓ PR024 separado en WRAC 2025_09FS: Preformado → PR024 | SOL-xx → PR024||P')
}

async function main() {
  await revertirSC069()
  await separarPR024()
  console.log('\nFix completo.')
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
