import {RecordNarrative} from './RecordNarrative'
import {maskIdentityName} from '../../utils/privateIdentity'
import {useState} from 'react'
import { Check } from '../../components/icons'
import {HohoButton} from '../../components/design-system'
import {localDateTimeValue,localDateTimeToIso} from '../../utils/healthOccurredAt'
import type {SmartRecordItem} from './smartRecordTypes'
import type {RecognitionJob} from './recognitionJobs'
import {UploadRecognitionPreview,type UploadRecognitionDraft,type UploadFirstReading} from './UploadRecognitionPreview'

export interface ContinuousCard {
  pendingSave?:'subject'
  informationProgress?:{key:string;label:string;state:'answered'|'uncertain'|'missing'}[]
  recognitionPreview?:UploadRecognitionDraft|null
  uploadReading?:UploadFirstReading|null
  presentation?:{generated:boolean;canGenerate:boolean;processing:boolean;asking:boolean;partial:boolean;visitEligible:boolean}
  recognitionJob?:RecognitionJob;feedback?:{id:string;text:string}
  timeDefaulted?:boolean
  contextId:string;recordable?:boolean;sourceSignature:string;version:number;evidenceVersion:number;editRevision:number;title:string;text:string;raw:string;occurredAt:string;timePrecision?:string;items:SmartRecordItem[];hasOriginals:boolean
  saved:null|{sourceSignature:string;recordId:string;eventId:string;memberId:string;category:string;evidenceVersion:number;editRevision:number;at:string;available:boolean;profileEntries?:{sectionId:string;entryId:string}[]}
  checklist?:{text:string;version:number}|null
}
export interface ContinuousCardEdit {contextId:string;baseVersion:number;text:string;title:string;time:string;originalOccurredAt?:string;recognitionDraft?:{id:string;version:number}}
export function ContinuousRecordCard({card,disabled,onEdit,onSave,onView,editDraft,onEditDraft,onConfirmSubject,memberName}:{card:ContinuousCard;onConfirmSubject?:()=>void;memberName?:string;disabled:boolean;onEdit:(input:{text:string;title:string;occurredAt:string;expectedVersion:number;recognitionDraft?:{id:string;version:number}})=>Promise<void>;onSave:()=>void;onView:()=>void;editDraft?:ContinuousCardEdit;onEditDraft:(draft:ContinuousCardEdit|undefined)=>void}){
  const draft=editDraft?.contextId===card.contextId?editDraft:undefined,editing=Boolean(draft)
  const text=draft?.text??card.text,title=draft?.title??card.title,time=draft?.time??localDateTimeValue(new Date(card.occurredAt))
  const [error,setError]=useState('')
  const recognition=card.recognitionPreview
  const reviewRecognition=()=>{
    if(!recognition?.canAdopt||disabled)return
    const reviewed=[card.text.trim(),recognition.text].filter(Boolean).join('\n\n')
    if(reviewed.length>4900){setError('合并后内容较长，请先精简记录正文，再核对识别内容');return}
    onEditDraft({contextId:card.contextId,baseVersion:card.version,text:reviewed,title:card.title,time:localDateTimeValue(new Date(card.occurredAt)),originalOccurredAt:card.occurredAt,recognitionDraft:{id:recognition.draftId,version:recognition.draftVersion}});setError('')
  }
  const patch=(value:Partial<ContinuousCardEdit>)=>onEditDraft({contextId:card.contextId,baseVersion:card.version,text,title,time,...draft,...value})
  const saved=Boolean(card.saved?.available&&card.saved.sourceSignature===card.sourceSignature&&card.saved.evidenceVersion===card.evidenceVersion&&card.saved.editRevision===card.editRevision)
  const preview=recognition??(!saved?card.uploadReading:null)
  async function commit(){try{setError('');const originalTime=draft?.originalOccurredAt??card.occurredAt;const occurredAt=time===localDateTimeValue(new Date(originalTime))?originalTime:localDateTimeToIso(time);if(!occurredAt)throw Error('请填写有效的发生时间');await onEdit({text,title,occurredAt,expectedVersion:draft?.baseVersion??card.version,...(draft?.recognitionDraft?{recognitionDraft:draft.recognitionDraft}:{})});onEditDraft(undefined)}catch(e){setError(e instanceof Error?e.message:'修改未完成，请重试')}}
  return <section className="front-desk-record-sheet continuous-record-card" aria-label="当前记录单">
    <header><span>记录单</span><HohoButton variant="text" size="small" disabled={disabled} onClick={()=>{onEditDraft(editing?undefined:{contextId:card.contextId,baseVersion:card.version,text:card.text,title:card.title,time:localDateTimeValue(new Date(card.occurredAt)),originalOccurredAt:card.occurredAt});setError('')}}>{editing?'取消':'编辑'}</HohoButton></header>
    {!editing&&preview&&<UploadRecognitionPreview draft={preview} disabled={disabled} onReview={reviewRecognition} onConfirmSubject={onConfirmSubject} memberName={memberName}/>}
    {editing?<div className="continuous-record-editor"><label>标题<input disabled={disabled} value={title} maxLength={120} onChange={e=>patch({title:e.target.value})}/></label><label>记录内容<textarea disabled={disabled} value={text} maxLength={4900} rows={5} onChange={e=>patch({text:e.target.value})}/></label><label>发生时间<input disabled={disabled} type="datetime-local" value={time} max={localDateTimeValue()} onChange={e=>patch({time:e.target.value})}/></label><HohoButton loading={disabled} disabled={!text.trim()} onClick={()=>void commit()}>保存修改</HohoButton></div>:<><div className="symptom-record-detail"><RecordNarrative text={card.text} compact/></div><details className="record-reading__detail"><summary>原始资料</summary><p className="symptom-record-original">{card.raw||'原始附件已保留'}</p></details><details className="record-reading__detail"><summary>记录信息</summary><small>{card.timeDefaulted?'首次描述时间':'发生时间'} {card.timePrecision==='unknown'?'未明确':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',...(card.timePrecision&&card.timePrecision!=='exact'?{}:{hour:'2-digit',minute:'2-digit',hour12:false})}).format(new Date(card.occurredAt))}</small></details>{saved?<div className="front-desk-record-status"><span className="front-desk-recorded" role="status" aria-label="记录已保存" data-record-id={card.saved?.recordId}><Check size={16} aria-hidden="true"/>{recognition||card.uploadReading&&!card.items.length?'原话和附件已保存 · 识别内容待核对':'已保存'}</span><HohoButton variant="text" size="small" disabled={disabled} onClick={onView}>查看记录</HohoButton></div>:card.pendingSave==='subject'?<div><p role="status">待核对记录对象，核对后保存</p>{!recognition?.canConfirmSubject&&onConfirmSubject&&<HohoButton variant="secondary" disabled={disabled} onClick={onConfirmSubject}>这是{maskIdentityName(memberName)||'当前孩子'}的{card.hasOriginals?'资料':'记录'}</HohoButton>}</div>:<HohoButton fullWidth loading={disabled} disabled={!card.text.trim()&&!card.hasOriginals} onClick={onSave}>{recognition?'仅保存原话和附件':'重试保存'}</HohoButton>}</>}
    {error&&<p role="alert">{error}</p>}
  </section>
}
