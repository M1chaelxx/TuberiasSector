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

// Leer todos los items PP de tuberia_bd que tengan codIntSubcCompleto que empiece con SC152 o SC153
const q = query(collection(db, 'tuberia_bd'), where('pieza', '==', 'PP'))
const snap = await getDocs(q)

const rows = snap.docs.map(d => d.data())
const sc = rows.filter(r =>
  String(r.codIntSubcCompleto || '').includes('SC152') ||
  String(r.codIntSubcCompleto || '').includes('SC153') ||
  String(r.codIntSubcParcial || '').includes('SC152') ||
  String(r.codIntSubcParcial || '').includes('SC153')
)

console.log(`\nTotal PP items: ${rows.length}`)
console.log(`Items with SC152/SC153: ${sc.length}\n`)

for (const r of sc) {
  console.log({
    plano: r.plano,
    titulo: r.titulo,
    cap: r.cap,
    modelo: r.modelo,
    codIntSubcCompleto: r.codIntSubcCompleto,
    codIntSubcParcial: r.codIntSubcParcial,
    descripcionGral: r.descripcionGral,
    descSubcGral: r.descSubcGral,
    tipo: r.tipo,
  })
}

// Check avisos estados
console.log('\n--- AVISOS ESTADOS ---')
const avSnap = await getDocs(collection(db, 'avisos'))
const estados = {}
for (const d of avSnap.docs) {
  const s = d.data().estado || 'undefined'
  estados[s] = (estados[s] || 0) + 1
}
console.log('Estado counts:', estados)
for (const d of avSnap.docs) {
  const data = d.data()
  console.log({ id: d.id, estado: data.estado, resolvedAt: data.resolvedAt, titulo: data.titulo })
}
