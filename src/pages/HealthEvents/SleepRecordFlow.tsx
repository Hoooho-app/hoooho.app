import { RecordSaveTarget, RecordEditorSave } from './RecordSaveAction'
import { ArrowLeft, ChevronDown, ChevronRight, Moon, Sun } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { HohoButton, HohoSegmentedControl } from '../../components/design-system'
import { DailyRecordSettings, DailySaveText } from './DailyRecordSettings'
import { journalOccurrenceAt } from '../../../shared/journal-occurrence.mjs'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import type { JournalMetadata, JournalSleepDetails } from '../../types/journal'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { durationMinutes, formatSleepDuration } from './sleepTime'
import { SLEEP_CLOCK, angleDelta, draggedSleepInstant, pointerAngle, sleepAngle as recordAngle, sleepDateLabel as recordDateLabel, sleepInstant as recordInstant, sleepLocal as recordLocal, sleepMinute as recordMinute, sleepPeriod as recordPeriod, sleepRelativeDateLabel } from './sleepEditorTime'
import './TimeView.css'
import './SleepEditor.css'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
export type SleepDraft = JournalSleepDetails
type Endpoint = 'sleepAt' | 'wakeAt'
const names = { sleepAt: '入睡', wakeAt: '醒来' }
const fields: Endpoint[] = ['sleepAt', 'wakeAt']
const qualities: JournalSleepDetails['quality'][] = ['睡得安稳', '有些翻动', '频繁醒来']
const observations = ['夜醒', '入睡困难', '咳嗽', '鼻塞', '抓挠', '呼吸不适', '其他']
export function createSleepDraft(now = new Date()): SleepDraft {
  const end = new Date(Math.floor(now.getTime() / 60000) * 60000)
  return { sleepAt: new Date(end.getTime() - 480 * 60000).toISOString(), wakeAt: end.toISOString(), durationMinutes: 480, kind: 'night', status: 'completed', observations: [], timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
}
function point(angle: number, radius = 96) { const r = (angle - 90) * Math.PI / 180; return { x: 130 + Math.cos(r) * radius, y: 130 + Math.sin(r) * radius } }
const clock = (value: string, timeZone?: string) => recordLocal(value, timeZone).slice(11)

export function SleepEditor({ initial, automatic = false, allowStatusChange = false, manualOverview = false, saving, error, onSave, onSkip }: { initial: SleepDraft; automatic?: boolean; allowStatusChange?: boolean; manualOverview?: boolean; saving: boolean; error: string; onSave: (draft: SleepDraft) => void; onSkip?: () => void }) {
  const minutesPerTurn = SLEEP_CLOCK.minutesPerTurn
  const zone = initial.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const sleepLocal = (value: string) => recordLocal(value, zone)
  const sleepInstant = (value: string) => recordInstant(value, zone)
  const sleepAngle = (value: string) => recordAngle(value, zone, minutesPerTurn)
  const sleepMinute = (value: string) => recordMinute(value, zone)
  const sleepPeriod = (value: string) => recordPeriod(value, zone)
  const sleepDateLabel = (value: string, reference: string) => recordDateLabel(value, reference, zone)
  const clock = (value: string) => sleepLocal(value).slice(11)
  const [draft, setDraft] = useState(initial)
  const [active, setActive] = useState<Endpoint>('sleepAt')
  const [editing, setEditing] = useState<Endpoint | null>(null)
  const [supplementOpen, setSupplementOpen] = useState(false)
  const ring = useRef<SVGSVGElement>(null)
  const drag = useRef<{ field: Endpoint; initial: string; angle: number; degrees: number; pointerId: number } | null>(null)
  useEffect(() => { setDraft(initial); setActive('sleepAt'); setEditing(null); setSupplementOpen(false); drag.current = null }, [initial])
  useEffect(() => () => { drag.current = null }, [])
  const minutes = durationMinutes(draft.sleepAt, draft.wakeAt)
  const full = Math.max(0, Math.floor(minutes / minutesPerTurn))
  const remainder = Math.max(0, minutes % minutesPerTurn)
  const validation = minutes <= 0 ? '醒来时间必须晚于入睡时间，请继续调整。' : Date.parse(draft.sleepAt) > Date.now() ? '入睡时间不能晚于现在。' : draft.status !== 'ongoing' && Date.parse(draft.wakeAt) > Date.now() ? manualOverview ? '实际醒来时间不能晚于现在。' : '实际醒来时间不能晚于现在；尚未醒来请保留预计状态。' : ''
  const update = (field: Endpoint, value: string) => { setDraft(previous => { const next = { ...previous, [field]: value }; return { ...next, durationMinutes: durationMinutes(next.sleepAt, next.wakeAt) } }) }
  const eventAngle = (event: PointerEvent) => { const box = ring.current!.getBoundingClientRect(); return pointerAngle((event.clientX - box.left) / box.width * 260 - 130, (event.clientY - box.top) / box.height * 260 - 130) }
  const startDrag = (field: Endpoint, event: PointerEvent<SVGGElement>) => {
    if (saving) return
    event.preventDefault(); setActive(field); setEditing(null)
    drag.current = { field, initial: draft[field], angle: eventAngle(event), degrees: 0, pointerId: event.pointerId }
    ring.current?.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault(); const angle = eventAngle(event)
    current.degrees += angleDelta(current.angle, angle); current.angle = angle
    update(current.field, draggedSleepInstant(current.initial, current.degrees, minutesPerTurn))
  }
  const finish = (event?: PointerEvent<SVGSVGElement>) => {
    if (event && ring.current?.hasPointerCapture(event.pointerId)) ring.current.releasePointerCapture(event.pointerId)
    drag.current = null
  }
  const overlapping = Math.abs(angleDelta(sleepAngle(draft.sleepAt), sleepAngle(draft.wakeAt))) < 25
  return <div className={`sleep-editor${automatic ? ' sleep-editor--automatic' : ''}${manualOverview ? ' sleep-editor--manual-overview' : ''}`} style={manualOverview ? { '--sleep-arc': draft.sleepAt !== initial.sleepAt || draft.wakeAt !== initial.wakeAt ? SLEEP_CLOCK.adjusted.accent : draft.kind === 'nap' ? SLEEP_CLOCK.day.accent : SLEEP_CLOCK.night.accent } as CSSProperties : undefined}>
    {allowStatusChange && !manualOverview && <HohoSegmentedControl label="本次睡眠状态" disabled={saving} value={draft.status ?? 'completed'} options={[{ value: 'ongoing', label: '正在睡眠' }, { value: 'completed', label: '已经醒来' }]} onChange={status => {setDraft(previous => { const now = Math.floor(Date.now() / 60000) * 60000; return { ...previous, status: status as 'ongoing' | 'completed', ...(status === 'ongoing' ? { sleepAt: new Date(now).toISOString(), wakeAt: new Date(now + 480 * 60000).toISOString(), durationMinutes: 480 } : {}) } })}} />}
    <svg aria-label="十二小时睡眠时间圆环，每圈12小时" className="sleep-editor-ring" onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => finish()} ref={ring} role="group" viewBox="0 0 260 260">
      <circle className="sleep-editor-track" cx="130" cy="130" r="96" />
      {Array.from({ length: Math.min(full, 3) }, (_, index) => <circle className="sleep-editor-arc" cx="130" cy="130" key={index} r={96 - index * 10} />)}
      {minutes > 0 && remainder > 0 && <circle className="sleep-editor-arc" cx="130" cy="130" r={96 - Math.min(full, 3) * 10} pathLength={minutesPerTurn} strokeDasharray={`${remainder} ${minutesPerTurn - remainder}`} transform={`rotate(${sleepAngle(draft.sleepAt) - 90} 130 130)`} />}
      {manualOverview?<>
        {Array.from({length:60},(_,minute)=>{const a=point(minute*6,77),b=point(minute*6,minute%5===0?86:80);return <line className="sleep-ring-tick" key={minute} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>})}
        {Array.from({length:12},(_,hour)=>{const at=point(hour*30,124);return <text className="sleep-ring-label" key={hour} x={at.x} y={at.y+4} textAnchor="middle">{hour || 12}</text>})}
        <text className="sleep-ring-caption" x="130" y="108" textAnchor="middle">本次睡眠</text>
        <text className="sleep-ring-duration" x="130" y="134" textAnchor="middle">{formatSleepDuration(Math.max(0, minutes))}</text>
        <text className="sleep-ring-caption" x="130" y="155" textAnchor="middle">{draft.kind === 'nap' ? '日间小睡' : '夜间睡眠'}</text>
      </>:<>
      {Array.from({ length: 12 }, (_, hour) => { const a = point(hour * 30, 78); const b = point(hour * 30, hour % 3 === 0 ? 86 : 82); return <line className="sleep-ring-tick" key={hour} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> })}
      <text className="sleep-ring-label" x="130" y="14" textAnchor="middle">12:00</text><text className="sleep-ring-label" x="258" y="133">03:00</text><text className="sleep-ring-label" x="130" y="256" textAnchor="middle">06:00</text><text className="sleep-ring-label" x="2" y="133" textAnchor="end">09:00</text>
      <text className="sleep-ring-duration" x="130" y="119" textAnchor="middle">{formatSleepDuration(Math.max(0, minutes))}</text><text className="sleep-ring-caption" x="130" y="138" textAnchor="middle">{draft.status === 'ongoing' ? '预计睡眠时长' : '睡眠时长'}</text><text className="sleep-ring-caption" x="130" y="156" textAnchor="middle">{names[active]} · {sleepMinute(draft[active]) < 720 ? 'AM' : 'PM'}</text>
      {full > 0 && <text className="sleep-ring-caption" x="130" y="172" textAnchor="middle">{full}圈 · {formatSleepDuration(minutes)}</text>}
      </>}
      {fields.map(field => {
        const position = point(sleepAngle(draft[field]), overlapping ? field === 'sleepAt' ? 108 : 62 : 96)
        const period = sleepPeriod(draft[field]); const Icon = field === 'sleepAt' ? Moon : Sun
        return <g aria-label={`拖动调整${names[field]}时间，当前${sleepLocal(draft[field])}`} aria-valuetext={sleepLocal(draft[field])} className="sleep-editor-node" key={field} onPointerDown={event => startDrag(field, event)} onFocus={() => setActive(field)} onKeyDown={event => { if (!saving && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) { event.preventDefault(); setActive(field); finish(); update(field, draggedSleepInstant(draft[field], event.key === 'ArrowRight' ? 360/minutesPerTurn : -360/minutesPerTurn, minutesPerTurn)) } }} role="slider" tabIndex={saving ? -1 : 0} transform={`translate(${position.x} ${position.y})`} style={{ color: period.accent }}>
          <circle fill="transparent" r={automatic ? 30 : 27} /><circle fill={period.background} r="16" stroke={period.accent} /><Icon aria-hidden="true" x="-10" y="-10" width="20" height="20" />
        </g>
      })}
    </svg>
    <div className="sleep-editor-cards">{fields.map(field => {
      const period = sleepPeriod(draft[field]); const Icon = field === 'sleepAt' ? Moon : Sun
      const time = clock(draft[field]); const hour = Number(time.slice(0, 2))
      return <button aria-expanded={editing === field} className="sleep-editor-card" disabled={saving} key={field} onClick={() => { finish(); setActive(field); setEditing(editing === field ? null : field) }} style={{ '--sleep-accent': period.accent } as CSSProperties} type="button">
        <span><Icon size={20} />{names[field]}</span>
        {manualOverview && <small className="sleep-editor-date">{sleepRelativeDateLabel(draft[field], new Date(Date.now()), zone)}</small>}
        <strong>{manualOverview ? <>{String(hour % 12 || 12).padStart(2, '0')}{time.slice(2)}<span className="sleep-editor-period">{hour < 12 ? 'AM' : 'PM'}</span></> : time}</strong>
        {Date.parse(draft[field]) !== Date.parse(initial[field]) && <em style={{ color: SLEEP_CLOCK.adjusted.accent, background: SLEEP_CLOCK.adjusted.background }}>已调整</em>}
        {!manualOverview && <small>{sleepDateLabel(draft[field], draft.sleepAt)}</small>}
      </button>
    })}</div>
    {editing && <div className="sleep-editor-inputs"><label>{names[editing]}日期<input aria-label={`${names[editing]}日期`} onChange={event => { finish(); if (event.target.value) update(editing, sleepInstant(`${event.target.value}T${clock(draft[editing])}`)) }} type="date" value={sleepLocal(draft[editing]).slice(0, 10)} /></label><label>{names[editing]}时间<input aria-label={`${names[editing]}时间`} onChange={event => { finish(); if (event.target.value) update(editing, sleepInstant(`${sleepLocal(draft[editing]).slice(0, 10)}T${event.target.value}`)) }} step="60" type="time" value={clock(draft[editing])} /></label></div>}
    {automatic && <p className="sleep-editor-hint">仅修改本次，不改变日常作息</p>}
    {allowStatusChange && !manualOverview && draft.status !== 'ongoing' && <p className="sleep-editor-hint">初始时间仅供调整，请核对实际入睡和醒来时间后保存。</p>}
    {draft.status === 'ongoing' && <p className="sleep-editor-hint">预计醒来；保存后继续运行，实际醒来后请确认结束。</p>}
    <section className="sleep-editor-supplement"><button aria-expanded={supplementOpen} onClick={() => setSupplementOpen(!supplementOpen)} type="button"><span>睡得怎么样<small>（选填）</small></span>{manualOverview ? <ChevronRight aria-hidden="true" size={18} /> : <ChevronDown aria-hidden="true" size={18} />}</button>{!supplementOpen && Boolean(draft.quality || draft.observations?.length) && <p>{[draft.quality, ...(draft.observations ?? []), draft.otherNote].filter(Boolean).join('、')}</p>}{supplementOpen && <><div className="sleep-choice-row">{qualities.map(option => <button aria-pressed={draft.quality === option} key={option} onClick={() => setDraft({ ...draft, quality: draft.quality === option ? undefined : option })} type="button">{option}</button>)}{observations.map(option => <button aria-pressed={draft.observations?.includes(option)} key={option} onClick={() => setDraft({ ...draft, observations: draft.observations?.includes(option) ? draft.observations.filter(item => item !== option) : [...(draft.observations ?? []), option] })} type="button">{option}</button>)}</div>{draft.observations?.includes('其他') && <input aria-label="其他影响睡眠的情况" maxLength={120} onChange={event => setDraft({ ...draft, otherNote: event.target.value })} value={draft.otherNote ?? ''} />}</>}</section>
    {minutes > 1440 && <p className="sleep-editor-hint">这是一段较长的睡眠，请核对实际日期与时间。</p>}{validation && <p className="sleep-validation" role="alert">{validation}</p>}{error && <p className="sleep-save-error" role="alert">{error}</p>}
    {allowStatusChange && <DailyRecordSettings kind="sleep" seed={{ kind: draft.kind, endTime: clock(draft.wakeAt) }} />}
    <div className="sleep-editor-save"><RecordEditorSave disabled={Boolean(validation)} saving={saving} onClick={() => onSave({ ...draft, timeZone: zone, durationMinutes: minutes, ...(!draft.observations?.includes('其他') ? { otherNote: undefined } : {}) })}><DailySaveText /></RecordEditorSave>{onSkip && <HohoButton disabled={saving} fullWidth onClick={onSkip} variant="secondary">本次未发生</HohoButton>}</div>
  </div>
}

export function SleepRecordFlow({ draft, mode, onBack, onClose, onConfirm, onSaved }: { draft: SleepDraft; mode?: 'start' | 'backfill' | 'nap'; memberId?: string; onDraftChange: (draft: SleepDraft) => void; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [saveTarget, setSaveTarget] = useState<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const initial = useRef(mode === 'start' ? { ...draft, sleepAt: new Date(Math.floor(Date.now() / 60000) * 60000).toISOString(), wakeAt: new Date(Math.floor(Date.now() / 60000) * 60000 + 480 * 60000).toISOString(), status: 'ongoing' as const } : draft)
  const layerRef = useRef<HTMLElement>(null)
  usePageScrollLock(true); useDialogFocus(true, layerRef)
  const save = async (value: SleepDraft) => {
    if (saving) return
    setSaving(true); setError('')
    try { const message = await onConfirm(`睡眠\n${clock(value.sleepAt, value.timeZone)}–${clock(value.wakeAt, value.timeZone)} · ${formatSleepDuration(value.durationMinutes)}`, journalOccurrenceAt({ sleep: value }, value.sleepAt), 'text', { draftId: '', photoIds: [] }, { categories: ['sleep'], sleep: value }); onSaved(message); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  return <div className="sleep-record-page-layer"><section aria-label="记录睡眠" aria-modal="true" className="sleep-record-page" ref={layerRef} role="dialog" tabIndex={-1}><header><button aria-label="返回记录新情况" disabled={saving} onClick={onBack} type="button"><ArrowLeft size={22} /></button><h1>记录睡眠</h1><span className="record-header-save-target" ref={setSaveTarget}/></header><RecordSaveTarget.Provider value={saveTarget}><div className="sleep-record-scroll"><SleepEditor manualOverview allowStatusChange error={error} initial={initial.current} onSave={value => void save(value)} saving={saving} /></div></RecordSaveTarget.Provider></section></div>
}
