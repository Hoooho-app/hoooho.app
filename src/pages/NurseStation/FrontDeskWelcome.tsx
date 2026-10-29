import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDailyKnowledge } from '../../features/allergy-knowledge/useDailyKnowledge'
import { useAppStore } from '../../store/useAppStore'
import { NurseStationIdleVideo } from '../HealthEvents/NurseStationIdleVideo'
import { useSettingsStore } from '../../store/useSettingsStore'
import { frontDeskGreeting } from './frontDeskGreeting'
import careRecordingImage from '../../assets/nurse-triage/care-recording-20261029.webp'
import './frontDeskWelcome.css'

export function FrontDeskWelcome(_props:{memberName:string;gender?:string}) {
  const navigate=useNavigate()
  const accountId=useAppStore(state=>state.authUser?.id??'guest')
  const knowledge=useDailyKnowledge(accountId,true)
  const care=useSettingsStore(state=>state.care)
  const root=useRef<HTMLDivElement>(null)
  const [inView,setInView]=useState(true)
  const [active,setActive]=useState(!document.hidden),[reduced,setReduced]=useState(false)
  useEffect(()=>{
    const query=matchMedia('(prefers-reduced-motion: reduce)')
    const motion=()=>setReduced(query.matches),visibility=()=>setActive(!document.hidden)
    motion();query.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility)
    return()=>{query.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility)}
  },[])
  useEffect(()=>{
    const observer=new IntersectionObserver(entries=>setInView(entries.some(entry=>entry.isIntersecting)))
    if(root.current)observer.observe(root.current)
    return()=>observer.disconnect()
  },[])
  return <section ref={root} className="front-desk-welcome front-desk-welcome--editorial" aria-label="记录介绍">
    <div className="front-desk-welcome__hero">
      <div className="front-desk-welcome__copy"><h2>今天怎么样？</h2><p>{frontDeskGreeting().split('。').filter(Boolean).map(sentence=><span key={sentence}>{sentence}。</span>)}</p></div>
      <div className="front-desk-welcome__media"><NurseStationIdleVideo active={active&&inView} reducedMotion={reduced||(care.enabled&&care.reduceMotion)} cutout/></div>
    </div>
    <div className="front-desk-welcome__entries">
      <button type="button" className="front-desk-welcome__entry front-desk-welcome__guide" onClick={()=>navigate('/help')} aria-label="怎么用护护：边照顾，边记录">
        <span className="front-desk-welcome__eyebrow">怎么用护护</span>
        <strong>边照顾，<br/>边记录。</strong>
        <img src={careRecordingImage} alt="妈妈一手照顾发烧的女儿，一手拿手机记录" width={520} height={488} decoding="async"/>
      </button>
      {knowledge&&<button type="button" className="front-desk-welcome__entry front-desk-welcome__knowledge" onClick={()=>navigate(`/allergy-knowledge/${knowledge.id}`,{state:{fromNurseStation:true}})} aria-label={`每日小知识：${knowledge.title}`}>
        <span className="front-desk-welcome__eyebrow">每日小知识</span>
        <strong>{knowledge.title}</strong>
        <span className="front-desk-welcome__excerpt">{knowledge.sections[0]?.paragraphs[0]}</span>
        <span className="front-desk-welcome__read">阅读全文</span>
      </button>}
    </div>
  </section>
}
