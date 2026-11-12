/**
 * Verifica qué códigos son realmente compartidos (mismo código en Completo y Parcial)
 * y cuáles fueron migrados incorrectamente a ||P.
 */

import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyD5ooKRGZoNVGLYMq61P6ZDEFcHcVFpgZQ',
  authDomain: 'bd-tuberias.firebaseapp.com',
  projectId: 'bd-tuberias',
  storageBucket: 'bd-tuberias.firebasestorage.app',
  messagingSenderId: '490401360995',
  appId: '1:490401360995:web:c914c69b20a78410cadc56',
}

const app = initializeApp(firebaseConfig)
const db = getFirestore(app)

async function verificar() {
  // 1. Leer modelos y armar mapa de códigos compartidos
  const modelosSnap = await getDocs(collection(db, 'soldadura_modelos'))
  const sharedByModelo = {} // { modeloId: Set<codigo> }

  for (const mSnap of modelosSnap.docs) {
    const modeloId = mSnap.id
    const subconjuntos = mSnap.data().subconjuntos || []
    const shared = new Set()

    for (const s of subconjuntos) {
      const compCode = s.codCompleto || s.codigo
      for (const p of (s.parciales || [])) {
        if (p.codParcial === compCode) {
          shared.add(compCode)
        }
      }
    }
    sharedByModelo[modeloId] = shared
  }

  console.log('=== Códigos con Completo y Parcial compartiendo el mismo código ===')
  for (const [mid, set] of Object.entries(sharedByModelo)) {
    if (set.size > 0) console.log(`  ${mid}: ${[...set].join(', ')}`)
  }

  // 2. Leer tiempos y detectar claves ||P que NO deberían estarlo
  console.log('\n=== Claves migradas a ||P — verificando si son correctas ===')
  const tiemposSnap = await getDocs(collection(db, 'soldadura_tiempos'))

  for (const tSnap of tiemposSnap.docs) {
    const modeloId = tSnap.id
    const data = tSnap.data()
    const shared = sharedByModelo[modeloId] || new Set()

    for (const key of Object.keys(data)) {
      if (!key.endsWith('||P')) continue
      const baseKey = key.replace(/\|\|P$/, '')
      if (shared.has(baseKey)) {
        console.log(`  ✓ OK   [${modeloId}] ${key} (código compartido confirmado)`)
      } else {
        console.log(`  ✗ MAL  [${modeloId}] ${key} (código NO está en lista de compartidos — migración incorrecta)`)
      }
    }
  }
}

verificar().catch(err => { console.error(err); process.exit(1) })
