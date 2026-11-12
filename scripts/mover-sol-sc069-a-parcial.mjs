/**
 * Mueve los datos de SOL-xx desde SC069 → SC069||P en WRAC 2025_12FS.
 *
 * Contexto: SC069 tiene CodComp == CodParcial == SC069, por lo que el Parcial
 * necesita la clave SC069||P en Firestore (fix V152).
 * El script fix-final-preformados revirtió SC069||P → SC069 incorrectamente.
 * Este script vuelve a separar: SOL-xx → SC069||P, Preformado/_fotos → SC069.
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

async function main() {
  const modeloId = 'WRAC 2025_12FS'
  const ref_ = doc(db, 'soldadura_tiempos', modeloId)
  const snap = await getDoc(ref_)

  if (!snap.exists()) {
    console.log('No existe el documento WRAC 2025_12FS')
    process.exit(1)
  }

  const data = snap.data()
  const entry = data['SC069']

  if (!entry) {
    console.log('No hay datos en SC069')
    process.exit(0)
  }

  // Diagnostico previo
  console.log('Estado actual de SC069:')
  for (const [k, v] of Object.entries(entry)) {
    if (PUESTOS_SOL.includes(k)) {
      console.log(`  SOL: ${k} → ${v?.mediciones?.length || 0} mediciones`)
    } else {
      console.log(`  Otro: ${k} → ${v?.mediciones?.length || 0} mediciones`)
    }
  }

  const existingParcial = data['SC069||P'] || {}

  // Separar: SOL-xx → SC069||P, resto → SC069
  const completoData = {}
  const parcialData = { ...existingParcial }

  for (const [k, v] of Object.entries(entry)) {
    if (PUESTOS_SOL.includes(k)) {
      // Mover al Parcial (merge si ya hay datos)
      if (!parcialData[k]) {
        parcialData[k] = v
      } else {
        parcialData[k] = {
          ...parcialData[k],
          mediciones: mergeMediciones(parcialData[k].mediciones, v.mediciones),
        }
      }
      console.log(`  → ${k} movido a SC069||P`)
    } else {
      completoData[k] = v
    }
  }

  const newData = {
    ...data,
    'SC069': completoData,
    'SC069||P': parcialData,
  }

  await setDoc(ref_, newData)
  console.log('\n✓ SC069 separado correctamente:')
  console.log('  Preformado/_fotos → SC069 (Completo)')
  console.log('  SOL-xx → SC069||P (Parcial)')
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
