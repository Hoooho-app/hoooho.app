import { useEffect, useRef, useState } from 'react'
import { NurseStationIdleVideo } from '../HealthEvents/NurseStationIdleVideo'
import { useSettingsStore } from '../../store/useSettingsStore'
import { frontDeskGreeting } from './frontDeskGreeting'

export function FrontDeskWelcome(_props:{memberName:string;gender?:string}) {
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
  return <section ref={root} className="front-desk-welcome" aria-label="记录介绍">
    <div className="front-desk-welcome__copy"><h2>今天怎么样？</h2><p>{frontDeskGreeting()}</p></div>
    <div className="front-desk-welcome__media"><NurseStationIdleVideo active={active&&inView} reducedMotion={reduced||(care.enabled&&care.reduceMotion)} portable/></div>
  </section>
}
