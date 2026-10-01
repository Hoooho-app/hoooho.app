import { useEffect, useState } from 'react'
import { healthEventRecordService } from '../../services/healthEventRecords'
import type { HealthEventRecordApiDto } from '../../types'
export interface SourceChoice { sourceRecordId: string; sourceQuote: string; sourcePage: number }
export function ObservationSource({ eventId, token, value, onChange }: { eventId:string; token:string; value:SourceChoice; onChange:(value:SourceChoice)=>void }) {
  const [records,setRecords] = useState<HealthEventRecordApiDto[]>([]), [error,setError] = useState(''), [version,setVersion] = useState(0)
  useEffect(() => { const controller = new AbortController(); setRecords([]); setError(''); void healthEventRecordService.list(eventId,token,controller.signal).then(items => { if (!controller.signal.aborted) setRecords(items.filter(r => r.caseContext?.identity === 'medical_consultation' && r.caseContext.confirmed)) }).catch(() => { if (!controller.signal.aborted) setError('医生来源未加载，可重试；不会自动标为医嘱') }); return () => controller.abort() },[eventId,token,version])
  const selected = records.find(r => r.id === value.sourceRecordId)
  return <><label>安排来源<select value={value.sourceRecordId} onChange={e => onChange({ sourceRecordId:e.target.value, sourceQuote:'', sourcePage:1 })}><option value="">家长自行安排（非医嘱）</option>{records.map(record => <option key={record.id} value={record.id}>已核对的医生消息 · {record.content.slice(0,40)}</option>)}</select></label>{selected && <><p className="continuity-source">{selected.content}</p><label>保留原观察要求（逐字原话）<textarea value={value.sourceQuote} maxLength={1000} onChange={e => onChange({ ...value,sourceQuote:e.target.value })}/></label><label>来源页码<input type="number" min={1} max={200} value={value.sourcePage} onChange={e => onChange({ ...value,sourcePage:Number(e.target.value) })}/></label></>}{error && <p role="alert">{error}<button type="button" onClick={() => setVersion(v => v+1)}>重试</button></p>}</>
}
