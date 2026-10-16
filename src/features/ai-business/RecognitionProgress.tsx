import {useEffect,useState} from 'react'
import {HohoButton} from '../../components/design-system'
import {recognitionActive,type RecognitionJob} from './recognitionJobs'
const labels:Record<string,string>={uploading:'正在上传原件',converting:'录音已保留，正在准备转写',queued:'原件已收到，等待处理',transcribing:'正在把录音转成文字',responding:'正在理解这次内容',preparing:'正在读取资料',reading:'正在识别资料',organizing:'正在整理记录',publishing:'正在核对并保留整理结果',ready:'已整理，请核对关键内容',paused:'处理已暂停，原件和已完成步骤保留',failed:'这一步未完成',discarded:'这次处理已取消'}
/** This surface renders server checkpoints, never an invented percentage. */
export function RecognitionProgress({job,localStage,onCommand,commandBusy=false,children}:{job?:RecognitionJob|null;localStage?:string;onCommand?:(type:'pause'|'resume'|'retry'|'use_text')=>void;commandBusy?:boolean;children?:React.ReactNode}){
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{if(!recognitionActive(job)&&!localStage)return;const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer)},[job?.id,job?.state,localStage])
  const elapsed=job?Math.max(0,Math.floor((now-Date.parse(job.processingStartedAt??job.createdAt))/1000)):0,active=recognitionActive(job)
  return <div className="recognition-progress" data-testid="recognition-progress" data-stage={localStage||job?.stage} aria-busy={active||!!localStage}>
    <p role={job?.state==='failed'?'alert':'status'} aria-live="polite">{localStage?labels[localStage]:job?.state==='failed'?job.error?.message||labels.failed:labels[job?.stage??'queued']??'正在处理'}{!localStage&&job?.progress&&job.progress.total>0&&job.stage==='reading'?` · 已完成 ${job.progress.completed}/${job.progress.total} 页${job.progress.reused?'（已复用识别结果）':''}`:''}</p>
    {active&&elapsed>=8&&<p className="hoho-text-caption">{elapsed>=60?'已超过一分钟，仍在处理':'处理中'}{elapsed>=8?` · 已等待 ${elapsed} 秒`:''}{elapsed>=20?'。可以继续补充，或保存草稿后离开。':''}</p>}
    {onCommand&&active&&<HohoButton variant="text" disabled={commandBusy} onClick={()=>onCommand('pause')}>暂停处理</HohoButton>}
    {onCommand&&job?.state==='paused'&&<HohoButton variant="secondary" disabled={commandBusy} onClick={()=>onCommand('resume')}>继续处理</HohoButton>}
    {onCommand&&job?.state==='failed'&&<HohoButton variant="secondary" disabled={commandBusy} onClick={()=>onCommand('retry')}>重试这一步</HohoButton>}
    {!!job?.unresolvedInputs?.length&&<><p role="alert">有 {job.unresolvedInputs.length} 段录音尚未转写，原件仍保留。</p>{onCommand&&job.state==='needs_review'&&<><HohoButton variant="secondary" disabled={commandBusy} onClick={()=>onCommand('retry')}>重试未完成的转写</HohoButton><HohoButton variant="text" disabled={commandBusy} onClick={()=>onCommand('use_text')}>先核对已整理文字</HohoButton></>}</>}
    {children}
  </div>
}
