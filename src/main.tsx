import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import './styles/index.css'

// Retire only the old new-content badge cache; existing records and drafts keep their stores.
try { localStorage.removeItem('hoooho-record-updates-v1') } catch { /* Storage restrictions must not prevent startup. */ }

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
