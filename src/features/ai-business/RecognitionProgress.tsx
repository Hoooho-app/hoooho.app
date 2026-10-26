import {useEffect,useState} from 'react'
import {HohoButton} from '../../components/design-system'
import {recognitionActive,type RecognitionJob} from './recognitionJobs'
const labels:Record<string,string>={uploading:'正在上传原件',cancelling:'正在取消本次处理，原件仍保留',converting:'录音已保留，正在准备转写',queued:'原件已收到，等待处理',transcribing:'正在把录音转成文字',responding:'正在理解这次内容',preparing:'正在读取资料',reading:'正在识别资料',organizing:'正在整理记录',publishing:'正在核对并保留整理结果',ready:'处理完成',paused:'处理已暂停，原件和已完成步骤保留',failed:'这一步未完成',discarded:'这次处理已取消'}
/** This surface renders server checkpoints, never an invented percentage. */
export function RecognitionProgress({job,localStage,onCommand,commandBusy=false,overview=false,textAvailable=false,onEditText,onManualReview,onSaveOriginal,saveOriginalLabel='先保存原话',children}:{job?:RecognitionJob|null;localStage?:string;onCommand?:(type:'pause'|'resume'|'retry'|'use_text')=>void;commandBusy?:boolean;overview?:boolean;textAvailable?:boolean;onEditText?:()=>void;onManualReview?:()=>void;onSaveOriginal?:()=>void;saveOriginalLabel?:string;children?:React.ReactNode}){
  const [now,setNow]=useState(Date.now())
  useEffect(()=>{if(!recognitionActive(job)&&!localStage)return;const timer=setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(timer)},[job?.id,job?.state,localStage])
  const elapsed=job?Math.max(0,Math.floor((now-Date.parse(job.processingStartedAt??job.createdAt))/1000)):0,active=recognitionActive(job)
  const candidateCount=job?.review?.items.length??0
  const resultKind=(job as (RecognitionJob&{resultKind?:string})|undefined)?.resultKind??job?.frontDesk?.context.resultKind
  const hasNewCandidates=candidateCount>0&&!['conversation','no_change','transcription','saved'].includes(resultKind??'')
  const readyLabel=hasNewCandidates?'已整理，请核对关键内容':resultKind==='transcription'?'转写完成':job?.frontDesk?'已回应':'处理完成'
  const checkpointLabel=job?.state==='needs_review'||job?.stage==='partial'||resultKind==='partial'?(candidateCount?'部分内容已处理，请核对':'有内容需要核对'):job?.stage==='ready'?readyLabel:labels[job?.stage??'queued']??'正在处理'
  return <div className="recognition-progress" data-testid="recognition-progress" data-stage={localStage||job?.stage} aria-busy={active||!!localStage}>
    {overview&&job?.state==='failed'&&<><strong role="alert">这次还没整理完成</strong>{textAvailable&&<p>这段文字仍在本次对话中，尚未存入档案。</p>}{job.error?.message&&<p>{job.error.message}</p>}</>}
    {(!overview||job?.state!=='failed'&&!active&&!localStage)&&<p role={job?.state==='failed'?'alert':'status'} aria-live="polite">{localStage?(localStage==='ready'?readyLabel:labels[localStage]):job?.state==='failed'?job.error?.message||labels.failed:checkpointLabel}{!localStage&&job?.progress&&job.progress.total>0&&job.stage==='reading'?` · 已完成 ${job.progress.completed}/${job.progress.total} 页${job.progress.reused?'（已复用识别结果）':''}`:''}</p>}
    {(active&&elapsed>=8||onCommand&&active)&&<div className="recognition-meta">{active&&elapsed>=8&&<span role="status">处理时间较长</span>}{onCommand&&active&&<HohoButton variant="text" size="small" disabled={commandBusy} onClick={()=>onCommand('pause')}>{overview?'停止整理':'暂停处理'}</HohoButton>}</div>}
    {onCommand&&job?.state==='paused'&&<HohoButton variant="secondary" disabled={commandBusy} onClick={()=>onCommand('resume')}>继续处理</HohoButton>}
    {onCommand&&job?.state==='failed'&&<HohoButton variant={overview?'primary':'secondary'} disabled={commandBusy} onClick={()=>onCommand('retry')}>{overview?'重新整理':'重试这一步'}</HohoButton>}
    {overview&&job?.state==='failed'&&textAvailable&&<><HohoButton variant="secondary" disabled={commandBusy} onClick={onEditText}>编辑文字</HohoButton>{onManualReview&&<HohoButton variant="text" disabled={commandBusy} onClick={onManualReview}>手动核对</HohoButton>}</>}
    {overview&&['ready','failed','needs_review'].includes(job?.state??'')&&onSaveOriginal&&<HohoButton fullWidth={job?.state!=='ready'} variant={job?.state==='ready'?'text':'secondary'} size={job?.state==='ready'?'small':'medium'} disabled={commandBusy} onClick={onSaveOriginal}>{saveOriginalLabel}</HohoButton>}
    {!!job?.unresolvedInputs?.length&&<>{job.unresolvedInputs.map(input=><p role="alert" key={input.id}>{input.message}</p>)}{onCommand&&job.state==='needs_review'&&<><HohoButton variant="secondary" disabled={commandBusy} onClick={()=>onCommand('retry')}>重试未完成的项目</HohoButton>{candidateCount>0&&<HohoButton variant="text" disabled={commandBusy} onClick={()=>onCommand('use_text')}>先核对已整理文字</HohoButton>}</>}</>}
    {children}
  </div>
}
