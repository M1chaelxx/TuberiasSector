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

const snap = await getDocs(collection(db, 'avisos'))
for (const d of snap.docs) {
  const data = d.data()
  console.log(`\n── ${d.id}`)
  console.log(`   titulo:    ${data.titulo}`)
  console.log(`   estado:    ${data.estado}`)
  console.log(`   prioridad: ${data.prioridad}`)
  console.log(`   cerrado:   ${data.cerrado}`)
  console.log(`   realizado: ${data.realizado}`)
  console.log(`   cerradoPor:${data.cerradoPor}`)
  console.log(`   creadoEn:  ${data.creadoEn}`)
  console.log(`   campos extra:`, Object.keys(data).filter(k => !['titulo','descripcion','estado','prioridad','cerrado','realizado','cerradoPor','cerradoEn','creadoPor','creadoEn','comentarios','fotos','puesto'].includes(k)))
}
process.exit(0)
