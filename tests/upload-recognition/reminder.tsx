// Mount the actual shared consumer without enabling a frozen product route.
import React from 'react'
import {createRoot} from 'react-dom/client'
import {MedicationReminderFlow} from '../../src/pages/NurseStation/MedicationReminderFlow'
import {useAppStore} from '../../src/store/useAppStore'
import '../../src/styles/index.css'
useAppStore.setState({authToken:sessionStorage.getItem('hoooho-auth-token'),currentMemberId:'child-a'})
createRoot(document.getElementById('root')!).render(<React.StrictMode><MedicationReminderFlow memberName="合成孩子" onClose={()=>undefined} onSave={()=>undefined}/></React.StrictMode>)
