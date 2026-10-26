import { useEffect, useState } from 'react'
import frontDeskNurse from '../../assets/nurse-triage/front-desk-welcome-masked-20261025.webp'
import { HohoButton } from '../../components/design-system'
import { recognitionActive, type RecognitionJob } from '../../features/ai-business/recognitionJobs'

export function FrontDeskProcessing({separate=false,job,onStop,onManualReview,disabled=false,statusText='正在整理这段话'}:{separate?:boolean;job?:RecognitionJob;onStop?:()=>void;onManualReview?:()=>void;disabled?:boolean;statusText?:string}) {
  const [longWait,setLongWait]=useState(false)
  useEffect(()=>{setLongWait(false);const timer=setTimeout(()=>setLongWait(true),8000);return()=>clearTimeout(timer)},[job?.id])
  return <div className={`front-desk-processing front-desk-processing--compact${separate?' front-desk-processing--conversation':''}`} aria-label={statusText}>
    <img className="front-desk-processing__avatar" src={frontDeskNurse} alt="护护护士" width={40} height={40}/>
    <div className="front-desk-processing__copy"><span role="status">{statusText}</span>{longWait&&onManualReview&&<HohoButton variant="text" size="small" disabled={disabled} onClick={onManualReview}>手动核对</HohoButton>}</div>
    {onStop&&recognitionActive(job)&&<HohoButton variant="text" size="small" disabled={disabled} onClick={onStop}>停止整理</HohoButton>}
  </div>
}
