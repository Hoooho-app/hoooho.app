import type {CaptureTurn} from './captureDraft'
import type {RecognitionJob} from './recognitionJobs'

/** A task existing is not an acknowledgement of this particular message. */
export function recognitionAcceptedInput(job:RecognitionJob,inputId:string){
  return job.state!=='discarded'&&Boolean(job.inputStates?.some(input=>input.id===inputId))
}

export function applyRecognitionReceipt(turns:CaptureTurn[]|undefined,job:RecognitionJob){
  return turns?.map(turn=>{
    const input=job.inputStates?.find(input=>input.id===turn.id)
    if(!input)return turn
    if(job.state==='discarded'&&turn.status!=='completed')return {...turn,status:'failed' as const,errorCode:'RECOGNITION_INPUT_CANCELLED',error:'这条输入已取消，原件仍保留；请选择新的资料继续。'}
    return {...turn,text:input.text,status:input.status}
  })
}

/** Caller must have a fresh server receipt and an idle local submission queue. */
export function recoverUnreceivedTurns(turns:CaptureTurn[]|undefined,job:RecognitionJob,restoredIds?:ReadonlySet<string>){
  if(!job.inputStates||['queued','running','publishing'].includes(job.state))return turns
  const accepted=new Set(job.inputStates.map(input=>input.id))
  let changed=false
  const next=turns?.map(turn=>{
    if(turn.role==='assistant'||restoredIds&&!restoredIds.has(turn.id)||!['pending','transcribing'].includes(turn.status??'')||accepted.has(turn.id))return turn
    changed=true
    return {...turn,status:'failed' as const,errorCode:'RECOGNITION_NOT_ACCEPTED',error:'这条内容尚未开始识别，原件仍保留，可以重试。'}
  })
  return changed?next:turns
}
