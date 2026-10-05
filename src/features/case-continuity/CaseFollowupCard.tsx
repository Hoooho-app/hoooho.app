import { useCallback, useEffect, useRef, useState } from 'react'
import { HohoButton } from '../../components/design-system'
import { healthEventRecordService } from '../../services/healthEventRecords'
import { useAppStore } from '../../store/useAppStore'
import type { HealthEventRecordApiDto } from '../../types'
import { RecordOriginals } from '../ai-business/RecordOriginals'
import { SymptomCaseRecord } from './SymptomCaseRecord'
import { MaterialReturnForm } from './MaterialReturnPage'
import type { FollowedCase } from './types'
import { caseService } from './api'

const timeKnown = (r: HealthEventRecordApiDto) => !r.caseContext?.timeUnknown && r.journal?.timePrecision !== 'unknown' && Number.isFinite(Date.parse(r.occurredAt))
export const chronologicalRecords = (records: HealthEventRecordApiDto[]) => [...records].sort((a,b) => Number(timeKnown(b)) - Number(timeKnown(a)) || (timeKnown(a) && timeKnown(b) ? a.occurredAt.localeCompare(b.occurredAt) : 0) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
const dateText = (value: string | null | undefined, timezone: string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', {timeZone:timezone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,year:'numeric'}).format(new Date(value)) : '未提供'

export function CaseFollowupCard({item, memberId, token, timezone, reload, onDirty, onStatus}: {item:FollowedCase;memberId:string;token:string;timezone:string;reload:()=>void;onDirty:(id:string,dirty:boolean)=>void;onStatus:(id:string,requestId:string,archivedAt:string|null,recovered:boolean)=>void}) {
  const accountId = useAppStore(s => s.authUser?.id ?? '')
  const [expanded,setExpanded] = useState(false), [form,setForm] = useState<'record'|'materials'|null>(null)
  const [materialRecordId,setMaterialRecordId]=useState<string|null>(null)
  const [records,setRecords] = useState<HealthEventRecordApiDto[]|null>(null), [error,setError] = useState(''), [version,setVersion] = useState(0)
  const [busy,setBusy] = useState(false), [failure,setFailure] = useState(''), [notice,setNotice] = useState('')
  const pending = useRef(false), dirty = useRef(false), recordDirty = useRef(false), materialDirty = useRef(false)
  const statusRequest = useRef<{archivedAt:string|null;id:string}|null>(null)
  const id = item.event.id, archived = Boolean(item.event.caseArchivedAt), knownRecovery = item.event.caseArchiveReason === 'user_recovered' || item.event.status==='recovered'&&Boolean(item.event.recoveredAt)
  const setRecordDirty = useCallback((value:boolean) => { recordDirty.current=value;dirty.current=value||materialDirty.current;onDirty(id,dirty.current) },[id,onDirty])
  const setMaterialDirty = useCallback((value:boolean) => { materialDirty.current=value;dirty.current=value||recordDirty.current;onDirty(id,dirty.current) },[id,onDirty])
  useEffect(() => () => onDirty(id,false),[id,onDirty])
  useEffect(() => {
    if (!expanded) return
    const c=new AbortController();setError('')
    void healthEventRecordService.list(id,token,c.signal).then(data=>{if(!c.signal.aborted)setRecords(chronologicalRecords(data))}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'过程记录未能加载')})
    return()=>c.abort()
  },[id,token,memberId,expanded,version,item.changedAt])
  const saved = () => { setExpanded(true);setVersion(v=>v+1);setNotice('已保存到这次情况');reload() }
  const open = (next:'record'|'materials') => { if (form && form!==next && dirty.current && !window.confirm('当前内容尚未保存，切换后保留设备草稿，确定切换吗？')) return;setForm(next);setFailure('') }
  async function changeStatus() {
    if(pending.current)return
    if(dirty.current&&!window.confirm('当前内容尚未保存，改变状态后保留设备草稿，确定继续吗？'))return
    pending.current=true;setBusy(true);setFailure('')
    const currentArchivedAt=item.event.caseArchivedAt??null
    if(!statusRequest.current||statusRequest.current.archivedAt!==currentArchivedAt)statusRequest.current={archivedAt:currentArchivedAt,id:crypto.randomUUID()}
    const requestId=statusRequest.current.id
    try { const event=await caseService.recovery(memberId,token,id,{action:archived?'restore':'recover',requestId,expectedArchivedAt:item.event.caseArchivedAt??null});setForm(null);onStatus(id,requestId,event.caseArchivedAt??null,!archived);reload() }
    catch(e){setFailure(e instanceof Error?e.message:'状态未保存，请重试')}
    finally{pending.current=false;setBusy(false)}
  }
  const view=item.followup
  return <article className="continuity-card case-followup-card" data-case-id={id} aria-label={view.title}>
    <div className="case-followup-card-header">
      <h2>{view.title}</h2>
      <div className="case-followup-state-action"><HohoButton variant="secondary" size="small" disabled={busy} loading={busy} onClick={()=>void changeStatus()}>{archived?'恢复跟进':'标记已康复'}</HohoButton></div>
    </div>
    {view.supplement&&<p className="case-followup-supplement">{view.supplement}</p>}
    <p className="case-followup-time">开始：{dateText(view.firstOccurredAt,timezone)}<br/>最近记录：{dateText(view.latestOccurredAt,timezone)}{view.hasUnknownTime&&<span>含发生时间未提供的记录</span>}</p>
    {archived&&<p className="case-followup-time">{knownRecovery ? `${item.event.caseArchiveReason==='user_recovered'?'用户标记康复':'已记录康复'}：${dateText(item.event.caseRecoveryMarkedAt||item.event.recoveredAt,timezone)}` : <><span className="case-legacy-archive">历史归档</span>归档时间：{dateText(item.event.caseArchivedAt,timezone)}<span>未记录康复原因，不代表已确认康复</span></>}</p>}
    <div className="case-followup-toggle"><strong>过程记录 · {view.recordCount}条</strong><HohoButton variant="text" aria-expanded={expanded} aria-controls={`case-timeline-${id}`} onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'展开'}</HohoButton></div>
    {expanded&&<div id={`case-timeline-${id}`} className="case-followup-timeline">
      {error?<p role="alert">{error}<HohoButton variant="secondary" onClick={()=>setVersion(v=>v+1)}>重试加载过程记录</HohoButton></p>:!records?<p role="status">正在加载过程记录…</p>:!records.length?<p>暂无过程记录</p>:<ol>{records.map(record=><li key={record.id} data-record-id={record.id}>
        <time dateTime={timeKnown(record)?record.occurredAt:undefined}>{timeKnown(record)?dateText(record.occurredAt,timezone):'发生时间未提供'}</time>
        <RecordText text={record.content}/>
        {(record.sourceText||record.caseContext?.originalText)&& (record.sourceText||record.caseContext?.originalText)!==record.content && <details><summary>查看完整原文</summary><p className="continuity-source">{record.caseContext?.originalText||record.sourceText}</p></details>}
        {record.caseContext?.supplement&&<p className="continuity-source">{record.caseContext.supplement}</p>}
        <RecordOriginals eventId={id} recordId={record.id} attachmentIds={record.caseContext?.attachmentIds??record.aiProvenance?.attachmentIds??[]}/>
        {!archived&&record.caseContext&&record.caseContext.identity!=='parent'&&<HohoButton variant="text" onClick={()=>{if(!dirty.current||window.confirm('当前内容尚未保存，切换后保留设备草稿，确定继续吗？')){setMaterialRecordId(record.id);setForm('materials')}}}>核对这份资料</HohoButton>}
      </li>)}</ol>}
    </div>}
    {!archived&&<><div className="case-followup-primary-actions"><HohoButton disabled={busy} onClick={()=>open('record')}>继续记录</HohoButton></div>
      {form==='record'&&<SymptomCaseRecord embedded accountId={accountId} memberId={memberId} token={token} eventId={id} onDirtyChange={setRecordDirty} onClose={()=>setForm(null)} onCaptured={()=>{setForm(null);saved()}}/>}
      {form==='materials'&&<MaterialReturnForm key={materialRecordId??'new'} initialRecordId={materialRecordId} embedded eventId={id} onDirtyChange={setMaterialDirty} onClose={()=>setForm(null)} onSaved={saved}/>}</>}
    {failure&&<p role="alert">{failure}</p>}{notice&&<p role="status" className="case-followup-time">{notice}</p>}
  </article>
}
function RecordText({text}:{text:string}) { const [full,setFull]=useState(false);return <><p className="continuity-source">{!full&&text.length>240?`${text.slice(0,240)}…`:text}</p>{text.length>240&&<HohoButton variant="text" aria-expanded={full} onClick={()=>setFull(v=>!v)}>{full?'收起全文':'展开全文'}</HohoButton>}</> }
