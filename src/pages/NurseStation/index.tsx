import { useNavigate } from 'react-router-dom'
import { MainAppHeader } from '../../components/navigation'
import { SmartRecordWorkspace } from '../../features/ai-business/SmartRecordWorkspace'
import { useAppStore } from '../../store/useAppStore'
import { FrontDeskWelcome } from './FrontDeskWelcome'
import './conversationHome.css'
import { useLegacyReminderMigration } from './useLegacyReminderMigration'

export function NurseStationPage() {
  const navigate=useNavigate()
  const memberId=useAppStore(s=>s.currentMemberId)
  const members=useAppStore(s=>s.members)
  const accountId=useAppStore(s=>s.authUser?.id??'')
  const token=useAppStore(s=>s.authToken)??''
  useLegacyReminderMigration(accountId,memberId,token)
  const ready=Boolean(memberId&&members.some(m=>m.id===memberId))
  return <main className="app-shell nurse-station-page nurse-station-page--conversation">{ready?<SmartRecordWorkspace key={`${accountId}:${memberId}`} home page conversational memberId={memberId} token={token} onClose={()=>navigate('/nurse-station',{replace:true})}/>:<><MainAppHeader title="护护" conversation showInstallApp={false}/><div className="front-desk-empty"><FrontDeskWelcome empty/></div></>}</main>
}
