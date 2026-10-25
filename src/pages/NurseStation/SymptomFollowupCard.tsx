import { useState } from 'react'
import { ChevronRight, ClipboardList, Stethoscope } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/common'
import { HealthCard, HohoButton } from '../../components/design-system'
import { OrganizeSheet } from '../../features/organize/OrganizeSheet'
import { useCases } from '../../features/case-continuity/useCases'
import { useAppStore } from '../../store/useAppStore'
import { activeSymptomFollowups, symptomPreview } from './symptomFollowup'

/** The existing symptom-follow-up module, using its existing member-scoped read. */
export function SymptomFollowupCard() {
  const {data,memberId,error,reload}=useCases(),navigate=useNavigate()
  const member=useAppStore(s=>s.members.find(m=>m.id===memberId))
  const [organizeOpen,setOrganizeOpen]=useState(false)
  const items=activeSymptomFollowups(data?.active??[],memberId),first=items[0]
  const preview=first?symptomPreview(first,data?.timezone):null
  if(!first)return null
  return <><HealthCard className="front-desk-followup" role="region" aria-label="症状跟进">
    <header><span className="front-desk-followup__icon"><Stethoscope size={20} aria-hidden="true"/></span><div><h2>症状跟进</h2>{member&&<span className="front-desk-followup__child"><Avatar name={member.name} src={member.avatar} size="sm"/>{member.name}</span>}</div>{data&&<span className="front-desk-followup__count">{items.length} 项</span>}</header>
    {first?<div className="front-desk-followup__preview"><strong>{first.followup.title}</strong>{preview?.description&&<p>{preview.description}</p>}{preview?.latest&&<time dateTime={first.followup.latestOccurredAt??undefined}>最近记录 · {preview.latest}</time>}</div>:!data&&!error?<p role="status">正在读取症状跟进…</p>:!data&&error?<div className="front-desk-followup__error"><p>症状跟进暂未加载</p><HohoButton variant="text" onClick={reload}>重新加载</HohoButton></div>:<p>还没有正在跟进的症状</p>}
    {data&&error&&<p className="front-desk-followup__error">本次更新未完成，显示上次内容。<HohoButton variant="text" onClick={reload}>重试</HohoButton></p>}
    <div className="front-desk-followup__actions"><HohoButton variant="secondary" onClick={()=>navigate('/cases')}>查看跟进<ChevronRight size={16} aria-hidden="true"/></HohoButton><HohoButton variant="text" onClick={()=>setOrganizeOpen(true)}><ClipboardList size={16} aria-hidden="true"/>一键整理</HohoButton></div>
  </HealthCard><OrganizeSheet open={organizeOpen} onClose={()=>setOrganizeOpen(false)}/></>
}
