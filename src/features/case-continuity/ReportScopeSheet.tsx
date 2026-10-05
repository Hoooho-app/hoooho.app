import { useEffect, useRef, useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { visitSheetService, type VisitSheetUpdate } from '../../services/visitSheets'
import type { VisitSheetState } from '../../types/visitSheet'
import { localDateTimeToIso, localDateTimeValue } from '../../utils/healthOccurredAt'
import { useCases } from './useCases'
const scopeDate=(value:string)=>{try{return value?localDateTimeToIso(value):undefined}catch{return undefined}}
export function ReportScopeSheet({initial,memberId,token,version,onClose,onSave,onUndo,busy,error}:{initial?:VisitSheetUpdate['selection'];memberId:string;token:string;version:number;onClose:()=>void;onSave:(selection:VisitSheetUpdate['selection'])=>Promise<void>;onUndo?:()=>Promise<void>;busy:boolean;error:string}) {
  const {data,error:loadError,reload}=useCases(),items=[...(data?.active??[]),...(data?.archived??[])]
  const [all,setAll]=useState(!initial),[eventIds,setEventIds]=useState(initial?.eventIds??[]),[background,setBackground]=useState(initial?.includeBackground??false)
  const [from,setFrom]=useState(initial?.from?localDateTimeValue(new Date(initial.from)):''),[to,setTo]=useState(initial?.to?localDateTimeValue(new Date(initial.to)):'')
  const [preview,setPreview]=useState<VisitSheetState['scopePreview']>(),[checking,setChecking]=useState(false),[localError,setLocalError]=useState('')
  const revision=useRef(0),request=useRef<AbortController|null>(null)
  useEffect(()=>()=>request.current?.abort(),[])
  const changed=()=>{revision.current++;request.current?.abort();setChecking(false);setPreview(undefined);setLocalError('')}
  const start=scopeDate(from),end=scopeDate(to)
  const invalid=!all&&((from&&!start)||(to&&!end)?'请填写有效日期时间':start&&end&&Date.parse(start)>Date.parse(end)?'开始时间不能晚于结束时间':(start&&Date.parse(start)>Date.now())||(end&&Date.parse(end)>Date.now())?'范围不能包含未来时间':!eventIds.length?'请至少选择一次情况':'')
  const selection=all?null:{eventIds,includeBackground:background,...(start?{from:start}:{}),...(end?{to:end}:{})}
  const check=async()=>{
    if(checking||busy||invalid)return
    const current=revision.current,c=new AbortController();request.current=c;setChecking(true);setLocalError('')
    try{const result=await visitSheetService.save(memberId,token,{expectedVersion:version,requestId:crypto.randomUUID(),selection,previewScope:true},c.signal);if(!c.signal.aborted&&current===revision.current)setPreview(result.scopePreview)}catch(e){if(!c.signal.aborted)setLocalError(e instanceof Error?e.message:'范围预览失败，请重试')}finally{if(current===revision.current)setChecking(false)}
  }
  const close=()=>{if(busy)return;request.current?.abort();onClose()}
  return <BottomSheetSurface open title="本次资料范围" label="本次资料范围" onClose={close} footer={<HohoButton disabled={busy||checking||!!invalid||(!all&&!data)} loading={busy||checking} fullWidth onClick={()=>void(preview?onSave(selection):check())}>{preview?'确认范围并更新情况单':'预览范围变化'}</HohoButton>}>
    <div className="continuity-form p-4">
      <p>只调整情况单，不删除原始资料。先预览影响，再确认更新。</p>
      <label><span><input style={{width:'auto'}} type="radio" name="report-scope" checked={all} onChange={()=>{changed();setAll(true)}}/>全部可访问资料（恢复完整范围）</span></label>
      <label><span><input style={{width:'auto'}} type="radio" name="report-scope" checked={!all} onChange={()=>{changed();setAll(false)}}/>选择情况与时间</span></label>
      {!all&&<>{loadError?<HohoButton variant="text" onClick={reload}>重试加载情况</HohoButton>:!data?<p>加载中…</p>:items.map(item=><label key={item.event.id}><span><input style={{width:'auto'}} type="checkbox" checked={eventIds.includes(item.event.id)} onChange={e=>{changed();setEventIds(ids=>e.target.checked?[...ids,item.event.id]:ids.filter(id=>id!==item.event.id))}}/>{item.event.title}{item.event.caseArchivedAt?'（已归档）':''}</span></label>)}
      <label>开始时间（选填）<input type="datetime-local" aria-invalid={!!invalid} value={from} onChange={e=>{changed();setFrom(e.target.value)}}/></label>
      <label>结束时间（选填）<input type="datetime-local" aria-invalid={!!invalid} value={to} onChange={e=>{changed();setTo(e.target.value)}}/></label>
      <label><span><input style={{width:'auto'}} type="checkbox" checked={background} onChange={e=>{changed();setBackground(e.target.checked)}}/>纳入既往、成长和独立计划</span></label></>}
      {preview&&<div role="status"><p>将纳入 {preview.sourceCount} / {preview.totalSources} 项当前可访问资料。</p><p>{preview.focusAvailable?'当前主诉仍在范围内。':'当前选择的症状将被过滤；选择仍保留，可恢复全部资料。'}</p><p>{preview.excludedPhotos?`${preview.excludedPhotos} 张原选照片不在新范围内；恢复范围后可再次展示。`:'当前所选照片未被此范围排除。'}</p>{!preview.sourceCount&&<p>此范围没有资料，确认后只显示空状态。</p>}</div>}
      {onUndo&&<HohoButton variant="text" disabled={busy||checking} onClick={()=>void onUndo()}>撤销上一次范围调整</HohoButton>}
      {(invalid||localError||error)&&<p role="alert">{invalid||localError||error}</p>}
    </div>
  </BottomSheetSurface>
}
