import { useEffect, useRef, useState } from 'react'
import { NurseStationIdleVideo } from '../HealthEvents/NurseStationIdleVideo'
import { useSettingsStore } from '../../store/useSettingsStore'
import { HohoButton } from '../../components/design-system'
import { recognitionActive, type RecognitionJob } from '../../features/ai-business/recognitionJobs'

export function FrontDeskProcessing({separate=false,job,onStop,disabled=false}:{separate?:boolean;job?:RecognitionJob;onStop?:()=>void;disabled?:boolean}) {
  const care = useSettingsStore(s => s.care)
  const [visible, setVisible] = useState(!document.hidden)
  const [reduced, setReduced] = useState(false)
  const started=useRef(Date.now())
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{
    if(!separate)return
    const timer=setInterval(()=>setNow(Date.now()),1000)
    return()=>clearInterval(timer)
  },[separate])
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    const visibility = () => setVisible(!document.hidden)
    update()
    query.addEventListener('change', update)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      query.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])
  if(separate){
    const elapsed=Math.max(0,Math.floor((now-(job&&recognitionActive(job)?Date.parse(job.processingStartedAt??job.createdAt):started.current))/1000))
    return <div className="front-desk-processing front-desk-processing--separate" aria-label="护士正在整理记录">
      <NurseStationIdleVideo active={visible} reducedMotion={false} portable/>
      <div className="front-desk-processing__copy"><strong role="status" aria-label="整理中">整理中<span className="front-desk-processing__dots" aria-hidden="true">...</span></strong><span aria-live="off">已等待 {elapsed} 秒</span></div>
      <HohoButton size="small" disabled={disabled||!recognitionActive(job)} onClick={onStop}>停止处理</HohoButton>
    </div>
  }
  return <div className="front-desk-processing" role="status" aria-label="护士正在整理记录">
    <NurseStationIdleVideo active={visible} reducedMotion={reduced || (care.enabled && care.reduceMotion)}/>
    <div><p>嗯，我了解了，我整理一下。</p><span>整理中</span></div>
  </div>
}
