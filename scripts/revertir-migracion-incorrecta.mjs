/**
 * Revierte las migraciones incorrectas: mueve datos de vuelta desde key||P
 * al key original, salvo SC069 en WRAC 2025_12FS que es el único correcto.
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyD5ooKRGZoNVGLYMq61P6ZDEFcHcVFpgZQ',
  authDomain: 'bd-tuberias.firebaseapp.com',
  projectId: 'bd-tuberias',
  storageBucket: 'bd-tuberias.firebasestorage.app',
  messagingSenderId: '490401360995',
  appId: '1:490401360995:web:c914c69b20a78410cadc56',
}

// Solo este es correcto — todos los demás se revierten
const CORRECTOS = new Set(['WRAC 2025_12FS::SC069||P'])

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function revertir() {
  const snap = await getDocs(collection(db, 'soldadura_tiempos'))
  let totalDocs = 0
  let totalRevertidas = 0

  for (const docSnap of snap.docs) {
    const modeloId = docSnap.id
    const data = docSnap.data()
    let modified = false
    const newData = { ...data }

    for (const key of Object.keys(data)) {
      if (!key.endsWith('||P')) continue
      const id = `${modeloId}::${key}`
      if (CORRECTOS.has(id)) {
        console.log(`  ✓ conservo  [${modeloId}] ${key}`)
        continue
      }

      const baseKey = key.replace(/\|\|P$/, '')
      const parcialData = data[key] || {}
      const completoData = data[baseKey] || {}

      // Merge: combinar puestos del ||P de vuelta al original
      const merged = { ...completoData }
      for (const [puesto, val] of Object.entries(parcialData)) {
        if (!merged[puesto]) {
          merged[puesto] = val
        } else {
          // Mergear mediciones evitando duplicados por fecha
          const existingDates = new Set((merged[puesto].mediciones || []).map(m => m.fecha))
          const toAdd = (val.mediciones || []).filter(m => !existingDates.has(m.fecha))
          merged[puesto] = {
            ...merged[puesto],
            mediciones: [...(merged[puesto].mediciones || []), ...toAdd],
          }
        }
      }

      newData[baseKey] = merged
      delete newData[key]
      console.log(`  ✗ revertido [${modeloId}] ${key} → ${baseKey}`)
      modified = true
      totalRevertidas++
    }

    if (modified) {
      await setDoc(doc(db, 'soldadura_tiempos', modeloId), newData)
      console.log(`✓ ${modeloId} guardado`)
      totalDocs++
    }
  }

  console.log(`\nReversión completa: ${totalDocs} doc(s), ${totalRevertidas} clave(s) revertidas.`)
  process.exit(0)
}

revertir().catch(err => { console.error(err); process.exit(1) })
