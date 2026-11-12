import { useState, useEffect } from 'react'
import { collection, onSnapshot, addDoc, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

// Lista de operarios cargados, ordenada alfabéticamente.
// Devuelve también el estado de carga y el error, para poder distinguir
// "todavía no hay operarios" de "no se pudo leer la lista".
export function useOperarios() {
  const [operarios, setOperarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'tubysol_operarios'),
      snap => {
        setOperarios(
          snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(o => o.nombre)
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
        )
        setError(null)
        setLoading(false)
      },
      err => {
        console.error('No se pudo leer tubysol_operarios:', err)
        setError(err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  return { operarios, loading, error }
}

export async function agregarOperario(nombre) {
  const limpio = nombre.trim()
  if (!limpio) return null
  await addDoc(collection(db, 'tubysol_operarios'), {
    nombre: limpio,
    creadoEn: new Date().toISOString(),
  })
  return limpio
}

// Unifica una grafía mal escrita (ej: "Jorge GIl") con el nombre correcto ya
// cargado (ej: "Jorge Gil") en TODAS las mediciones de soldadura ya guardadas.
// Recorre soldadura_tiempos/{modelo}/{subconjunto}/{puesto}/mediciones y
// reescribe el campo operario donde coincida (sin distinguir mayúsculas),
// reescribiendo solo los documentos que realmente cambian.
export async function fusionarNombreOperario(desde, hacia) {
  const desdeNorm = desde.trim().toLowerCase()
  const haciaLimpio = hacia.trim()
  if (!desdeNorm || !haciaLimpio) return { docsModificados: 0, medicionesModificadas: 0 }

  const snap = await getDocs(collection(db, 'soldadura_tiempos'))
  let docsModificados = 0
  let medicionesModificadas = 0

  for (const modeloSnap of snap.docs) {
    const data = modeloSnap.data()
    let changed = false
    for (const subc of Object.values(data)) {
      if (!subc || typeof subc !== 'object') continue
      for (const [puestoKey, puesto] of Object.entries(subc)) {
        if (puestoKey === '_fotos' || !Array.isArray(puesto?.mediciones)) continue
        for (const m of puesto.mediciones) {
          if (m?.operario && m.operario.trim().toLowerCase() === desdeNorm && m.operario !== haciaLimpio) {
            m.operario = haciaLimpio
            changed = true
            medicionesModificadas++
          }
        }
      }
    }
    if (changed) {
      await setDoc(doc(db, 'soldadura_tiempos', modeloSnap.id), data)
      docsModificados++
    }
  }

  return { docsModificados, medicionesModificadas }
}

// Selector de operario con alta rápida. Reemplaza al campo de texto libre para
// evitar que la misma persona quede cargada con distintas grafías.
export default function OperarioSelect({ value, onChange, disabled }) {
  const { operarios, loading, error } = useOperarios()
  const [adding, setAdding] = useState(false)
  const [nuevo, setNuevo] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirmarNuevo() {
    const limpio = nuevo.trim()
    if (!limpio) return
    // Si ya existe (aunque esté escrito distinto), se usa el nombre ya cargado
    // en vez de crear un duplicado.
    const existente = operarios.find(o => o.nombre.toLowerCase() === limpio.toLowerCase())
    if (existente) {
      onChange(existente.nombre)
      setAdding(false)
      setNuevo('')
      return
    }
    setSaving(true)
    try {
      await agregarOperario(limpio)
      onChange(limpio)
      setAdding(false)
      setNuevo('')
    } catch (err) {
      alert('Error al agregar operario: ' + err.message)
    }
    setSaving(false)
  }

  if (adding) {
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 600 }}>
          👤 Nuevo operario
        </div>
        <input
          autoFocus
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') confirmarNuevo() }}
          placeholder="Nombre y apellido"
          style={{
            width: '100%', borderRadius: 6, padding: '8px 10px', fontSize: 13,
            boxSizing: 'border-box', border: '1.5px solid var(--primary)', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            onClick={() => { setAdding(false); setNuevo('') }}
            style={{ flex: 1, background: '#eee', border: 'none', borderRadius: 6, padding: '7px 0', fontSize: 12, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={confirmarNuevo}
            disabled={saving || !nuevo.trim()}
            style={{
              flex: 2, background: saving || !nuevo.trim() ? '#a5c8f5' : 'var(--primary)',
              color: '#fff', border: 'none', borderRadius: 6, padding: '7px 0',
              fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Agregando…' : 'Agregar y usar'}
          </button>
        </div>
      </div>
    )
  }

  const vacia = !loading && !error && operarios.length === 0

  const placeholder =
    loading ? 'Cargando operarios…'
    : error ? '⚠ No se pudo leer la lista'
    : vacia ? '— Todavía no hay operarios cargados —'
    : '👤 Elegí el operario *'

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || loading}
          style={{
            flex: 1, minWidth: 0, borderRadius: 6, padding: '8px 10px', fontSize: 13,
            boxSizing: 'border-box',
            border: value ? '1px solid #ddd' : '2px solid #d32f2f',
            background: disabled || loading ? '#f5f5f5' : '#fff',
            color: value ? '#000' : '#888',
            outline: 'none',
          }}
        >
          <option value="">{placeholder}</option>
          {operarios.map(o => (
            <option key={o.id} value={o.nombre}>{o.nombre}</option>
          ))}
        </select>
        {!disabled && (
          <button
            onClick={() => setAdding(true)}
            title="Agregar operario nuevo"
            style={{
              flexShrink: 0,
              background: vacia ? 'var(--primary)' : '#e3f2fd',
              color: vacia ? '#fff' : '#1565c0',
              border: vacia ? 'none' : '1px solid #90caf9',
              borderRadius: 6, padding: '0 14px',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            + Nuevo
          </button>
        )}
      </div>

      {vacia && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
          Tocá <strong>+ Nuevo</strong> para cargar el primero, o andá a
          <strong> Inicio → Operarios</strong> para cargarlos todos de una.
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: '#c62828', marginTop: 4, lineHeight: 1.4 }}>
          No se pudo leer la lista de operarios. Si el problema sigue, revisá los permisos
          de la colección <code>tubysol_operarios</code> en Firestore.
        </div>
      )}
    </div>
  )
}
