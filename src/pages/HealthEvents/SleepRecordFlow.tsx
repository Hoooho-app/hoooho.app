import { ArrowLeft, ChevronRight, Moon, Sun } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { HohoButton } from '../../components/design-system'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { usePageScrollLock } from '../../hooks/usePageScrollLock'
import type { JournalMetadata, JournalSleepDetails } from '../../types/journal'
import type { QuickRecordPhotoPayload } from '../HealthEventDetail/components/QuickRecordPhotos'
import { clockMinutes, clockMinutesFromPoint, defaultSleepType, durationMinutes, formatClock, formatSleepDuration, sleepRangeFromClocks, snapClockMinutes } from './sleepTime'
import './TimeView.css'

type SaveRecord = (content: string, occurredAt: string, channel: 'text', photos: QuickRecordPhotoPayload, journal: JournalMetadata) => Promise<string>
export type SleepDraft = JournalSleepDetails

const qualities: JournalSleepDetails['quality'][] = ['睡得安稳', '有些翻动', '频繁醒来']
const observationOptions = ['夜醒', '入睡困难', '咳嗽', '鼻塞', '抓挠', '呼吸不适', '其他']

export function createSleepDraft(now = new Date()): SleepDraft {
  const wakeAt = new Date(now)
  wakeAt.setSeconds(0, 0)
  wakeAt.setMinutes(Math.floor(wakeAt.getMinutes() / 5) * 5)
  const sleepAt = new Date(wakeAt.getTime() - 8 * 60 * 60_000)
  return { sleepAt: sleepAt.toISOString(), wakeAt: wakeAt.toISOString(), durationMinutes: 480, kind: defaultSleepType(sleepAt, wakeAt), observations: [] }
}

function pointForMinutes(minutes: number, radius = 98, center = 130) {
  const radians = (minutes / 1440) * Math.PI * 2 - Math.PI / 2
  return { x: center + Math.cos(radians) * radius, y: center + Math.sin(radians) * radius }
}

function SleepRing({ draft, onChange }: { draft: SleepDraft; onChange: (draft: SleepDraft) => void }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const activeNode = useRef<'sleep' | 'wake' | null>(null)
  const lastFeedback = useRef(-1)
  const start = new Date(draft.sleepAt)
  const end = new Date(draft.wakeAt)
  const startMinute = clockMinutes(start)
  const endMinute = clockMinutes(end)
  const minutes = durationMinutes(start, end)
  const startPoint = pointForMinutes(startMinute)
  const endPoint = pointForMinutes(endMinute)
  const updateFromPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const node = activeNode.current
    const box = svgRef.current?.getBoundingClientRect()
    if (!node || !box) return
    const x = ((event.clientX - box.left) / box.width) * 260
    const y = ((event.clientY - box.top) / box.height) * 260
    const selected = snapClockMinutes(clockMinutesFromPoint(x, y, 130, 130))
    if (selected % 15 === 0 && selected !== lastFeedback.current) {
      lastFeedback.current = selected
      try { navigator.vibrate?.(4) } catch { /* vibration is an optional enhancement */ }
    }
    const range = node === 'sleep'
      ? sleepRangeFromClocks(start, end, selected, endMinute)
      : sleepRangeFromClocks(start, end, startMinute, selected)
    const nextDuration = durationMinutes(range.start, range.end)
    onChange({ ...draft, sleepAt: range.start.toISOString(), wakeAt: range.end.toISOString(), durationMinutes: nextDuration, kind: defaultSleepType(range.start, range.end) })
  }
  const begin = (node: 'sleep' | 'wake') => (event: ReactPointerEvent<SVGGElement>) => {
    activeNode.current = node
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const finish = () => { activeNode.current = null; lastFeedback.current = -1 }
  return <div className="sleep-ring-wrap">
    <svg aria-label="24小时睡眠时间圆环" className="sleep-ring" onPointerMove={updateFromPointer} onPointerUp={finish} onPointerCancel={finish} ref={svgRef} role="group" viewBox="0 0 260 260">
      <circle className="sleep-ring-track" cx="130" cy="130" fill="none" r="98" />
      {minutes > 0 && <circle className="sleep-ring-range" cx="130" cy="130" fill="none" r="98" pathLength="1440" strokeDasharray={`${minutes} ${1440 - minutes}`} strokeDashoffset={-startMinute} />}
      {[0, 360, 720, 1080].map((value) => { const inside = pointForMinutes(value, 82); const outside = pointForMinutes(value, 88); return <line className="sleep-ring-tick" key={value} x1={inside.x} x2={outside.x} y1={inside.y} y2={outside.y} /> })}
      <text className="sleep-ring-label" x="130" y="17" textAnchor="middle">00:00</text><text className="sleep-ring-label" x="249" y="134" textAnchor="end">06:00</text><text className="sleep-ring-label" x="130" y="254" textAnchor="middle">12:00</text><text className="sleep-ring-label" x="11" y="134">18:00</text>
      <text className="sleep-ring-duration" x="130" y="126" textAnchor="middle">{formatSleepDuration(minutes)}</text><text className="sleep-ring-caption" x="130" y="148" textAnchor="middle">睡眠时长</text>
      <text className="sleep-ring-node-time" x={startPoint.x} y={startPoint.y - 24} textAnchor="middle">{formatClock(start)}</text>
      <text className="sleep-ring-node-time" x={endPoint.x} y={endPoint.y + 31} textAnchor="middle">{formatClock(end)}</text>
      <g aria-label={`拖动调整入睡时间，当前${formatClock(start)}`} className="sleep-ring-node sleep-ring-node--moon" onPointerDown={begin('sleep')} role="slider" tabIndex={0} transform={`translate(${startPoint.x} ${startPoint.y})`}>
        <circle className="sleep-ring-hit" r="28" /><circle className="sleep-ring-node-face" r="17" /><Moon aria-hidden="true" x="-10" y="-10" width="20" height="20" />
      </g>
      <g aria-label={`拖动调整醒来时间，当前${formatClock(end)}`} className="sleep-ring-node sleep-ring-node--sun" onPointerDown={begin('wake')} role="slider" tabIndex={0} transform={`translate(${endPoint.x} ${endPoint.y})`}>
        <circle className="sleep-ring-hit" r="28" /><circle className="sleep-ring-node-face" r="17" /><Sun aria-hidden="true" x="-10" y="-10" width="20" height="20" />
      </g>
    </svg>
  </div>
}

function clockInputValue(value: string) { return formatClock(value) }

export function SleepRecordFlow({ draft, mode, memberId: _memberId, onDraftChange, onBack, onClose, onConfirm, onSaved }: { draft: SleepDraft; mode?: 'start' | 'backfill' | 'nap'; memberId?: string; onDraftChange: (draft: SleepDraft) => void; onBack: () => void; onClose: () => void; onConfirm: SaveRecord; onSaved: (message: string) => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [flowMode, setFlowMode] = useState(mode)
  const layerRef = useRef<HTMLElement>(null)
  usePageScrollLock(true)
  useDialogFocus(true, layerRef)
  useEffect(() => {
    const handle = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onBack() }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onBack, saving])
  const start = useMemo(() => new Date(draft.sleepAt), [draft.sleepAt])
  const end = useMemo(() => new Date(draft.wakeAt), [draft.wakeAt])
  const valid = draft.durationMinutes > 0 && draft.durationMinutes <= 1440 && end.getTime() <= Date.now()
  const setClock = (field: 'sleep' | 'wake', value: string) => {
    const [hours, minutes] = value.split(':').map(Number)
    const selected = hours * 60 + minutes
    const range = field === 'sleep'
      ? sleepRangeFromClocks(start, end, selected, clockMinutes(end))
      : sleepRangeFromClocks(start, end, clockMinutes(start), selected)
    const length = durationMinutes(range.start, range.end)
    onDraftChange({ ...draft, sleepAt: range.start.toISOString(), wakeAt: range.end.toISOString(), durationMinutes: length, kind: defaultSleepType(range.start, range.end) })
  }
  const toggleObservation = (option: string) => onDraftChange({ ...draft, observations: draft.observations?.includes(option) ? draft.observations.filter((item) => item !== option) : [...(draft.observations ?? []), option] })
  const save = async () => {
    if (!valid) { setError(end.getTime() > Date.now() ? '醒来时间不能晚于现在' : '请选择不同的入睡和醒来时间'); return }
    setSaving(true); setError('')
    try {
      const details: JournalSleepDetails = { sleepAt: draft.sleepAt, wakeAt: draft.wakeAt, durationMinutes: draft.durationMinutes, kind: draft.kind, ...(draft.quality ? { quality: draft.quality } : {}), ...(draft.observations?.length ? { observations: draft.observations } : {}), ...(draft.otherNote?.trim() ? { otherNote: draft.otherNote.trim() } : {}) }
      const title = draft.kind === 'night' ? '夜间睡眠' : '白天小睡'
      const content = `${title}\n${formatClock(start)}–${formatClock(end)} · ${formatSleepDuration(draft.durationMinutes)}`
      const message = await onConfirm(content, draft.wakeAt, 'text', { draftId: '', photoIds: [] }, { categories: ['sleep'], sleep: details })
      onSaved(message); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败，请重试') }
    finally { setSaving(false) }
  }
  const startSleep = async () => {
    if (saving) return
    setSaving(true); setError('')
    const sleepAt = new Date(); sleepAt.setSeconds(0, 0)
    try {
      const details: JournalSleepDetails = { sleepAt: sleepAt.toISOString(), wakeAt: sleepAt.toISOString(), durationMinutes: 0, kind: 'night', status: 'ongoing' }
      const message = await onConfirm('睡眠已开始', sleepAt.toISOString(), 'text', { draftId: '', photoIds: [] }, { categories: ['sleep'], sleep: details })
      onSaved(message); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '开始失败，请重试') }
    finally { setSaving(false) }
  }
  if (flowMode === 'start') return <div className="sleep-record-page-layer"><section aria-label="记录睡眠" aria-modal="true" className="sleep-record-page sleep-start-page" ref={layerRef} role="dialog" tabIndex={-1}>
    <header><button aria-label="返回健康随记" disabled={saving} onClick={onBack} type="button"><ArrowLeft size={22} /></button><h1>记录睡眠</h1><button className="sleep-header-cancel" onClick={onClose} type="button">取消</button></header>
    <div className="sleep-start-content"><span className="sleep-start-icon"><Moon aria-hidden="true" size={38} /></span><h2>准备睡觉</h2><p className="sleep-start-time">{formatClock(new Date())}<small>当前时间</small></p><HohoButton fullWidth loading={saving} onClick={() => void startSleep()} size="large">开始睡眠</HohoButton><p>点一下开始，醒来后再点一下结束</p><button onClick={() => { setFlowMode('backfill'); sessionStorage.removeItem('hoooho:journal-suggestion') }} type="button">补记之前的睡眠</button>{error && <p role="alert">{error}</p>}</div>
  </section></div>
  return <div className="sleep-record-page-layer"><section aria-label="记录睡眠" aria-modal="true" className="sleep-record-page" ref={layerRef} role="dialog" tabIndex={-1}>
    <header><button aria-label="返回记录新情况" disabled={saving} onClick={onBack} type="button"><ArrowLeft size={22} /></button><h1>记录睡眠</h1><span aria-hidden="true" /></header>
    <div className="sleep-record-scroll"><SleepRing draft={draft} onChange={onDraftChange} />
      <div className="sleep-time-cards">
        <label><span><Moon size={17} />入睡</span><strong>{clockInputValue(draft.sleepAt)}</strong><ChevronRight size={17} /><input aria-label="精确调整入睡时间" onChange={(event) => setClock('sleep', event.target.value)} type="time" value={clockInputValue(draft.sleepAt)} /></label>
        <label><span><Sun size={17} />醒来</span><strong>{clockInputValue(draft.wakeAt)}</strong><ChevronRight size={17} /><input aria-label="精确调整醒来时间" onChange={(event) => setClock('wake', event.target.value)} type="time" value={clockInputValue(draft.wakeAt)} /></label>
      </div>
      <fieldset className="sleep-fieldset"><legend>这段睡眠怎么样？<span>（可选）</span></legend><div className="sleep-choice-row">{qualities.map((option) => <button aria-pressed={draft.quality === option} key={option} onClick={() => onDraftChange({ ...draft, quality: draft.quality === option ? undefined : option })} type="button">{option}</button>)}</div></fieldset>
      <fieldset className="sleep-fieldset"><legend>有没有影响睡眠的情况？<span>（可选）</span></legend><p>不确定可以不填，之后还能补充</p><div className="sleep-choice-row">{observationOptions.map((option) => <button aria-pressed={draft.observations?.includes(option)} key={option} onClick={() => toggleObservation(option)} type="button">{option}</button>)}</div>{draft.observations?.includes('其他') && <input aria-label="其他影响睡眠的情况" maxLength={120} onChange={(event) => onDraftChange({ ...draft, otherNote: event.target.value })} placeholder="补充说明" value={draft.otherNote ?? ''} />}</fieldset>
      {!valid && <p className="sleep-validation">{end.getTime() > Date.now() ? '醒来时间不能晚于现在' : '请选择不同的入睡和醒来时间'}</p>}{error && <p aria-live="polite" className="sleep-save-error" role="alert">{error}</p>}
      <div className="sleep-record-save"><HohoButton disabled={!valid} fullWidth loading={saving} onClick={save} size="large">保存记录</HohoButton></div>
    </div>
  </section></div>
}
