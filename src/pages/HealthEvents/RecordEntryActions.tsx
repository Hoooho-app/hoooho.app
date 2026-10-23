import { CompleteImage } from '../../components/common/CompleteImage'
import { useEffect, useRef, useState } from 'react'
import type { JournalCategory, DietRecordKind } from '../../types/journal'
import { HohoButton } from '../../components/design-system'
import sleep from '../../assets/health-events/daily-record/sleep.webp'
import bowel from '../../assets/health-events/daily-record/bowel.webp'
import './RecordEntryActions.css'

const direct: readonly { id: string; category: JournalCategory; label: string; kind?: DietRecordKind }[] = [
  { id:'symptom',category:'symptom',label:'记录症状' },
  { id:'feeding',category:'diet',kind:'feeding',label:'喂养/饮食' },
  { id:'daily',category:'other',label:'日常' },
  { id:'medication',category:'medication',label:'用药' },
  { id:'materials',category:'visit',label:'就诊资料' }
]
const routines = [{ category:'sleep',label:'睡眠',image:sleep },{ category:'elimination',label:'排便',image:bowel }] as const
export function RecordEntryActions({ disabled, identity, onRecord, onSmartRecord }: { disabled: boolean; identity: string; onSmartRecord: () => void; onRecord: (category: JournalCategory, kind?: DietRecordKind) => void }) {
  const [open,setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => setOpen(false), [identity,disabled])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('[aria-controls="daily-record-options"]')?.focus() } }
    document.addEventListener('pointerdown',outside); document.addEventListener('keydown',escape)
    return () => { document.removeEventListener('pointerdown',outside); document.removeEventListener('keydown',escape) }
  },[open])
  const choose = (category: JournalCategory, kind?: DietRecordKind) => { setOpen(false); onRecord(category,kind) }
  return <div className={`record-entry-actions${open?' is-daily-open':''}`} ref={root}>
    {open && <div aria-label="记录日常选项" className="daily-record-options" id="daily-record-options" role="group">{routines.map(item => <button disabled={disabled} key={item.category} onClick={() => choose(item.category)} type="button"><CompleteImage alt="" src={item.image}/><span>{item.label}</span></button>)}</div>}
    <div aria-label="记录入口" className="record-entry-grid" role="group">{direct.map(item => <button aria-controls={item.id==='daily'?'daily-record-options':undefined} aria-expanded={item.id==='daily'?open:undefined} aria-pressed={item.id==='daily'?open:undefined} data-record-entry={item.id} disabled={disabled} key={item.id} onClick={() => item.id==='daily'?setOpen(value=>!value):choose(item.category,item.kind)} type="button"><span>{item.label}</span></button>)}</div>
    <HohoButton className="record-symptom-action" disabled={disabled} fullWidth onClick={onSmartRecord} size="large">智能记录</HohoButton>
  </div>
}
