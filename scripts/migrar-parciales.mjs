/**
 * Migración V152: separa mediciones mezcladas de SC069 (y similares)
 *
 * Regla: cuando un subconjunto tiene clave "SC069" con datos de puestos
 * SOL-xx mezclados con Preformado, los SOL-xx van a "SC069||P" (Parcial)
 * y Preformado + _fotos quedan en "SC069" (Completo).
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

const PUESTOS_SOL = [
  'SOL-01', 'SOL-02', 'SOL-03', 'SOL-04', 'SOL-05', 'SOL-06',
  'SOL-07', 'SOL-08', 'SOL-09', 'SOL-10', 'SOL-11', 'SOL-12',
  'SOL-13', 'SOL-14', 'SOL-15', 'SOL-16', 'SOL-17', 'SOL-18',
]

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function migrar() {
  const snap = await getDocs(collection(db, 'soldadura_tiempos'))
  let totalDocs = 0
  let totalMigrados = 0

  for (const docSnap of snap.docs) {
    const modeloId = docSnap.id
    const data = docSnap.data()
    let modified = false
    const newData = { ...data }

    for (const key of Object.keys(data)) {
      if (key.endsWith('||P')) continue // ya migrado

      const entry = data[key]
      if (typeof entry !== 'object' || entry === null) continue

      // Detectar si este key tiene puestos SOL-xx mezclados con Preformado
      const tieneSol = PUESTOS_SOL.some(p => entry[p]?.mediciones?.length > 0)
      const tienePreformado = entry['Preformado']?.mediciones?.length > 0

      if (!tieneSol) continue // no hay nada que separar

      const parcialKey = `${key}||P`

      // Si ya existe la clave parcial, mergear; si no, crear
      const existingParcial = newData[parcialKey] || {}

      // Construir entrada para el Parcial: solo SOL-xx
      const parcialData = { ...existingParcial }
      for (const p of PUESTOS_SOL) {
        if (entry[p]?.mediciones?.length > 0) {
          // Mergear mediciones (evitar duplicados por fecha)
          const existingMeds = parcialData[p]?.mediciones || []
          const newMeds = entry[p].mediciones
          const allDates = new Set(existingMeds.map(m => m.fecha))
          const toAdd = newMeds.filter(m => !allDates.has(m.fecha))
          parcialData[p] = { mediciones: [...existingMeds, ...toAdd] }
        }
      }

      // Limpiar SOL-xx del Completo
      const completoData = {}
      for (const [k, v] of Object.entries(entry)) {
        if (!PUESTOS_SOL.includes(k)) {
          completoData[k] = v // Preformado, _fotos, y cualquier otro campo
        }
      }

      if (tienePreformado) {
        console.log(`  [${modeloId}] ${key}: Preformado queda, SOL-xx → ${parcialKey}`)
      } else {
        console.log(`  [${modeloId}] ${key}: solo SOL-xx → ${parcialKey}`)
      }

      newData[key] = completoData
      newData[parcialKey] = parcialData
      modified = true
      totalMigrados++
    }

    if (modified) {
      await setDoc(doc(db, 'soldadura_tiempos', modeloId), newData)
      console.log(`✓ ${modeloId} guardado`)
      totalDocs++
    }
  }

  if (totalDocs === 0) {
    console.log('No se encontraron datos mezclados. Nada que migrar.')
  } else {
    console.log(`\nMigración completa: ${totalDocs} documento(s) actualizados, ${totalMigrados} clave(s) separadas.`)
  }

  process.exit(0)
}

migrar().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
