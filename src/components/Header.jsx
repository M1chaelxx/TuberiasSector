import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import logoUrl from '/logo.png'

export default function Header({ title, back, backState, actions }) {
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  return (
    <div className="header">
      {back
        ? <button className="back-btn" onClick={() => navigate(back, { state: backState })}>←</button>
        : <img src={logoUrl} alt="logo" style={{width:32,height:32,borderRadius:50,objectFit:'cover',flexShrink:0}} />
      }
      <h1>{title}</h1>
      {actions}
      {!back && (
        <button
          title={`${user?.display} — Cerrar sesión`}
          onClick={logout}
          style={{
            display:'flex',alignItems:'center',gap:5,
            background:'none',border:'1.5px solid rgba(255,255,255,0.6)',
            borderRadius:8,padding:'5px 10px',cursor:'pointer',
            color:'#fff',fontSize:13,fontWeight:600,flexShrink:0,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
          </svg>
          Salir
        </button>
      )}
    </div>
  )
}
