import { Component } from 'react'

// Red de seguridad: un error de render en cualquier pantalla dejaba la app
// entera en blanco, sin ningún mensaje (ej: V223 lo vivió con un bug de
// hooks). React solo puede atrapar estos errores con un componente de
// clase — no hay equivalente con hooks.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Error de render atrapado por ErrorBoundary:', error, info)
  }

  handleReload = () => {
    window.location.hash = '#/'
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Algo salió mal</h2>
          <p style={{ color: '#666', fontSize: 14, marginBottom: 24, maxWidth: 320 }}>
            La pantalla tuvo un error inesperado. Probá volver al inicio — tus datos ya guardados no se pierden.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              background: '#1a73e8', color: '#fff', border: 'none', borderRadius: 8,
              padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Volver al inicio
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
