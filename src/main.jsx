import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registrarSW } from './registerSW'

// Check for new deploy every 5 min — reload if JS bundle hash changed
const CHECK_INTERVAL = 5 * 60 * 1000
let currentSrc = null

async function getMainSrc() {
  try {
    const res = await fetch('/', { cache: 'no-store' })
    const html = await res.text()
    const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/)
    return m ? m[1] : null
  } catch { return null }
}

getMainSrc().then(src => { currentSrc = src })

setInterval(async () => {
  const latest = await getMainSrc()
  if (latest && currentSrc && latest !== currentSrc) window.location.reload()
}, CHECK_INTERVAL)

createRoot(document.getElementById('root')).render(<App />)

registrarSW()
