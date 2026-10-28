import {useState} from 'react'
import { Check } from 'lucide-react'
import {HohoButton} from '../../components/design-system'
import {localDateTimeValue,localDateTimeToIso} from '../../utils/healthOccurredAt'
import type {SmartRecordItem} from './smartRecordTypes'
import type {RecognitionJob} from './recognitionJobs'

export interface ContinuousCard {
  presentation?:{generated:boolean;canGenerate:boolean;processing:boolean;asking:boolean;partial:boolean;visitEligible:boolean}
  recognitionJob?:RecognitionJob;feedback?:{id:string;text:string}
  contextId:string;recordable?:boolean;sourceSignature:string;version:number;evidenceVersion:number;editRevision:number;title:string;text:string;raw:string;occurredAt:string;timePrecision?:string;items:SmartRecordItem[];hasOriginals:boolean
  saved:null|{sourceSignature:string;recordId:string;eventId:string;memberId:string;category:string;evidenceVersion:number;editRevision:number;at:string;available:boolean;profileEntries?:{sectionId:string;entryId:string}[]}
  checklist?:{text:string;version:number}|null
}
export interface ContinuousCardEdit {contextId:string;baseVersion:number;text:string;title:string;time:string;originalOccurredAt?:string}
export function ContinuousRecordCard({card,disabled,onEdit,onSave,onView,editDraft,onEditDraft}:{card:ContinuousCard;disabled:boolean;onEdit:(input:{text:string;title:string;occurredAt:string;expectedVersion:number})=>Promise<void>;onSave:()=>void;onView:()=>void;editDraft?:ContinuousCardEdit;onEditDraft:(draft:ContinuousCardEdit|undefined)=>void}){
  const draft=editDraft?.contextId===card.contextId?editDraft:undefined,editing=Boolean(draft)
  const text=draft?.text??card.text,title=draft?.title??card.title,time=draft?.time??localDateTimeValue(new Date(card.occurredAt))
  const [error,setError]=useState('')
  const patch=(value:Partial<ContinuousCardEdit>)=>onEditDraft({contextId:card.contextId,baseVersion:card.version,text,title,time,...draft,...value})
  const saved=Boolean(card.saved&&card.saved.sourceSignature===card.sourceSignature&&card.saved.evidenceVersion===card.evidenceVersion&&card.saved.editRevision===card.editRevision)
  async function commit(){try{setError('');const originalTime=draft?.originalOccurredAt??card.occurredAt;const occurredAt=time===localDateTimeValue(new Date(originalTime))?originalTime:localDateTimeToIso(time);if(!occurredAt)throw Error('请填写有效的发生时间');await onEdit({text,title,occurredAt,expectedVersion:draft?.baseVersion??card.version});onEditDraft(undefined)}catch(e){setError(e instanceof Error?e.message:'修改未完成，请重试')}}
  return <section className="front-desk-record-sheet continuous-record-card" aria-label="当前记录单">
    <header><span>记录单</span><HohoButton variant="text" size="small" disabled={disabled} onClick={()=>{onEditDraft(editing?undefined:{contextId:card.contextId,baseVersion:card.version,text:card.text,title:card.title,time:localDateTimeValue(new Date(card.occurredAt)),originalOccurredAt:card.occurredAt});setError('')}}>{editing?'取消':'编辑'}</HohoButton></header>
    {editing?<div className="continuous-record-editor"><label>标题<input disabled={disabled} value={title} maxLength={120} onChange={e=>patch({title:e.target.value})}/></label><label>记录内容<textarea disabled={disabled} value={text} maxLength={4900} rows={5} onChange={e=>patch({text:e.target.value})}/></label><label>发生时间<input disabled={disabled} type="datetime-local" value={time} max={localDateTimeValue()} onChange={e=>patch({time:e.target.value})}/></label><HohoButton disabled={disabled||!text.trim()} onClick={()=>void commit()}>完成修改</HohoButton></div>:<>{card.title!=='记录单'&&<h3>{card.title}</h3>}<p>{card.text||'附件记录'}</p><small>发生时间 {card.timePrecision==='unknown'?'未明确':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',...(card.timePrecision&&card.timePrecision!=='exact'?{}:{hour:'2-digit',minute:'2-digit',hour12:false})}).format(new Date(card.occurredAt))}</small>{saved&&<span className="front-desk-recorded" role="status" aria-label="记录已保存" data-record-id={card.saved?.recordId}><Check size={16} aria-hidden="true"/></span>}<HohoButton fullWidth disabled={disabled||!card.text.trim()&&!card.hasOriginals} onClick={saved?onView:onSave}>{saved?'查看记录':'保存记录'}</HohoButton></>}
    {error&&<p role="alert">{error}</p>}
  </section>
}
