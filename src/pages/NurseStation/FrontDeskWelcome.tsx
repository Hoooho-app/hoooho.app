import { History } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HohoButton } from '../../components/design-system'
import { ReceptionSurface } from '../../components/design-system/ReceptionSurface'
import { NurseStationIdleVideo } from '../HealthEvents/NurseStationIdleVideo'
import { useSettingsStore } from '../../store/useSettingsStore'
import { SymptomFollowupCard } from './SymptomFollowupCard'

export function FrontDeskWelcome({ empty = false }: { empty?: boolean }) {
  const navigate=useNavigate(),care=useSettingsStore(s=>s.care)
  const media=useRef<HTMLDivElement>(null)
  const [visible,setVisible]=useState(true),[reduced,setReduced]=useState(false)
  useEffect(()=>{
    if(empty)return
    const query=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(query.matches)
    update();query.addEventListener('change',update)
    const element=media.current,observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting&&!document.hidden))
    if(element)observer.observe(element)
    const hidden=()=>{const rect=element?.getBoundingClientRect();setVisible(!document.hidden&&Boolean(rect&&rect.bottom>0&&rect.top<innerHeight))}
    document.addEventListener('visibilitychange',hidden)
    return()=>{observer.disconnect();query.removeEventListener('change',update);document.removeEventListener('visibilitychange',hidden)}
  },[empty])
  return <div className={`front-desk-welcome${empty?' front-desk-welcome--empty':''}`}>
    <ReceptionSurface media={empty?<img className="front-desk-welcome__image" src="/images/child-record-folder.2ea5d601b7.webp" alt="孩子照片、资料夹与日常记录卡" width={384} height={256} loading="eager" fetchPriority="high" decoding="async"/>:<div ref={media} className="front-desk-welcome__video"><NurseStationIdleVideo active={visible} reducedMotion={reduced||(care.enabled&&care.reduceMotion)}/></div>} title={<>孩子的情况，<br/>慢慢说，我来记。</>} description="记清楚，也方便交给需要的人。"/>
    {empty?<HohoButton size="large" fullWidth onClick={()=>navigate('/family/new',{state:{firstUseEntry:{continueToRecord:false,returnTo:'/nurse-station'}}})}>添加孩子信息</HohoButton>:<><SymptomFollowupCard/><HohoButton className="front-desk-history-link" variant="text" onClick={()=>navigate('/conversation-history')}><History size={17} aria-hidden="true"/>查看之前的对话</HohoButton></>}
  </div>
}
