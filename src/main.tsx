import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app/App'
import './styles/index.css'
import { initializeGuestDiagnostic, recordGuestDiagnostic } from './services/guestDiagnostics'

registerSW({ immediate: true })
if (initializeGuestDiagnostic()) void recordGuestDiagnostic('client_loaded')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
