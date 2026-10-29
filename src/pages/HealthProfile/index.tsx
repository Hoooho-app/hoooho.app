import { Baby, ChevronRight, HeartPulse, TrendingUp, ScanLine, Scissors, ShieldPlus, Syringe, UsersRound } from '../../components/icons'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HohoSection } from '../../components/design-system'
import { MainAppHeader } from '../../components/navigation'
import { subscribeProfileSectionInvalidation } from '../../services/profileSectionStorage'
import { apiRequest } from '../../services/apiClient'
import { useAppStore } from '../../store/useAppStore'
import './healthProfileHome.css'

const sections = [
  { id: 'basic', title: '基本资料', entries: [
    { id: 'identity', title: '身份与出生背景', icon: Baby, path: '/health-profile/identity' },
    { id: 'growth', title: '生长记录', icon: TrendingUp, path: '/health-profile/basic' }
  ] },
  { id: 'history', title: '健康史', entries: [
    { id: 'allergy', title: '过敏史', icon: ShieldPlus, path: '/health-profile/allergy' },
    { id: 'chronic', title: '慢性病史', icon: HeartPulse, path: '/health-profile/chronic' },
    { id: 'family-history', title: '家族史', icon: UsersRound, path: '/health-profile/family-history' },
    { id: 'surgery', title: '手术史', icon: Scissors, path: '/health-profile/surgery' }
  ] },
  { id: 'care', title: '儿童保健', entries: [
    { id: 'checkups', title: '儿保与筛查', icon: ScanLine, path: '/health-profile/checkups' },
    { id: 'vaccination', title: '疫苗接种记录', icon: Syringe, path: '/health-profile/vaccination' }
  ] }
]
const entries = sections.flatMap(section => section.entries)

export function HealthProfilePage() {
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
    if (token && member) void Promise.allSettled(entries.filter(e=>!['identity','growth','checkups'].includes(e.id)).map(async ({id})=>{
      const result=await apiRequest<{rows:unknown[];pendingAllergyRows?:unknown[]}>(`/api/members/${encodeURIComponent(currentMemberId)}/profile-list/${id}`,{token,signal:controller.signal})
      return [id,result.rows.length+(id==='allergy'?(result.pendingAllergyRows?.length??0):0)] as const
    })).then(results=>{
      if(!controller.signal.aborted)setCounts({memberId:currentMemberId,values:Object.fromEntries(results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]))})
    })
    return () => controller.abort()
  }, [token, currentMemberId, member?.id, authUser?.id, retry])

  return <main className="app-shell health-profile-overview">
    <MainAppHeader childIdentity title="孩子档案" />
    <nav className="page-content health-profile-home" aria-label="档案分类">{sections.map(section => <HohoSection className="health-profile-group" title={section.title} aria-label={section.title} key={section.id}>
    <div className="health-profile-entries" data-hoho-surface="light">{section.entries.map(({ id, title, icon: Icon, path }) => <button className="health-profile-entry" disabled={!member} key={id} onClick={() => navigate(path)} type="button">
      <span className="health-profile-entry__icon"><Icon aria-hidden="true" size={22} strokeWidth={1.7} /></span>
      <span className="health-profile-entry__text"><strong>{title}</strong></span>{counts.memberId===currentMemberId&&counts.values[id]!=null&&<small className="health-profile-entry__count">{counts.values[id]?`${counts.values[id]}条`:'未记录'}</small>}<ChevronRight aria-hidden="true" size={19} strokeWidth={1.6} />
    </button>)}</div></HohoSection>)}</nav>
  </main>
}
