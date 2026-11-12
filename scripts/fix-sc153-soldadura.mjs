import { initializeApp } from 'firebase/app'
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore'

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

const docRef = doc(db, 'soldadura_modelos', 'WRAC 2025_12FS')
const snap = await getDoc(docRef)
if (!snap.exists()) { console.log('DOC NOT FOUND'); process.exit(1) }

const data = snap.data()
const subcs = data.subconjuntos || []

// Find SC152
const sc152 = subcs.find(s => (s.codCompleto || s.codigo) === 'SC152')
if (!sc152) { console.log('SC152 NOT FOUND in subconjuntos'); console.log(subcs.map(s=>s.codCompleto||s.codigo)); process.exit(1) }

console.log('SC152 found:', JSON.stringify(sc152, null, 2))

// Check if SC153 already exists anywhere
const sc153existing = subcs.find(s => (s.codCompleto || s.codigo) === 'SC153')
const sc153parcial = sc152.parciales?.find(p => p.codParcial === 'SC153')
if (sc153existing) { console.log('SC153 already exists as Completo!'); process.exit(0) }
if (sc153parcial) { console.log('SC153 already exists as parcial of SC152!'); process.exit(0) }

// Add SC153 as a new Completo entry (same as old app showed it: SC153 · Completo · Tubo Capilar)
const sc153entry = {
  codCompleto: 'SC153',
  descGral: 'Tubo Capilar',
  tipo: sc152.tipo || 'Completo',
  ...(sc152.linea ? { linea: sc152.linea } : {}),
  parciales: [],
}

// Copy any other fields from SC152 that might be relevant
if (sc152.descSubcGral) sc153entry.descSubcGral = sc152.descSubcGral

const newSubcs = [...subcs, sc153entry]
console.log('\nAdding SC153 entry:', JSON.stringify(sc153entry, null, 2))
console.log(`\nUpdating WRAC 2025_12FS: ${subcs.length} → ${newSubcs.length} subconjuntos`)

await updateDoc(docRef, { subconjuntos: newSubcs })
console.log('DONE ✅')
