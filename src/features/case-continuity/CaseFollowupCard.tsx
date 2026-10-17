import {useReadRecordUpdates} from '../record-updates/RecordUpdates'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate,useSearchParams } from 'react-router-dom'
import { Cross, ChevronDown } from 'lucide-react'
import { BottomSheetSurface, HohoButton, HohoInput } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import type { HealthEventRecordApiDto } from '../../types'
import { MaterialReturnForm } from './MaterialReturnPage'
import type { FollowedCase } from './types'
import { caseService } from './api'
import { followupTitle, recordCorePhrase, recordOriginal } from './followupPresentation'

const timeKnown = (r: HealthEventRecordApiDto) => !r.caseContext?.timeUnknown && r.journal?.timePrecision !== 'unknown' && Number.isFinite(Date.parse(r.occurredAt))
export const chronologicalRecords = (records: HealthEventRecordApiDto[]) => [...records].sort((a,b) => Number(timeKnown(b)) - Number(timeKnown(a)) || (timeKnown(a) && timeKnown(b) ? b.occurredAt.localeCompare(a.occurredAt) : 0) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
const dateText = (value: string | null | undefined, timezone: string) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('zh-CN', {timeZone:timezone,month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,year:'numeric'}).format(new Date(value)) : '未提供'

export function CaseFollowupCard({item, memberId, token, timezone, reload, onDirty, onStatus}: {item:FollowedCase;memberId:string;token:string;timezone:string;reload:()=>void;onDirty:(id:string,dirty:boolean)=>void;onStatus:(archived:boolean)=>void}) {
  const navigate = useNavigate(),[query]=useSearchParams()
  const [expanded,setExpanded] = useState(false), [form,setForm] = useState<'materials'|null>(null)
  const [materialRecordId,setMaterialRecordId]=useState<string|null>(null),[materialEventId,setMaterialEventId]=useState(item.event.id)
  const [records,setRecords] = useState<HealthEventRecordApiDto[]|null>(null), [error,setError] = useState(''), [version,setVersion] = useState(0)
  const [recordsLoadedAt,setRecordsLoadedAt]=useState(0)
  const [busy,setBusy] = useState(false), [failure,setFailure] = useState(''), [notice,setNotice] = useState('')
  const [management,setManagement]=useState<'edit'|'delete'|null>(null),[title,setTitle]=useState(item.followup.title),[managementError,setManagementError]=useState('')
  const pending = useRef(false), dirty = useRef(false), materialDirty = useRef(false)
  const statusRequest = useRef<{archivedAt:string|null;id:string}|null>(null)
  const id = item.event.id, archived = Boolean(item.event.caseArchivedAt), knownRecovery = item.event.caseArchiveReason === 'user_recovered' || item.event.status==='recovered'&&Boolean(item.event.recoveredAt)
  useEffect(()=>{const focus=query.get('eventId');setExpanded(Boolean(focus&&query.get('recordId')&&(item.sourceEventIds??[item.event.id]).includes(focus)))},[query,item.event.id])
  const setMaterialDirty = useCallback((value:boolean) => { materialDirty.current=value;dirty.current=value;onDirty(id,dirty.current) },[id,onDirty])
  useEffect(() => () => onDirty(id,false),[id,onDirty])
  useEffect(() => {
    if (!expanded) return
    const c=new AbortController();setError('')
    void caseService.records(memberId,token,id,c.signal).then(data=>{if(!c.signal.aborted){setRecords(chronologicalRecords(data));setRecordsLoadedAt(Date.now())}}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'过程记录未能加载')})
    return()=>c.abort()
  },[id,token,memberId,expanded,version,item.changedAt])
  useReadRecordUpdates(expanded&&!error?records?.map(r=>r.id)??[]:[],expanded&&!error&&records?(item.sourceEventIds??[id]):[],undefined,recordsLoadedAt)
  const saved = () => { setExpanded(true);setVersion(v=>v+1);setNotice('已保存到这次情况');reload() }
  const supplement = () => { if (dirty.current && !window.confirm('当前内容尚未保存，离开后保留设备草稿，确定继续吗？')) return;navigate(`/smart-record?source=case-followup&eventId=${encodeURIComponent(id)}`, {state:{caseReturn:true,eventTitle:item.followup.title,memberId,accountId:useAppStore.getState().authUser?.id??''}}) }
  async function changeStatus() {
    if(pending.current)return
    if(dirty.current&&!window.confirm('当前内容尚未保存，改变状态后保留设备草稿，确定继续吗？'))return
    pending.current=true;setBusy(true);setFailure('')
    const currentArchivedAt=item.event.caseArchivedAt??null
    if(!statusRequest.current||statusRequest.current.archivedAt!==currentArchivedAt)statusRequest.current={archivedAt:currentArchivedAt,id:crypto.randomUUID()}
    const requestId=statusRequest.current.id
    try { await caseService.recovery(memberId,token,id,{action:archived?'restore':'recover',requestId,expectedArchivedAt:item.event.caseArchivedAt??null});setForm(null);onStatus(!archived);reload() }
    catch(e){setFailure(e instanceof Error?e.message:'状态未保存，请重试')}
    finally{pending.current=false;setBusy(false)}
  }
  async function manage(){
    if(pending.current||!management)return
    if(useAppStore.getState().currentMemberId!==memberId){setManagementError('孩子已切换，请重新打开');return}
    pending.current=true;setBusy(true);setManagementError('')
    try{await caseService.manage(memberId,token,id,{title,expectedUpdatedAt:item.event.updatedAt,expectedChangedAt:item.changedAt,sourceEventIds:item.sourceEventIds??[id]},management==='delete');setManagement(null);reload()}
    catch(e){setManagementError(e instanceof Error?e.message:'操作未完成，请重试')}
    finally{pending.current=false;setBusy(false)}
  }
  const view=item.followup, displayTitle=followupTitle(item)
  return <article className="continuity-card case-followup-card" data-case-id={id} aria-label={displayTitle}>
    <div className="case-followup-card-header">
      <h2><Cross size={21} strokeWidth={1.8} aria-hidden/><span className="case-followup-title">{displayTitle}</span></h2>
      <div className="case-followup-management"><HohoButton aria-label={`编辑${displayTitle}`} variant="text" disabled={busy} onClick={()=>{setTitle(view.title);setManagementError('');setManagement('edit')}}>编辑</HohoButton></div>
    </div>
    {archived&&<p className="case-followup-time">{knownRecovery ? `${item.event.caseArchiveReason==='user_recovered'?'用户标记康复':'已记录康复'}：${dateText(item.event.caseRecoveryMarkedAt||item.event.recoveredAt,timezone)}` : <><span className="case-legacy-archive">历史归档</span>归档时间：{dateText(item.event.caseArchivedAt,timezone)}<span>未记录康复原因，不代表已确认康复</span></>}</p>}
    <div className="case-followup-toggle"><span>变化过程</span><HohoButton variant="text" aria-expanded={expanded} aria-controls={`case-timeline-${id}`} onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'展开'}<ChevronDown size={15} aria-hidden className={expanded?'case-followup-chevron-open':undefined}/></HohoButton></div>
    {expanded&&<div id={`case-timeline-${id}`} className="case-followup-timeline">
      {error?<p role="alert">{error}<HohoButton variant="secondary" onClick={()=>setVersion(v=>v+1)}>重试加载过程记录</HohoButton></p>:!records?<p role="status">正在加载过程记录…</p>:!records.length?<p>暂无过程记录</p>:<ol>{records.map(record=><li key={record.id} data-record-id={record.id}>
        <time dateTime={timeKnown(record)?record.occurredAt:undefined}>{timeKnown(record)?dateText(record.occurredAt,timezone):'发生时间未提供'}</time>
        <p className="case-followup-record-summary">{recordCorePhrase(record)}</p>
        <details><summary>查看完整原文</summary><p className="continuity-source">{recordOriginal(record)}</p>
          {record.caseContext?.supplement&&!recordOriginal(record).includes(record.caseContext.supplement)&&<p className="continuity-source">{record.caseContext.supplement}</p>}
          {record.journal?.symptom?.shortNote&&!recordOriginal(record).includes(record.journal.symptom.shortNote)&&record.journal.symptom.shortNote!==record.caseContext?.supplement&&<p className="continuity-source">{record.journal.symptom.shortNote}</p>}
        </details>
        {!archived&&record.caseContext&&record.caseContext.identity!=='parent'&&<HohoButton variant="text" onClick={()=>{if(!dirty.current||window.confirm('当前内容尚未保存，切换后保留设备草稿，确定继续吗？')){setMaterialRecordId(record.id);setMaterialEventId(record.eventId);setForm('materials')}}}>核对这份资料</HohoButton>}
      </li>)}</ol>}
      <dl className="case-followup-dates"><div><dt>最近更新</dt><dd>{dateText(view.latestOccurredAt,timezone)}</dd></div><div><dt>首次记录</dt><dd>{dateText(view.firstOccurredAt,timezone)}</dd></div></dl>
      {view.hasUnknownTime&&<p className="case-followup-time">含发生时间未提供的记录</p>}
    </div>}
    <div className="case-followup-primary-actions">
      {!archived&&<HohoButton variant="text" disabled={busy} onClick={supplement}>补充变化</HohoButton>}
      <HohoButton variant="text" disabled={busy} loading={busy} onClick={()=>void changeStatus()}>{archived?'恢复跟进':'标记已康复'}</HohoButton>
      <HohoButton aria-label={`删除${displayTitle}`} variant="text" disabled={busy} onClick={()=>{setManagementError('');setManagement('delete')}}>删除</HohoButton>
    </div>
    {!archived&&form==='materials'&&<MaterialReturnForm key={materialRecordId??'new'} initialRecordId={materialRecordId} embedded eventId={materialEventId} onDirtyChange={setMaterialDirty} onClose={()=>setForm(null)} onSaved={saved}/>}
    <BottomSheetSurface open={Boolean(management)} viewportAware title={management==='delete'?'删除这次情况？':'编辑情况名称'} label={management==='delete'?'删除情况':'编辑情况'} onClose={()=>{if(!busy)setManagement(null)}} footer={<HohoButton fullWidth loading={busy} variant={management==='delete'?'danger':'primary'} disabled={management==='edit'&&!title.trim()} onClick={()=>void manage()}>{management==='delete'?'确认删除':'保存'}</HohoButton>}>
      {management==='edit'?<HohoInput label="情况名称" maxLength={24} value={title} onChange={event=>setTitle(event.target.value)}/>:<p>将删除“{view.title}”及其{view.recordCount}条关联记录。删除后无法恢复。</p>}
      {managementError&&<p role="alert">{managementError}</p>}
    </BottomSheetSurface>
    {failure&&<p role="alert">{failure}</p>}{notice&&<p role="status" className="case-followup-time">{notice}</p>}
  </article>
}
