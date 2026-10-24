import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { SmartRecordWorkspace } from '../../features/ai-business/SmartRecordWorkspace'
import { useAppStore } from '../../store/useAppStore'
import { FirstChildSetup } from './FirstChildSetup'
import { getChildMembers } from '../../features/family/currentChild'
import './conversationHome.css'
import { useLegacyReminderMigration } from './useLegacyReminderMigration'

export function NurseStationPage() {
  const navigate=useNavigate()
  const memberId=useAppStore(s=>s.currentMemberId)
  const members=useAppStore(s=>s.members)
  const accountId=useAppStore(s=>s.authUser?.id??'')
  const token=useAppStore(s=>s.authToken)??''
  useLegacyReminderMigration(accountId,memberId,token)
  const children=getChildMembers(members),member=children.find(m=>m.id===memberId)??children[0]
  useEffect(()=>{if(member&&member.id!==memberId)useAppStore.getState().setCurrentMemberId(member.id)},[member?.id,memberId])
  return <main className="app-shell nurse-station-page nurse-station-page--conversation">{member?<SmartRecordWorkspace key={`${accountId}:${member.id}`} home page conversational memberId={member.id} token={token} onClose={()=>navigate('/nurse-station',{replace:true})}/>:<FirstChildSetup key={accountId} accountId={accountId} token={token}/>}</main>
}
