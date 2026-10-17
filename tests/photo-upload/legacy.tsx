import React from 'react'
import { createRoot } from 'react-dom/client'
import { VaccinationRecordFlow } from '../../src/pages/HealthEvents/VaccinationRecordFlow'
import '../../src/styles/index.css'
import '../../src/pages/HealthEvents/RecordForm.css'

const today = new Date().toISOString().slice(0, 10)
createRoot(document.getElementById('root')!).render(<React.StrictMode>
  <VaccinationRecordFlow memberId="child-a" token={sessionStorage.getItem('hoooho-auth-token')!} selectedDay={today} today={today} onBack={() => undefined} onClose={() => undefined} onSaved={() => undefined} onConfirm={async () => 'test-only'} />
</React.StrictMode>)
