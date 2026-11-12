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

const snap = await getDocs(collection(db, 'soldadura_modelos'))
for (const d of snap.docs) {
  const data = d.data()
  if (!d.id.includes('WRAC') && !d.id.includes('2025') && !d.id.includes('12FS')) {
    // Only print first doc if no match to keep output short
  }
  console.log(`\n=== Doc: ${d.id} ===`)
  console.log(`  modelo=${data.modelo}, cap=${data.cap}`)
  const subcs = data.subconjuntos || []
  console.log(`  subconjuntos (${subcs.length}):`)
  for (const s of subcs) {
    const code = s.codCompleto || s.codigo || '?'
    const parciales = s.parciales || []
    console.log(`    ${code} | tipo=${s.tipo} | desc=${s.descGral || s.titulo || '-'} | parciales=${parciales.length}`)
    for (const p of parciales) {
      console.log(`      -> parcial: ${p.codParcial} | ${p.descSubc || '-'}`)
    }
  }
}
