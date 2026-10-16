import {UpdateDot,useRecordUpdates} from '../../features/record-updates/RecordUpdates'
import { ChevronRight, HeartPulse, Scissors, ShieldPlus, Syringe, Upload, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HealthRecordSubjectHeader } from '../../components/health'
import { HohoButton } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { subscribeProfileSectionInvalidation } from '../../services/profileSectionStorage'
import { apiRequest } from '../../services/apiClient'
import { useAppStore } from '../../store/useAppStore'
import './healthProfileHome.css'
import { ProfileUploadBatch } from './ProfileUploadBatch'

const entries = [
  { id: 'allergy', title: '过敏史', icon: ShieldPlus },
  { id: 'chronic', title: '慢性病史', icon: HeartPulse },
  { id: 'family-history', title: '家族史', icon: UsersRound },
  { id: 'surgery', title: '手术史', icon: Scissors },
  { id: 'vaccination', title: '疫苗接种记录', icon: Syringe }
]

export function HealthProfilePage() {
  const updates=useRecordUpdates()
  const navigate = useNavigate()
  const { authToken: token, currentMemberId, members, authUser } = useAppStore()
  const member = members.find(item => item.id === currentMemberId) ?? null
  const [counts, setCounts] = useState<{memberId:string; values:Record<string,number>}>({memberId:'',values:{}})
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const refresh=()=>setRetry(value=>value+1)
    const unsubscribe=subscribeProfileSectionInvalidation(refresh)
    window.addEventListener('focus',refresh)
    return()=>{unsubscribe();window.removeEventListener('focus',refresh)}
  },[])
  useEffect(() => {
    const controller = new AbortController()
    setCounts({memberId:currentMemberId,values:{}})
    if (token && member) void Promise.allSettled(entries.map(async ({id})=>{
      const result=await apiRequest<{rows:unknown[];pendingAllergyRows?:unknown[]}>(`/api/members/${encodeURIComponent(currentMemberId)}/profile-list/${id}`,{token,signal:controller.signal})
      return [id,result.rows.length+(id==='allergy'?(result.pendingAllergyRows?.length??0):0)] as const
    })).then(results=>{
      if(!controller.signal.aborted)setCounts({memberId:currentMemberId,values:Object.fromEntries(results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]))})
    })
    return () => controller.abort()
  }, [token, currentMemberId, member?.id, authUser?.id, retry])

  return <main className="app-shell health-profile-overview"><MainAppHeader compact title="孩子档案" /><div className="page-content health-profile-home">
    <HealthRecordSubjectHeader className="health-profile-record-subject" member={member} action={<></>} />
    <nav className="health-profile-entries" aria-label="档案分类">{entries.map(({ id, title, icon: Icon }) => <button className="health-profile-entry" disabled={!member} key={id} onClick={() => navigate(`/health-profile/${id}`)} type="button">
      <span className="health-profile-entry__icon"><Icon aria-hidden="true" size={22} strokeWidth={1.7} /></span>
      <span className="health-profile-entry__text"><strong>{title}<UpdateDot show={updates.some(i=>i.destination==='profile'&&i.sectionId===id)}/></strong></span>{counts.memberId===currentMemberId&&counts.values[id]!=null&&<small className="health-profile-entry__count">{counts.values[id]?`${counts.values[id]}条`:'未记录'}</small>}<ChevronRight aria-hidden="true" size={19} strokeWidth={1.6} />
    </button>)}</nav>
    <ProfileUploadBatch key={authUser?.id??'guest'} member={member} token={token??''} onSaved={()=>setRetry(value=>value+1)} renderTrigger={trigger => <HohoButton className="health-profile-upload-action" fullWidth {...trigger}><Upload aria-hidden="true" size={20}/><span>上传资料</span></HohoButton>} />
  </div></main>
}
