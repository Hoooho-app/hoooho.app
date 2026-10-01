import { useEffect, useRef, useState } from 'react'
import type { JournalCategory, DietRecordKind } from '../../types/journal'
import { HohoButton } from '../../components/design-system'
import symptom from '../../assets/health-events/quick-record/symptom.webp'
import daily from '../../assets/health-events/quick-record/daily.webp'
import supplement from '../../assets/health-events/diet-types/supplement.webp'
import medication from '../../assets/health-events/quick-record/medication.webp'
import feeding from '../../assets/health-events/daily-record/feeding.webp'
import sleep from '../../assets/health-events/daily-record/sleep.webp'
import bowel from '../../assets/health-events/daily-record/bowel.webp'
import activity from '../../assets/health-events/daily-record/activity.webp'
import './RecordEntryActions.css'

const direct = [{ category:'symptom',label:'记录症状',image:symptom },{ category:'other',label:'记录日常',image:daily },{ category:'diet',label:'记录补剂',image:supplement },{ category:'medication',label:'记录用药',image:medication }] as const
const routines = [{ category:'diet',label:'喂养/饮食',image:feeding },{ category:'sleep',label:'睡眠',image:sleep },{ category:'elimination',label:'排便',image:bowel },{ category:'activity',label:'户外活动',image:activity }] as const
function SmartRecordIcon() {
  return <svg aria-hidden="true" className="smart-record-icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 32 32">
    <path d="M23 25H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v11M5 21l6-7 5 5 4-4 3 3"/><circle cx="11" cy="9" r="2"/>
    <path d="M25 17a2 2 0 0 1 2 2v4a2 2 0 0 1-4 0v-4a2 2 0 0 1 2-2Zm-5 6a5 5 0 0 0 10 0m-5 5v3m-3 0h6"/>
  </svg>
}
export function RecordEntryActions({ disabled, identity, onRecord, onSmart }: { disabled: boolean; identity: string; onRecord: (category: JournalCategory, kind?: DietRecordKind) => void; onSmart: () => void }) {
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
    {open && <div aria-label="记录日常选项" className="daily-record-options" id="daily-record-options" role="group">{routines.map(item => <button disabled={disabled} key={item.category} onClick={() => choose(item.category)} type="button"><img alt="" src={item.image}/><span>{item.label}</span></button>)}</div>}
    <div aria-label="记录入口" className="record-entry-grid" role="group">{direct.map(item => <button aria-controls={item.category==='other'?'daily-record-options':undefined} aria-expanded={item.category==='other'?open:undefined} aria-pressed={item.category==='other'?open:undefined} disabled={disabled} key={item.category} onClick={() => item.category==='other'?setOpen(value=>!value):choose(item.category,item.category==='diet'?'supplement':undefined)} type="button"><img alt="" src={item.image}/><span>{item.label}</span></button>)}</div>
    <HohoButton className="record-smart-action" disabled={disabled} fullWidth onClick={() => {setOpen(false);onSmart()}} size="large"><SmartRecordIcon/>智能记录</HohoButton>
  </div>
}
