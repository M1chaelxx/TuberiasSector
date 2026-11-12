import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { useOperarios, agregarOperario, fusionarNombreOperario } from '../../components/OperarioSelect'

export default function GestionOperarios() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const { operarios } = useOperarios()
  const [nuevo, setNuevo] = useState('')
  const [saving, setSaving] = useState(false)
  const [tiemposAll, setTiemposAll] = useState({})
  const [fusionando, setFusionando] = useState(null)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    const unsub = onSnapshot(collection(db, 'soldadura_tiempos'), snap => {
      const m = {}
      snap.docs.forEach(d => { m[d.id] = d.data() })
      setTiemposAll(m)
    }, () => {})
    return unsub
  }, [isAdmin, navigate])

  // Nombres que aparecen en mediciones ya guardadas pero todavía no están en la
  // lista — sirve para cargar la lista inicial sin tipearlos uno por uno.
  const detectados = useMemo(() => {
    const encontrados = new Map()
    for (const modelo of Object.values(tiemposAll)) {
      for (const subc of Object.values(modelo || {})) {
        if (!subc || typeof subc !== 'object') continue
        for (const puesto of Object.values(subc)) {
          for (const med of (puesto?.mediciones || [])) {
            const n = (med.operario || '').trim()
            if (n && !encontrados.has(n.toLowerCase())) encontrados.set(n.toLowerCase(), n)
          }
        }
      }
    }
    const yaCargados = new Set(operarios.map(o => o.nombre.toLowerCase()))
    return [...encontrados.values()].filter(n => !yaCargados.has(n.toLowerCase())).sort((a, b) => a.localeCompare(b))
  }, [tiemposAll, operarios])

  // Nombres que aparecen en mediciones guardadas escritos distinto (mayúsculas/
  // minúsculas) al operario ya cargado — ej: "Jorge GIl" vs "Jorge Gil".
  // Son invisibles para el bloque de arriba (que ya los considera "cargados"),
  // pero en los datos siguen siendo strings distintos y hay que unificarlos.
  const variantes = useMemo(() => {
    const canonPorLower = new Map(operarios.map(o => [o.nombre.toLowerCase(), o.nombre]))
    const porCanon = new Map() // nombre canónico -> Set de variantes tal cual guardadas
    for (const modelo of Object.values(tiemposAll)) {
      for (const subc of Object.values(modelo || {})) {
        if (!subc || typeof subc !== 'object') continue
        for (const puesto of Object.values(subc)) {
          for (const med of (puesto?.mediciones || [])) {
            const n = (med.operario || '').trim()
            if (!n) continue
            const canon = canonPorLower.get(n.toLowerCase())
            if (canon && n !== canon) {
              if (!porCanon.has(canon)) porCanon.set(canon, new Set())
              porCanon.get(canon).add(n)
            }
          }
        }
      }
    }
    const out = []
    for (const [canon, vars] of porCanon) {
      for (const v of vars) out.push({ variante: v, canon })
    }
    return out.sort((a, b) => a.variante.localeCompare(b.variante))
  }, [tiemposAll, operarios])

  async function fusionar(variante, canon) {
    if (!confirm(`¿Unificar "${variante}" con "${canon}" en todas las mediciones ya guardadas?\n\nEsto reescribe los registros históricos de soldadura y no tiene un botón de deshacer.`)) return
    setFusionando(variante)
    try {
      const { docsModificados, medicionesModificadas } = await fusionarNombreOperario(variante, canon)
      alert(
        medicionesModificadas > 0
          ? `Listo: ${medicionesModificadas} medición${medicionesModificadas !== 1 ? 'es' : ''} actualizada${medicionesModificadas !== 1 ? 's' : ''} en ${docsModificados} modelo${docsModificados !== 1 ? 's' : ''}.`
          : 'No se encontró ninguna medición con ese nombre exacto (puede que ya se haya unificado).'
      )
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setFusionando(null)
  }

  async function crear(nombre) {
    const limpio = (nombre ?? '').trim()
    if (!limpio) { alert('Ingresá el nombre del operario'); return }
    if (operarios.some(o => o.nombre.toLowerCase() === limpio.toLowerCase())) {
      alert('Ese operario ya está en la lista')
      return
    }
    setSaving(true)
    try {
      await agregarOperario(limpio)
      setNuevo('')
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  async function eliminar(o) {
    if (!confirm(`¿Sacar a "${o.nombre}" de la lista?\n\nLas mediciones ya guardadas con su nombre no se modifican.`)) return
    await deleteDoc(doc(db, 'tubysol_operarios', o.id))
  }

  return (
    <div className="app">
      <Header title="Operarios" back="/" />

      <div className="content">

        {/* Alta */}
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px #0002', border: '1.5px dashed #1a73e8' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#1a73e8' }}>Agregar operario</div>
          <input
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') crear(nuevo) }}
            placeholder="Ej: Jorge Gil"
            style={{ width: '100%', border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
          <button
            onClick={() => crear(nuevo)}
            disabled={saving || !nuevo.trim()}
            style={{
              width: '100%', marginTop: 10, background: saving || !nuevo.trim() ? '#a5c8f5' : '#1a73e8',
              color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0',
              fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Agregando…' : '+ Agregar'}
          </button>
        </div>

        {/* Detectados en mediciones existentes */}
        {detectados.length > 0 && (
          <div style={{ background: '#fffde7', border: '1px solid #ffe082', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#8d6e00', marginBottom: 4 }}>
              Encontrados en mediciones ya cargadas ({detectados.length})
            </div>
            <div style={{ fontSize: 11, color: '#8d6e00', marginBottom: 10, lineHeight: 1.4 }}>
              Estos nombres se usaron antes pero no están en la lista. Tocá para agregarlos.
              Si ves el mismo operario escrito de dos formas, agregá solo la correcta.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {detectados.map(n => (
                <button
                  key={n}
                  onClick={() => crear(n)}
                  style={{
                    background: '#fff', border: '1px solid #ffca28', color: '#6d4c00',
                    borderRadius: 16, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  + {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Variantes con mayúsculas/minúsculas distintas → unificar */}
        {variantes.length > 0 && (
          <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#c62828', marginBottom: 4 }}>
              Mismo operario escrito distinto ({variantes.length})
            </div>
            <div style={{ fontSize: 11, color: '#c62828', marginBottom: 10, lineHeight: 1.4 }}>
              Ya está bien cargado en la lista, pero en mediciones anteriores quedó guardado con otra grafía.
              Fusioná para que todo quede con el nombre correcto.
            </div>
            {variantes.map(({ variante, canon }) => (
              <div key={variante} style={{
                display: 'flex', alignItems: 'center', gap: 8, background: '#fff',
                borderRadius: 8, padding: '8px 10px', marginBottom: 6, fontSize: 12,
              }}>
                <span style={{ flex: 1 }}>
                  <span style={{ textDecoration: 'line-through', color: '#999' }}>{variante}</span>
                  {' → '}
                  <strong style={{ color: '#2e7d32' }}>{canon}</strong>
                </span>
                <button
                  onClick={() => fusionar(variante, canon)}
                  disabled={fusionando === variante}
                  style={{
                    background: fusionando === variante ? '#a5c8f5' : '#1a73e8', color: '#fff',
                    border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontWeight: 700,
                    cursor: fusionando === variante ? 'default' : 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  {fusionando === variante ? 'Uniendo…' : 'Fusionar'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Lista */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#666', margin: '0 0 8px 2px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          En la lista ({operarios.length})
        </div>

        {operarios.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: '#999', fontSize: 13 }}>
            Todavía no hay operarios cargados.
          </div>
        ) : (
          operarios.map(o => (
            <div key={o.id} style={{
              background: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 8,
              border: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#111' }}>{o.nombre}</div>
              <button
                onClick={() => eliminar(o)}
                style={{ background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}
              >
                🗑️
              </button>
            </div>
          ))
        )}

        <div style={{ fontSize: 11, color: '#999', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
          Eliminar un operario solo lo saca del desplegable.<br />
          Las mediciones ya tomadas conservan el nombre con el que se guardaron.
        </div>
      </div>
    </div>
  )
}
