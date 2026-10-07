import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HohoButton } from '../../components/design-system'
import { ChildBodyLocationPicker } from '../../components/health/body-location/ChildBodyLocationPicker'
import type { BodyLocationSelection } from '../../features/body-location'
import type { JournalMetadata } from '../../types/journal'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { useAppStore } from '../../store/useAppStore'
import { QuickRecordPhotos, useQuickRecordPhotos, type QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { OccurrenceTimeField, useOccurrenceTime } from './OccurrenceTimeField'
import './RecordForm.css'
import { DailyRecordSettings, DailySaveText } from './DailyRecordSettings'
import '../../features/case-continuity/cases.css'
type Topical = NonNullable<JournalMetadata['topical']>
const labels = { care:'日常护理（原记录）', skincare:'护肤品', external_medication:'外用药', other:'其他' }
export function TopicalRecordFlow({ memberId, token, selectedDay, today, onBack, onClose, onConfirm, onSaved, initialJournal, initialOccurredAt }: { memberId:string; token:string; selectedDay:string; today:string; onBack:()=>void; onClose:()=>void; onConfirm:(content:string, at:string, channel:'text', photos:QuickRecordPhotoPayload, journal:JournalMetadata)=>Promise<string>; onSaved:(message:string)=>void; initialJournal?:Topical; initialOccurredAt?:string }) {
  const key = `topical:${useAppStore.getState().authUser?.id}:${memberId}`
  const [draft, setDraft] = useState<Topical>(() => { if (initialJournal) return initialJournal; try { return JSON.parse(sessionStorage.getItem(key) ?? 'null') || { kind:'skincare', bodyLocations:[] } } catch { return { kind:'skincare', bodyLocations:[] } } })
  const [locations, setLocations] = useState<BodyLocationSelection[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState(''), pending = useRef(false), layer = useRef<HTMLElement>(null)
  const photos = useQuickRecordPhotos(memberId, token, 6, 'topical'), occurrence = useOccurrenceTime(selectedDay, today, initialOccurredAt)
  usePageScrollLock(true); useDialogFocus(true,layer)
  useEffect(() => { if (!initialJournal) sessionStorage.setItem(key,JSON.stringify(draft)) },[draft,key,initialJournal])
  async function save() {
    if (pending.current || useAppStore.getState().currentMemberId !== memberId) return
    if (!draft.productName?.trim() && !photos.photos.length && !initialJournal) { setError('填写产品名称或添加产品／包装照片'); return }
    const at = occurrence.capture(); if (!at) return
    pending.current = true; setBusy(true); setError('')
    try { const content = [`身体涂抹 · ${labels[draft.kind]}`, draft.productName && `产品：${draft.productName}`, draft.bodyLocations.length && `部位：${draft.bodyLocations.join('、')}`, draft.amount && `用量：${draft.amount}`, draft.reason && `为什么使用：${draft.reason}`, draft.change && `使用后变化：${draft.change}`, photos.photos.length ? '包装／产品照片已保留' : ''].filter(Boolean).join('\n'); const message = await onConfirm(content, at, 'text', photos.payload(), { categories:['care'], topical:draft }); photos.clearAfterSave(); sessionStorage.removeItem(key); onSaved(message); onClose() } catch (e) { setError(e instanceof Error ? e.message : '未保存，请重试') } finally { pending.current = false; setBusy(false) }
  }
  return <div className="diet-record-page-layer"><section ref={layer} className="diet-record-page outdoor-record-page" role="dialog" aria-modal="true" aria-label="记录身体涂抹" tabIndex={-1}><header><button aria-label="返回" disabled={busy} onClick={onBack}><ArrowLeft size={22}/></button><h1>记录身体涂抹</h1><span/></header><div className="diet-record-scroll outdoor-record-scroll"><div className="continuity-form"><label>类型<select value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind:e.target.value as Topical['kind'] }))}>{Object.entries(labels).filter(([value]) => value !== 'care' || draft.kind === 'care').map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>产品名称（或添加包装照片）<input maxLength={1000} value={draft.productName ?? ''} onChange={e => setDraft(d => ({ ...d, productName:e.target.value }))}/></label><ChildBodyLocationPicker memberId={memberId} value={locations} onChange={v => { setLocations(v); setDraft(d => ({ ...d, bodyLocations:v.map(l => l.label) })) }}/>{!!draft.bodyLocations.length && <small>已记录部位：{draft.bodyLocations.join('、')}</small>}<QuickRecordPhotos model={photos} showAddButton={!initialJournal}/><details><summary>用量、原因、变化（选填）</summary>{(['amount','reason','change'] as const).map(field => <label key={field}>{{ amount:'用量（选填）', reason:'为什么使用（选填）', change:'使用后变化（选填）' }[field]}<input maxLength={1000} value={draft[field] ?? ''} onChange={e => setDraft(d => ({ ...d,[field]:e.target.value }))}/></label>)}</details><small>只记录已实际使用，不生成用药方案，也不重复建立用药提醒。</small><OccurrenceTimeField model={occurrence} label="记录时间"/><DailyRecordSettings kind="topical" seed={{ kind:draft.kind, productName:draft.productName ?? '', bodyLocations:draft.bodyLocations.join('、'), amount:draft.amount ?? '' }}/>{error && <p role="alert">{error}</p>}<HohoButton fullWidth disabled={busy || photos.blocked} loading={busy} onClick={() => void save()}><DailySaveText/></HohoButton></div></div></section></div>
}
