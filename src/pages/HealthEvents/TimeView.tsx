import { ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Paperclip, Search, Settings } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { formatPlainMonthDay, getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { RoutineSetupSheet } from './RoutineSheets'
import { entriesForDay, hourProgress, orderedHours } from './timeGridModel'
import { journalCategoryLabels, journalListSummary, shiftJournalDate, type JournalEntry } from './timeViewModel'
import { useJournal } from './useJournal'
import { useRoutineTracks } from './useRoutineTracks'
import { journalOccurrenceAt } from '../../../shared/journal-occurrence.mjs'

type TimelineItemBase = { createdTime: number; hour: number; key: string; minute: number; sortTime: number }
type TimelineItem = TimelineItemBase & ({ kind: 'record'; entry: JournalEntry } | { kind: 'hour-divider' })

function clockLabel(hour: number, minute: number) { return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }

function currentClockLabel(date: Date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join(':')
}

function CurrentTimeRow() {
  const [state, setState] = useState(() => ({ now: new Date(), reset: false }))
  useEffect(() => {
    let timer = 0
    const update = () => setState((previous) => { const now = new Date(); return { now, reset: now.getHours() !== previous.now.getHours() || getLocalDateKey(now) !== getLocalDateKey(previous.now) } })
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { update(); schedule() }, 1000 - Date.now() % 1000 + 20) }
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') { update(); schedule() } }
    schedule(); document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [])
  const { now, reset } = state
  const style = { '--journal-now-progress': `${hourProgress(now) * 100}%` } as CSSProperties
  return <div className={`journal-timeline-row journal-timeline-row--now${reset ? ' journal-timeline-row--now-reset' : ''}`} data-time="now">
    <time dateTime={now.toISOString()}>现在</time><span aria-hidden="true" className="journal-timeline-marker"><span key={now.getSeconds()} /></span>
    <div aria-label={`当前时间，${currentClockLabel(now)}`} className="journal-hour-cell journal-now-cell" style={style}><span>{currentClockLabel(now)}</span></div>
  </div>
}

function RecordRow({ confirmed, entry, highlighted, onOpen }: { confirmed: boolean; entry: JournalEntry; highlighted: boolean; onOpen: () => void }) {
  const category = entry.categories?.[0] ?? 'other'; const summary = journalListSummary(entry)
  return <article className={`journal-record journal-grid-record${entry.symptom ? ' journal-record--symptom' : ''}${confirmed ? ' journal-grid-record--confirmed' : ''}${highlighted ? ' journal-grid-record--highlighted' : ''}`} data-record-id={entry.id}><button aria-label={`${journalCategoryLabels[category]}：${summary}`} className="journal-record-main" onClick={onOpen} type="button"><JournalCategoryIcon category={category} dietKind={entry.diet?.kind} /><span className="journal-record-content"><span className="journal-record-summary">{summary}{(entry.sleep?.status === 'ongoing' || entry.diet?.status === 'ongoing') && <span aria-hidden="true" className="journal-sleep-ongoing-dots"><span>.</span><span>.</span><span>.</span></span>}</span>{Boolean(entry.aiNurse?.professionalNotes.length) && <span className="journal-attachment">专业备注 {entry.aiNurse!.professionalNotes.length}</span>}{entry.attachmentCount > 0 && <span aria-label={`${entry.attachmentCount} 个附件`} className="journal-attachment"><Paperclip size={13} />{entry.attachmentCount}</span>}</span>{confirmed ? <CheckCircle2 aria-label="已确认" className="routine-confirm-stamp" size={17} /> : <ChevronRight aria-hidden="true" size={16} />}</button></article>
}

function timelineRowClass(item: TimelineItem) {
  return `journal-timeline-row${item.kind === 'hour-divider' ? ' journal-timeline-row--hour-divider' : item.minute === 0 ? ' journal-timeline-row--event-at-hour' : ' journal-timeline-row--minute'}`
}

export function TimeView({ memberId, token, day, today, focusRecord, onFocusHandled, onDayChange, onRecordOpen, onRoutineRecorded, revision, onContext, sortOrder }: { memberId: string; token: string; day: string; today: string; focusRecord?: { recordId: string; day: string; revision: number; entry?: JournalEntry } | null; onFocusHandled?: () => void; onDayChange: (day: string) => void; onRecordOpen: (eventId: string, recordId: string, options?: { correctSleep?: boolean }) => void; onRoutineRecorded?: () => void; revision: number; onContext: (context: { memberId: string; eventId: string | null }) => void; sortOrder: 'desc' | 'asc' }) {
  const navigate = useNavigate(); const [localSortOrder, setLocalSortOrder] = useState<'desc' | 'asc'>(() => sessionStorage.getItem('hoooho:journal-sort') === 'asc' ? 'asc' : sortOrder); const [routineRevision, setRoutineRevision] = useState(0); const [setupOpen, setSetupOpen] = useState(false); const [highlightedRecordId, setHighlightedRecordId] = useState(''); const [savedNotice, setSavedNotice] = useState(''); const [now, setNow] = useState(() => new Date()); const timeViewRef = useRef<HTMLElement>(null); const didInitialScrollRef = useRef('')
  const { entries, loading, error, retry } = useJournal(memberId, token, revision); const routines = useRoutineTracks(memberId, today, token, routineRevision + revision)
  const timelineEntries = useMemo(() => focusRecord?.entry && !entries.some((entry) => entry.id === focusRecord.recordId) ? [...entries, focusRecord.entry] : entries, [entries, focusRecord]); const dayEntries = useMemo(() => entriesForDay(timelineEntries, day, now), [day, now, timelineEntries])

  useEffect(() => { let interval = 0; let timeout = 0; const update = () => setNow(new Date()); const schedule = () => { window.clearTimeout(timeout); window.clearInterval(interval); timeout = window.setTimeout(() => { update(); interval = window.setInterval(update, 60_000) }, 60_000 - Date.now() % 60_000 + 25) }; const onVisibilityChange = () => { if (document.visibilityState === 'visible') { update(); schedule() } }; schedule(); document.addEventListener('visibilitychange', onVisibilityChange); return () => { window.clearTimeout(timeout); window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibilityChange) } }, [])
  useEffect(() => { sessionStorage.removeItem('hoooho:journal-layout') }, []); useEffect(() => { onContext({ memberId, eventId: timelineEntries[0]?.eventId ?? null }) }, [memberId, onContext, timelineEntries]); useEffect(() => { didInitialScrollRef.current = '' }, [day, memberId])

  const displayItems = useMemo(() => {
    const items: TimelineItem[] = dayEntries.map(entry => {
      const at = new Date(journalOccurrenceAt(entry, entry.occurredAt))
      return { kind: 'record', entry, createdTime: Date.parse(entry.createdAt), hour: at.getHours(), minute: at.getMinutes(), key: `record:${entry.id}`, sortTime: at.getTime() }
    })
    const lastHour = day === today ? now.getHours() : 23
    for (const hour of orderedHours(localSortOrder).filter(hour => hour <= lastHour)) {
      const at = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`)
      items.push({ kind: 'hour-divider', createdTime: at.getTime(), hour, minute: 0, key: `hour-divider:${hour}`, sortTime: at.getTime() })
    }
    const direction = localSortOrder === 'asc' ? 1 : -1
    return items.sort((left, right) => direction * (left.sortTime - right.sortTime) || (left.kind === 'hour-divider' ? -1 : right.kind === 'hour-divider' ? 1 : 0) || right.createdTime - left.createdTime || right.key.localeCompare(left.key))
  }, [day, dayEntries, localSortOrder, now, today])

  const storageKey = `hoooho:journal-grid-scroll:${memberId}:${day}:${localSortOrder}`
  useLayoutEffect(() => { if (loading || routines.loading || didInitialScrollRef.current === storageKey) return; const scroller = timeViewRef.current?.querySelector<HTMLElement>('.journal-scroll-region'); if (!scroller) return; didInitialScrollRef.current = storageKey; const saved = sessionStorage.getItem(storageKey); scroller.scrollTop = saved === null ? 0 : Number(saved) }, [loading, routines.loading, storageKey])
  useEffect(() => { const scroller = timeViewRef.current?.querySelector<HTMLElement>('.journal-scroll-region'); if (!scroller) return; const save = () => sessionStorage.setItem(storageKey, String(scroller.scrollTop)); scroller.addEventListener('scroll', save, { passive: true }); return () => { save(); scroller.removeEventListener('scroll', save) } }, [storageKey])
  useLayoutEffect(() => { if (!focusRecord || focusRecord.day !== day || loading) return; const root = timeViewRef.current; const scroller = root?.querySelector<HTMLElement>('.journal-scroll-region'); if (!root || !scroller || !dayEntries.some((entry) => entry.id === focusRecord.recordId)) return; setHighlightedRecordId(focusRecord.recordId); window.requestAnimationFrame(() => { const node = root.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(focusRecord.recordId)}"]`); if (node) scroller.scrollTop = Math.max(0, scroller.scrollTop + node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 72) }); if (!entries.some((candidate) => candidate.id === focusRecord.recordId)) return; const timer = window.setTimeout(() => { setHighlightedRecordId(''); onFocusHandled?.() }, 4000); return () => window.clearTimeout(timer) }, [day, dayEntries, entries, focusRecord, loading, onFocusHandled])

  const selectMonth = (month: string) => { if (!/^\d{4}-\d{2}$/.test(month)) return; const [year, monthNumber] = month.split('-').map(Number); const currentDay = parsePlainDate(day)?.day ?? 1; const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(); const selected = `${month}-${String(Math.min(currentDay, lastDay)).padStart(2, '0')}`; onDayChange(selected > today ? today : selected) }
  const refreshRoutines = () => setRoutineRevision((value) => value + 1); const showSaved = (message: string) => { setSavedNotice(message); window.setTimeout(() => setSavedNotice(''), 1800) }; const currentScrollTop = () => timeViewRef.current?.querySelector<HTMLElement>('.journal-scroll-region')?.scrollTop ?? 0
  const timelineRows = displayItems.map((item) => {
    const label = clockLabel(item.hour, item.minute)
    return <div className={timelineRowClass(item)} data-hour={item.hour} data-hour-divider={item.kind === 'hour-divider' ? label : undefined} data-time={item.kind === 'hour-divider' ? undefined : label} key={item.key}>
      <time>{label}</time>
      <span aria-hidden="true" className="journal-timeline-marker"><span /></span>
      <div className="journal-hour-cell">{item.kind === 'hour-divider' ? <span aria-hidden="true" className="journal-hour-divider-line" /> : <RecordRow confirmed={false} entry={item.entry} highlighted={highlightedRecordId === item.entry.id} onOpen={() => onRecordOpen(item.entry.eventId, item.entry.id)} />}</div>
    </div>
  })
  if (day === today) {
    const currentRow = <CurrentTimeRow key="current-time" />
    if (localSortOrder === 'desc') timelineRows.unshift(currentRow)
    else timelineRows.push(currentRow)
  }

  return <section aria-label="单日时间轴" className="journal-time-view" data-layout-mode="list" ref={timeViewRef}><div className="journal-date-navigation">
    <label className="journal-year-picker"><span>{day.slice(0, 4)}</span><input aria-label="选择年月" max={today.slice(0, 7)} onChange={(event) => selectMonth(event.target.value)} type="month" value={day.slice(0, 7)} /></label><span className="journal-yesterday-entry"><HohoButton aria-label="前一天" onClick={() => onDayChange(shiftJournalDate(day, -1))} size="icon" title="前一天" variant="ghost"><ChevronLeft size={21} /></HohoButton></span><label aria-live="polite" className="journal-day-picker"><span><b>{formatPlainMonthDay(day)}</b></span><input aria-label="选择日期" max={today} onChange={(event) => onDayChange(event.target.value)} type="date" value={day} /></label><HohoButton aria-label="后一天" disabled={day >= today} onClick={() => onDayChange(shiftJournalDate(day, 1))} size="icon" title="后一天" variant="ghost"><ChevronRight size={21} /></HohoButton><HohoButton aria-label="搜索健康随记" onClick={() => navigate('/health-events/search', { state: { journalReturn: { day, scrollTop: currentScrollTop() } } })} size="icon" title="搜索" variant="ghost"><Search size={19} /></HohoButton><HohoButton aria-label={`记录顺序：${localSortOrder === 'desc' ? '最新在上' : '最新在下'}，点击切换`} aria-pressed={localSortOrder === 'asc'} onClick={() => setLocalSortOrder((value) => { const next = value === 'desc' ? 'asc' : 'desc'; sessionStorage.setItem('hoooho:journal-sort', next); return next })} size="icon" title="排序" variant="ghost"><ArrowUpDown size={19} /></HohoButton><HohoButton aria-label="调整作息" onClick={() => setSetupOpen(true)} size="icon" title="调整作息" variant="ghost"><Settings size={20} /></HohoButton>
  </div><div className="journal-scroll-region">
    {(loading || routines.loading) && <div className="journal-grid-loading" role="status">正在加载时间轴…</div>}{error && <StatusNotice action={<HohoButton onClick={retry} variant="secondary">重新加载</HohoButton>} title={entries.length ? '记录刷新失败，正在显示上次内容' : error} tone="error" />}{routines.error && <StatusNotice action={<HohoButton onClick={routines.retry} variant="secondary">重新加载</HohoButton>} title="日常作息加载失败" tone="error" />}
    <div aria-label={`${day} 全天时间轴`} className="journal-day-grid">{timelineRows}</div>
  </div><RoutineSetupSheet effectiveFrom={today} memberId={memberId} onClose={() => setSetupOpen(false)} onSaved={(message) => { refreshRoutines(); showSaved(message) }} open={setupOpen} routineDay={routines.data} token={token} />{savedNotice && <div aria-live="polite" className="journal-saved-toast" role="status">{savedNotice}</div>}</section>
}
