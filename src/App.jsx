import { HashRouter as BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'

import Login from './pages/Login'
import Home from './pages/Home'
import SoldaduraHome from './pages/soldadura/SoldaduraHome'
import SoldaduraCapacidades from './pages/soldadura/SoldaduraCapacidades'
import SoldaduraList from './pages/soldadura/SoldaduraList'
import SoldaduraDetail from './pages/soldadura/SoldaduraDetail'
import SoldaduraTiempos from './pages/soldadura/SoldaduraTiempos'
import SoldaduraBalance from './pages/soldadura/SoldaduraBalance'
import SoldaduraPuestos from './pages/soldadura/SoldaduraPuestos'
import SoldaduraPlanSemanal from './pages/soldadura/SoldaduraPlanSemanal'
import SoldaduraTaktTime from './pages/soldadura/SoldaduraTaktTime'
import SoldaduraCargaImagenes from './pages/soldadura/SoldaduraCargaImagenes'
import SoldaduraVisualizadores from './pages/soldadura/SoldaduraVisualizadores'
import TuberiasHome from './pages/tuberias/TuberiasHome'
import TuberiasCapacidades from './pages/tuberias/TuberiasCapacidades'
import TuberiasSubconjuntos from './pages/tuberias/TuberiasSubconjuntos'
import TuberiasItems from './pages/tuberias/TuberiasItems'
import TuberiasPiezaDetail from './pages/tuberias/TuberiasPiezaDetail'
import TuberiasCronometro from './pages/tuberias/TuberiasCronometro'
import TuberiasTiempos from './pages/tuberias/TuberiasTiempos'
import TuberiasTipoAll from './pages/tuberias/TuberiasTipoAll'
import TuberiasCobertura from './pages/tuberias/TuberiasCobertura'
import TuberiasCargaImagenes from './pages/tuberias/TuberiasCargaImagenes'
import AvisosList from './pages/avisos/AvisosList'
import AvisoDetail from './pages/avisos/AvisoDetail'
import Tablero from './pages/tablero/Tablero'
import Instrucciones from './pages/Instrucciones'
import GestionUsuarios from './pages/admin/GestionUsuarios'
import GestionOperarios from './pages/admin/GestionOperarios'
import GestionVisualizadores from './pages/admin/GestionVisualizadores'
import ExternoModelos from './pages/externo/ExternoModelos'
import ExternoCapacidades from './pages/externo/ExternoCapacidades'
import ExternoSubconjuntos from './pages/externo/ExternoSubconjuntos'
import ExternoSubconjuntoDetail from './pages/externo/ExternoSubconjuntoDetail'
import ExternoPiezas from './pages/externo/ExternoPiezas'
import ExternoVisualizadores from './pages/externo/ExternoVisualizadores'
import CalidadHome from './pages/calidad/CalidadHome'
import CalidadAuditorias from './pages/calidad/CalidadAuditorias'
import CalidadChecklistSoldadura from './pages/calidad/CalidadChecklistSoldadura'
import CalidadChecklistProductoTerminado from './pages/calidad/CalidadChecklistProductoTerminado'
import { useAvisosBadge } from './hooks/useAvisosBadge'

function Protected({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return children
}

// Al navegar entre pantallas (avanzar o volver) la posición de scroll quedaba
// heredada de la pantalla anterior, así que una lista larga podía "abrir" ya
// desplazada. Cada cambio de ruta arranca desde arriba.
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

function AppRoutes() {
  const { user } = useAuth()
  useAvisosBadge(!!user, user?.display)
  return (
    <>
    <ScrollToTop />
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<Protected><Home /></Protected>} />

      <Route path="/soldadura" element={<Protected><SoldaduraHome /></Protected>} />
      <Route path="/soldadura/tiempos" element={<Protected><SoldaduraTiempos /></Protected>} />
      <Route path="/soldadura/balance" element={<Protected><SoldaduraBalance /></Protected>} />
      <Route path="/soldadura/puestos" element={<Protected><SoldaduraPuestos /></Protected>} />
      <Route path="/soldadura/plan-semanal" element={<Protected><SoldaduraPlanSemanal /></Protected>} />
      <Route path="/soldadura/takttime" element={<Protected><SoldaduraTaktTime /></Protected>} />
      <Route path="/soldadura/imagenes" element={<Protected><SoldaduraCargaImagenes /></Protected>} />
      <Route path="/soldadura/visualizadores" element={<Protected><SoldaduraVisualizadores /></Protected>} />
      <Route path="/soldadura/m/:modeloName" element={<Protected><SoldaduraCapacidades /></Protected>} />
      <Route path="/soldadura/:modeloId" element={<Protected><SoldaduraList /></Protected>} />
      <Route path="/soldadura/:modeloId/:codigo" element={<Protected><SoldaduraDetail /></Protected>} />

      <Route path="/tuberias" element={<Protected><TuberiasHome /></Protected>} />
      <Route path="/tuberias/tiempos" element={<Protected><TuberiasTiempos /></Protected>} />
      <Route path="/tuberias/tiempos/:plano" element={<Protected><TuberiasCronometro /></Protected>} />
      <Route path="/tuberias/tipo/:tipo" element={<Protected><TuberiasTipoAll /></Protected>} />
      <Route path="/tuberias/cobertura" element={<Protected><TuberiasCobertura /></Protected>} />
      <Route path="/tuberias/imagenes" element={<Protected><TuberiasCargaImagenes /></Protected>} />
      <Route path="/tuberias/:modeloKey" element={<Protected><TuberiasCapacidades /></Protected>} />
      <Route path="/tuberias/:modeloKey/:cap" element={<Protected><TuberiasSubconjuntos /></Protected>} />
      <Route path="/tuberias/:modeloKey/:cap/:subcKey" element={<Protected><TuberiasItems /></Protected>} />
      <Route path="/tuberias/:modeloKey/:cap/:subcKey/:docId" element={<Protected><TuberiasPiezaDetail /></Protected>} />
      <Route path="/tuberias/:modeloKey/:cap/:subcKey/:docId/tiempos" element={<Protected><TuberiasCronometro /></Protected>} />

      <Route path="/externo/modelos" element={<Protected><ExternoModelos /></Protected>} />
      <Route path="/externo/modelos/:modeloName" element={<Protected><ExternoCapacidades /></Protected>} />
      <Route path="/externo/modelos/:modeloName/:modeloId" element={<Protected><ExternoSubconjuntos /></Protected>} />
      <Route path="/externo/modelos/:modeloName/:modeloId/:codigo" element={<Protected><ExternoSubconjuntoDetail /></Protected>} />
      <Route path="/externo/piezas/:soldaduraModeloId/:modelo/:cap/:matchField/:matchValue" element={<Protected><ExternoPiezas /></Protected>} />
      <Route path="/externo/visualizadores" element={<Protected><ExternoVisualizadores /></Protected>} />

      <Route path="/calidad" element={<Protected><CalidadHome /></Protected>} />
      <Route path="/calidad/tuberia" element={<Protected><CalidadAuditorias /></Protected>} />
      <Route path="/calidad/soldadura" element={<Protected><CalidadChecklistSoldadura /></Protected>} />
      <Route path="/calidad/producto-terminado" element={<Protected><CalidadChecklistProductoTerminado /></Protected>} />

      <Route path="/avisos" element={<Protected><AvisosList /></Protected>} />
      <Route path="/avisos/:avisoId" element={<Protected><AvisoDetail /></Protected>} />

      <Route path="/tablero" element={<Protected><Tablero /></Protected>} />
      <Route path="/instrucciones" element={<Protected><Instrucciones /></Protected>} />
      <Route path="/admin/usuarios" element={<Protected><GestionUsuarios /></Protected>} />
      <Route path="/admin/operarios" element={<Protected><GestionOperarios /></Protected>} />
      <Route path="/admin/visualizadores" element={<Protected><GestionVisualizadores /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  )
}
