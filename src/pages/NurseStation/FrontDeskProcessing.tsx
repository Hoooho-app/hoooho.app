import { useEffect, useState } from 'react'
import { NurseStationIdleVideo } from '../HealthEvents/NurseStationIdleVideo'
import { useSettingsStore } from '../../store/useSettingsStore'

/** The original station video accompanies real work, never simulated progress. */
export function FrontDeskProcessing() {
  const care=useSettingsStore(s=>s.care)
  const [visible,setVisible]=useState(!document.hidden),[reduced,setReduced]=useState(false)
  useEffect(()=>{
    const query=matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduced(query.matches),visibility=()=>setVisible(!document.hidden)
    update();query.addEventListener('change',update);document.addEventListener('visibilitychange',visibility)
    return()=>{query.removeEventListener('change',update);document.removeEventListener('visibilitychange',visibility)}
  },[])
  return <div className="front-desk-processing" aria-label="护士正在整理记录"><NurseStationIdleVideo active={visible} reducedMotion={reduced||(care.enabled&&care.reduceMotion)}/><span>我在整理，稍等一下。</span></div>
}
