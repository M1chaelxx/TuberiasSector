import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase'
import Header from '../../components/Header'

export default function TuberiasList() {
  const { modeloId } = useParams()
  const navigate = useNavigate()
  const [modelo, setModelo] = useState(null)
  const [tiempos, setTiempos] = useState({})
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('todos')
  const [maquinaFilter, setMaquinaFilter] = useState('todas')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const u1 = onSnapshot(doc(db,'tuberia_modelos',modeloId), snap => {
      if (snap.exists()) setModelo({id:snap.id,...snap.data()})
      setLoading(false)
    })
    const u2 = onSnapshot(doc(db,'tuberia_tiempos',modeloId), snap => {
      setTiempos(snap.exists() ? snap.data() : {})
    }, ()=>{})
    return () => { u1(); u2() }
  }, [modeloId])

  if (loading) return <div className="spinner"><div className="spin"/></div>
  if (!modelo) return <div className="empty"><p>Modelo no encontrado</p></div>

  const planos = modelo.planos || []

  function hasMed(p) {
    const t = tiempos[p.plano]
    return t && Object.values(t).some(m=>m?.mediciones?.length>0)
  }

  function getMaquinas(p) {
    const t = tiempos[p.plano] || {}
    return Object.keys(t).filter(k=>t[k]?.mediciones?.length>0)
  }

  const allMaquinas = [...new Set(planos.flatMap(p => getMaquinas(p)))]

  let filtered = planos.filter(p => {
    const matchSearch = !search || `${p.plano} ${p.titulo} ${p.equipos}`.toLowerCase().includes(search.toLowerCase())
    const matchTab = tab==='todos' || (tab==='medidos'&&hasMed(p)) || (tab==='pendientes'&&!hasMed(p))
    const matchMaq = maquinaFilter==='todas' || getMaquinas(p).includes(maquinaFilter)
    return matchSearch && matchTab && matchMaq
  })

  const medidos = planos.filter(p=>hasMed(p)).length
  const pct = planos.length>0 ? Math.round(medidos/planos.length*100) : 0

  return (
    <div className="app">
      <Header title={`${modelo.modelo} · ${modelo.capacidad}`} back="/tuberias" />

      <div className="stats-row">
        <div className="stat-card"><div className="sv">{planos.length}</div><div className="sl">Planos</div></div>
        <div className="stat-card"><div className="sv" style={{color:'var(--success)'}}>{medidos}</div><div className="sl">Medidos</div></div>
        <div className="stat-card"><div className="sv" style={{color:'#bdbdbd'}}>{planos.length-medidos}</div><div className="sl">Pendientes</div></div>
        <div className="stat-card"><div className="sv">{pct}%</div><div className="sl">Cobertura</div></div>
      </div>

      <div className="progress-bar-wrap">
        <div className="progress-bar"><div className="fill" style={{width:`${pct}%`}}/></div>
      </div>

      <div className="search-bar" style={{top:52}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar plano, título, equipos..." />
      </div>

      <div className="tabs">
        {[{id:'todos',label:'Todos',count:planos.length},{id:'medidos',label:'Medidos',count:medidos},{id:'pendientes',label:'Pendientes',count:planos.length-medidos}].map(t=>(
          <button key={t.id} className={`tab${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>
            {t.label}<span className="tab-count">{t.count}</span>
          </button>
        ))}
        {allMaquinas.length > 0 && allMaquinas.map(mq=>(
          <button key={mq} className={`tab${maquinaFilter===mq?' active':''}`} onClick={()=>setMaquinaFilter(maquinaFilter===mq?'todas':mq)}>
            {mq}
          </button>
        ))}
      </div>

      <div className="content">
        {filtered.length===0 && <div className="empty"><div className="ei">🔍</div><p>Sin resultados</p></div>}
        {filtered.map(p => {
          const tiene = hasMed(p)
          const mqs = getMaquinas(p)
          return (
            <div key={p.plano} className={`card ${tiene?'medido':'pendiente'}`}
              onClick={()=>navigate(`/tuberias/${modeloId}/${encodeURIComponent(p.plano)}`)}>
              <div className={`icon ${tiene?'plano':'pp'}`}>{tiene?'✓':'○'}</div>
              <div className="info">
                <h3>{p.plano}</h3>
                <p>{p.titulo || p.equipos || 'Sin descripción'}</p>
                {mqs.length>0 && <p style={{fontSize:11,color:'var(--primary)',marginTop:2}}>{mqs.join(' · ')}</p>}
              </div>
              <div className="arrow">›</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
