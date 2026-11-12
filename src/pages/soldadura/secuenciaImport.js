import { doc, setDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { parseSecuencia } from './secuenciaExcel'

// Lee el Excel de Secuencia y guarda un documento por mes en
// `soldadura_secuencia` (reemplaza los meses que trae el archivo, no toca los
// otros). Lo usan "Secuencia del mes" (Puestos) y el Plan semanal.
export async function importarSecuencia(file) {
  const meses = parseSecuencia(await file.arrayBuffer())
  const ids = Object.keys(meses).sort()
  for (const id of ids) {
    await setDoc(doc(db, 'soldadura_secuencia', id), {
      items: meses[id].items, dias: meses[id].dias, diario: meses[id].diario || {},
      archivo: file.name, importadoEn: new Date().toISOString(),
    })
  }
  return ids
}
