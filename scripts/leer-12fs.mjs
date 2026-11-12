import { initializeApp } from 'firebase/app'
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore'

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

const q = query(
  collection(db, 'tuberia_bd'),
  where('modelo', '==', 'WRAC R32'),
  where('cap', '==', '12FS')
)
const snap = await getDocs(q)
const items = snap.docs.map(d => d.data())

// Group by codIntSubcParcial
const subcMap = {}
for (const item of items) {
  const key = item.codIntSubcParcial || '-'
  if (!subcMap[key]) {
    subcMap[key] = {
      codInt: key,
      codComp: item.codIntSubcCompleto,
      nombre: item.descripcionGral || key,
      tipo: item.tipo,
      counts: {}
    }
  }
  const p = item.pieza || '?'
  subcMap[key].counts[p] = (subcMap[key].counts[p] || 0) + 1
}

const subcs = Object.values(subcMap).sort((a, b) => a.nombre.localeCompare(b.nombre))
console.log(`Total subconjuntos for WRAC R32 / 12FS: ${subcs.length}`)
for (const s of subcs) {
  console.log(`  ${s.codInt} (comp=${s.codComp}, tipo=${s.tipo}): "${s.nombre}" — ${JSON.stringify(s.counts)}`)
}

// Also check tuberia_tiempos for SC152 and SC153 related planos
const tiemposSnap = await getDocs(collection(db, 'tuberia_tiempos'))
const planos152_153 = ['268', '220', '15']
console.log('\n--- tuberia_tiempos for SC152/SC153 planos ---')
for (const d of tiemposSnap.docs) {
  if (planos152_153.includes(d.id)) {
    const data = d.data()
    const puestosConDatos = Object.keys(data).filter(k => data[k]?.mediciones?.length > 0)
    console.log(`  Plano ${d.id}: medido en ${puestosConDatos.join(', ')} (${puestosConDatos.map(p => data[p].mediciones.length).join(', ')} mediciones)`)
  }
}
