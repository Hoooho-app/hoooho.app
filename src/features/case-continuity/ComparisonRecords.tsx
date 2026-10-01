import { useEffect, useState } from 'react'
import { healthEventRecordService } from '../../services/healthEventRecords'
import type { HealthEventRecordApiDto } from '../../types'
import { useAppStore } from '../../store/useAppStore'
import { identityLabels } from './CaseActions'
import { RecordOriginals } from '../ai-business/RecordOriginals'
export function ComparisonRecords({ eventId }: { eventId:string }) {
  const token=useAppStore(s=>s.authToken) ?? '',memberId=useAppStore(s=>s.currentMemberId)
  const [records,setRecords]=useState<HealthEventRecordApiDto[]|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{const controller=new AbortController();setRecords(null);setError('');void healthEventRecordService.list(eventId,token,controller.signal).then(data=>{if(!controller.signal.aborted)setRecords(data)}).catch(()=>{if(!controller.signal.aborted)setError('对比记录未加载，不会按无记录显示')});return()=>controller.abort()},[eventId,token,memberId,retry])
  return error?<p role="alert">{error}<button onClick={()=>setRetry(n=>n+1)}>重试</button></p>:!records?<p>加载原记录…</p>:records.length?records.map(record=><article key={record.id}><h3>{record.caseContext?identityLabels[record.caseContext.identity]:({symptom:'症状',medication:'用药',visit:'就诊',examination:'检查',note:'原记录',other:'其他'} as const)[record.type]}</h3><small>{record.journal?.timePrecision==='unknown'?'发生时间未提供':new Date(record.occurredAt).toLocaleString()}</small><p className="continuity-source">{record.content}</p>{record.caseContext?.bodyLocations?.length?<p>部位：{record.caseContext.bodyLocations.join('、')}</p>:null}{record.journal?.topical&&<p>外用品：{record.journal.topical.productName||'产品名称未提供'}；效果：{record.journal.topical.change||'未记录'}</p>}<RecordOriginals eventId={eventId} attachmentIds={record.caseContext?.attachmentIds??record.aiProvenance?.attachmentIds??[]}/></article>):<p>没有观察记录（不代表没有反应）</p>
}
