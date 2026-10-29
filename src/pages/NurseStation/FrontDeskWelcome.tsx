import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/useAppStore'
import { FrontDeskBanner } from './FrontDeskBanner'
import { FrontDeskCareCard } from './FrontDeskCareCard'
import careRecordingImage from '../../assets/nurse-triage/care-recording-20261029.webp'
import './frontDeskWelcome.css'

export function FrontDeskWelcome(_props:{memberName:string;gender?:string}) {
  const navigate=useNavigate()
  const accountId=useAppStore(state=>state.authUser?.id??'guest')
  return <section className="front-desk-welcome front-desk-welcome--editorial" aria-label="记录介绍">
    <FrontDeskBanner/>
    <div className="front-desk-welcome__entries">
      <button type="button" className="front-desk-welcome__entry front-desk-welcome__guide" onClick={()=>navigate('/help')} aria-label="怎么用护护：边照顾，边记录">
        <span className="front-desk-welcome__eyebrow">怎么用护护</span>
        <strong>边照顾，边记录</strong>
        <img src={careRecordingImage} alt="妈妈一手照顾发烧的女儿，一手拿手机记录" width={520} height={488} decoding="async"/>
      </button>
      <FrontDeskCareCard key={accountId}/>
    </div>
  </section>
}
