import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { SmartRecordWorkspace } from '../../features/ai-business/SmartRecordWorkspace'
import { useAppStore } from '../../store/useAppStore'
import { FirstChildSetup } from './FirstChildSetup'
import { getChildMembers } from '../../features/family/currentChild'
import './conversationHome.css'
import { useLegacyReminderMigration } from './useLegacyReminderMigration'

export function NurseStationPage() {
  const navigate=useNavigate(),location=useLocation()
  const memberId=useAppStore(s=>s.currentMemberId)
  const members=useAppStore(s=>s.members)
  const accountId=useAppStore(s=>s.authUser?.id??'')
  const token=useAppStore(s=>s.authToken)??''
  useLegacyReminderMigration(accountId,memberId,token)
  const children=getChildMembers(members),member=children.find(m=>m.id===memberId)??children[0]
  useEffect(()=>{if(member&&member.id!==memberId)useAppStore.getState().setCurrentMemberId(member.id)},[member?.id,memberId])
  const query=new URLSearchParams(location.search),owner=location.state?.conversationOwner
  const allowed=!owner||owner.accountId===accountId&&owner.memberId===member?.id
  const historyTarget=allowed&&(query.get('conversation')||query.get('draft'))?{contextId:query.get('conversation')||undefined,draftKey:query.get('draft')||undefined}:undefined
  const selection=historyTarget?JSON.stringify(historyTarget):''
  useEffect(()=>{
    if(!member||!historyTarget&&!owner)return
    if(historyTarget&&!owner)navigate(location.pathname+location.search,{replace:true,state:{...location.state,conversationOwner:{accountId,memberId:member.id}}})
    else if(owner&&!allowed&&(query.has('conversation')||query.has('draft')))navigate('/nurse-station',{replace:true})
  },[accountId,member?.id,location.key])
  return <main className="app-shell nurse-station-page nurse-station-page--conversation">{member?<SmartRecordWorkspace key={`${accountId}:${member.id}:${selection}`} historyTarget={historyTarget} home page conversational memberId={member.id} token={token} onClose={()=>navigate('/nurse-station',{replace:true})}/>:<FirstChildSetup key={accountId} accountId={accountId} token={token}/>}</main>
}
