import { useNavigate } from 'react-router-dom'
import Header from '../../components/Header'

const TILES = [
  { id: 'tuberia', icon: '🔩', name: 'Auditoría de Tubería', sub: 'Corte y conformado — FR-AC.032', color: '#e3f2fd', path: '/calidad/tuberia' },
  { id: 'soldadura', icon: '🔧', name: 'Check List Soldadura', sub: 'Proceso de soldadura — FR-AC.001', color: '#ffebee', path: '/calidad/soldadura' },
  { id: 'producto-terminado', icon: '📦', name: 'Check List Producto Terminado', sub: 'Producto terminado de soldadura', color: '#f3e5f5', path: '/calidad/producto-terminado' },
]

export default function CalidadHome() {
  const navigate = useNavigate()
  return (
    <div className="app">
      <Header title="Calidad" back="/" />
      <div className="home-grid">
        {TILES.map(t => (
          <div key={t.id} className="home-tile" style={{ background: t.color }} onClick={() => navigate(t.path)}>
            <span className="tile-icon">{t.icon}</span>
            <div className="tile-name">{t.name}</div>
            <div className="tile-sub">{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
