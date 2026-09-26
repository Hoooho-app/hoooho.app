import { ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Moon, Paperclip, Search, Settings, Utensils } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { HohoButton, StatusNotice } from '../../components/design-system'
import type { RoutineTrack } from '../../services/routineTracks'
import { routineTrackService } from '../../services/routineTracks'
import { useAppStore } from '../../store/useAppStore'
import { formatPlainMonthDay, getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { RoutineSetupSheet, RoutineTrackSheet } from './RoutineSheets'
import { TriggerOpportunityCard } from './TriggerOpportunityCard'
import { resolveTriggerLocale } from './triggerOpportunityI18n'
import { selectTriggerOpportunity } from './triggerOpportunitySelector'
import { readTriggerCardStatus, setTriggerCardStatus, triggerSuggestionKey } from './triggerOpportunityState'
import { entriesForDay, hourProgress, isCurrentOngoingSleep, orderedHours, projectActivityInterval, type ActivityProjectionPoint } from './timeGridModel'
import { journalCategoryLabels, journalListSummary, shiftJournalDate, type JournalEntry } from './timeViewModel'
import { useJournal } from './useJournal'
import { useRoutineTracks } from './useRoutineTracks'

type TimelineItemBase = { createdTime: number; hour: number; key: string; minute: number; sortTime: number }
type IntervalProjection = ActivityProjectionPoint['kind'] | 'open'
type TimelineItem = TimelineItemBase & (
  | { kind: 'record'; entry: JournalEntry }
  | { kind: 'routine'; track: RoutineTrack }
  | { kind: 'activity-record'; activity: 'sleep' | 'meal'; entry: JournalEntry; projection: IntervalProjection; durationMinutes: number; title: string }
  | { kind: 'activity-routine'; activity: 'sleep' | 'meal' | 'activity'; track: RoutineTrack; projection: Exclude<IntervalProjection, 'open'>; durationMinutes: number; title: string }
  | { kind: 'hour-divider' }
)

function clockLabel(hour: number, minute: number) { return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }

function currentClockLabel(date: Date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join(':')
}

function formatTimelineDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safeMinutes / 60)
  const remainingMinutes = safeMinutes % 60
  if (hours === 0) return `${remainingMinutes}分`
  return `${hours}小时${remainingMinutes > 0 ? `${remainingMinutes}分` : ''}`
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
  return <article className={`journal-record journal-grid-record${entry.symptom ? ' journal-record--symptom' : ''}${confirmed ? ' journal-grid-record--confirmed' : ''}${highlighted ? ' journal-grid-record--highlighted' : ''}`} data-record-id={entry.id}><button aria-label={`${journalCategoryLabels[category]}：${summary}`} className="journal-record-main" onClick={onOpen} type="button"><JournalCategoryIcon category={category} dietKind={entry.diet?.kind} /><span className="journal-record-content"><span className="journal-record-summary">{summary}</span>{entry.attachmentCount > 0 && <span aria-label={`${entry.attachmentCount} 个附件`} className="journal-attachment"><Paperclip size={13} />{entry.attachmentCount}</span>}</span>{confirmed ? <CheckCircle2 aria-label="已确认" className="routine-confirm-stamp" size={17} /> : <ChevronRight aria-hidden="true" size={16} />}</button></article>
}

function RoutineRow({ track, onOpen }: { track: RoutineTrack; onOpen: () => void }) {
  const Icon = track.category === 'sleep' ? Moon : track.category === 'diet' ? Utensils : Clock3
  return <button aria-label={`${track.title}，按作息`} className={`routine-grid-card${track.status === 'skipped' ? ' routine-grid-card--skipped' : ''}${track.status === 'confirmed' ? ' routine-grid-card--confirmed' : ''}`} data-routine-key={track.trackKey} onClick={onOpen} type="button"><Icon aria-hidden="true" size={18} /><span className="routine-grid-copy"><strong>{track.title}</strong><small>· 按作息</small></span>{track.status === 'confirmed' ? <CheckCircle2 aria-label="已确认" className="routine-confirm-stamp" size={17} /> : <ChevronRight aria-hidden="true" size={16} />}</button>
}

function ActivityRow({ highlighted, item, onOpen }: { highlighted: boolean; item: Extract<TimelineItem, { kind: 'activity-record' | 'activity-routine' }>; onOpen: () => void }) {
  const status = item.projection === 'start' || item.projection === 'open' ? '开始' : item.projection === 'ongoing' ? '持续' : `共${formatTimelineDuration(item.durationMinutes)}`
  const isRoutine = item.kind === 'activity-routine'; const recordId = item.kind === 'activity-record' ? item.entry.id : undefined; const Icon = item.activity === 'sleep' ? Moon : item.activity === 'meal' ? Utensils : Clock3
  return <button aria-label={`${item.title}，${status}`} className={`journal-activity-row journal-activity-row--${item.activity} journal-activity-row--${item.projection}${isRoutine ? ' journal-activity-row--routine' : ''}${highlighted ? ' journal-grid-record--highlighted' : ''}`} data-record-id={recordId} data-routine-key={isRoutine ? item.track.trackKey : undefined} onClick={onOpen} type="button"><Icon aria-hidden="true" size={18} /><span><strong>{item.title}</strong><small>· {status}</small></span><ChevronRight aria-hidden="true" size={16} /></button>
}

function routineInterval(track: RoutineTrack) {
  if (!track.endTime) return null
  const start = new Date(`${track.day}T${track.time}:00`); const endDay = track.endTime > track.time ? track.day : shiftJournalDate(track.day, 1); const end = new Date(`${endDay}T${track.endTime}:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null
  return { start, end, durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000) }
}

function timelineItemContent(item: TimelineItem, props: { allTracks: RoutineTrack[]; highlightedRecordId: string; onRecordOpen: (entry: JournalEntry) => void; onRoutineOpen: (track: RoutineTrack) => void }) {
  if (item.kind === 'hour-divider') return <span aria-hidden="true" className="journal-hour-divider-line" />
  if (item.kind === 'record') return <RecordRow confirmed={props.allTracks.some((track) => track.recordId === item.entry.id)} entry={item.entry} highlighted={props.highlightedRecordId === item.entry.id} onOpen={() => props.onRecordOpen(item.entry)} />
  if (item.kind === 'routine') return <RoutineRow onOpen={() => props.onRoutineOpen(item.track)} track={item.track} />
  return <ActivityRow highlighted={item.kind === 'activity-record' && props.highlightedRecordId === item.entry.id} item={item} onOpen={() => item.kind === 'activity-record' ? props.onRecordOpen(item.entry) : props.onRoutineOpen(item.track)} />
}

function timelineRowClass(item: TimelineItem) {
  const precision = item.kind === 'hour-divider' ? ' journal-timeline-row--hour-divider' : item.minute === 0 ? ' journal-timeline-row--event-at-hour' : ' journal-timeline-row--minute'
  const activity = item.kind === 'activity-record' || item.kind === 'activity-routine' ? ` journal-timeline-row--activity journal-timeline-row--${item.activity}` : ''
  return `journal-timeline-row${precision}${activity}`
}

export function TimeView({ memberId, token, day, today, focusRecord, onFocusHandled, onDayChange, onRecordOpen, onRoutineRecorded, revision, onContext, sortOrder }: { memberId: string; token: string; day: string; today: string; focusRecord?: { recordId: string; day: string; revision: number; entry: JournalEntry } | null; onFocusHandled?: () => void; onDayChange: (day: string) => void; onRecordOpen: (eventId: string, recordId: string, options?: { correctSleep?: boolean }) => void; onRoutineRecorded?: () => void; revision: number; onContext: (context: { memberId: string; eventId: string | null }) => void; sortOrder: 'desc' | 'asc' }) {
  const navigate = useNavigate(); const [localSortOrder, setLocalSortOrder] = useState<'desc' | 'asc'>(() => sessionStorage.getItem('hoooho:journal-sort') === 'asc' ? 'asc' : sortOrder); const [routineRevision, setRoutineRevision] = useState(0); const [setupOpen, setSetupOpen] = useState(false); const [selectedTrack, setSelectedTrack] = useState<RoutineTrack | null>(null); const [highlightedRecordId, setHighlightedRecordId] = useState(''); const [savedNotice, setSavedNotice] = useState(''); const [now, setNow] = useState(() => new Date()); const timeViewRef = useRef<HTMLElement>(null); const didInitialScrollRef = useRef('')
  const { entries, loading, error, retry } = useJournal(memberId, token, revision); const routines = useRoutineTracks(memberId, day, token, routineRevision + revision); const previousDay = shiftJournalDate(day, -1); const previousRoutines = useRoutineTracks(memberId, previousDay, token, routineRevision + revision); const accountId = useAppStore((state) => state.authUser?.id ?? 'guest'); const [cardRevision, setCardRevision] = useState(0); const [triggerLocale, setTriggerLocale] = useState(() => resolveTriggerLocale())
  const timelineEntries = useMemo(() => focusRecord?.entry && !entries.some((entry) => entry.id === focusRecord.recordId) ? [...entries, focusRecord.entry] : entries, [entries, focusRecord]); const dayEntries = useMemo(() => entriesForDay(timelineEntries, day, now), [day, now, timelineEntries]); const allTracks = useMemo(() => [...previousRoutines.data.tracks, ...routines.data.tracks], [previousRoutines.data.tracks, routines.data.tracks]); const visibleTracks = routines.data.tracks.filter((track) => !(track.status === 'confirmed' && track.recordId && dayEntries.some((entry) => entry.id === track.recordId))); const visiblePreviousTracks = previousRoutines.data.tracks.filter((track) => !(track.status === 'confirmed' && track.recordId && dayEntries.some((entry) => entry.id === track.recordId))); const activeSleep = timelineEntries.find((entry) => isCurrentOngoingSleep(entry, now)); const selectedCard = activeSleep || routines.data.consent === 'enabled' ? null : selectTriggerOpportunity(now, day, today, timelineEntries, (cardId, cycle) => Boolean(readTriggerCardStatus(accountId, memberId, cardId, cycle)))

  useEffect(() => { let interval = 0; let timeout = 0; const update = () => setNow(new Date()); const schedule = () => { window.clearTimeout(timeout); window.clearInterval(interval); timeout = window.setTimeout(() => { update(); interval = window.setInterval(update, 60_000) }, 60_000 - Date.now() % 60_000 + 25) }; const onVisibilityChange = () => { if (document.visibilityState === 'visible') { update(); schedule() } }; schedule(); document.addEventListener('visibilitychange', onVisibilityChange); return () => { window.clearTimeout(timeout); window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibilityChange) } }, [])
  useEffect(() => { const update = () => setTriggerLocale(resolveTriggerLocale()); const observer = new MutationObserver(update); observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] }); window.addEventListener('languagechange', update); return () => { observer.disconnect(); window.removeEventListener('languagechange', update) } }, [])
  useEffect(() => { sessionStorage.removeItem('hoooho:journal-layout') }, []); useEffect(() => { onContext({ memberId, eventId: timelineEntries[0]?.eventId ?? null }) }, [memberId, onContext, timelineEntries]); useEffect(() => { setSelectedTrack(null); didInitialScrollRef.current = '' }, [day, memberId])

  const displayItems = useMemo(() => {
    const items: TimelineItem[] = []; const actualActivityIds = new Set(dayEntries.filter((entry) => entry.sleep || entry.diet?.startedAt).map((entry) => entry.id))
    const addProjection = (source: { entry: JournalEntry; activity: 'sleep' | 'meal'; start: Date; end: Date; includeEnd: boolean; durationMinutes: number; title: string }) => { for (const point of projectActivityInterval(source.start, source.end, day, source.includeEnd)) items.push({ activity: source.activity, createdTime: Date.parse(source.entry.createdAt), durationMinutes: source.durationMinutes, entry: source.entry, hour: point.hour, key: `${source.activity}:${source.entry.id}:${point.key}`, kind: 'activity-record', minute: point.minute, projection: point.kind, sortTime: point.at.getTime(), title: source.title }) }
    for (const entry of dayEntries) {
      if (entry.sleep) { const startedAt = new Date(entry.sleep.sleepAt); const current = isCurrentOngoingSleep(entry, now); if (entry.sleep.status === 'ongoing' && !current) { if (getLocalDateKey(startedAt) === day) items.push({ activity: 'sleep', createdTime: Date.parse(entry.createdAt), durationMinutes: 0, entry, hour: startedAt.getHours(), key: `sleep-open:${entry.id}`, kind: 'activity-record', minute: startedAt.getMinutes(), projection: 'open', sortTime: startedAt.getTime(), title: '睡眠' }) } else { const end = entry.sleep.status === 'ongoing' ? now : new Date(entry.sleep.wakeAt); addProjection({ entry, activity: 'sleep', start: startedAt, end, includeEnd: entry.sleep.status !== 'ongoing', durationMinutes: entry.sleep.status === 'ongoing' ? Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60_000)) : entry.sleep.durationMinutes, title: '睡眠' }) } continue }
      if (entry.diet?.startedAt && entry.diet.endedAt) { const start = new Date(entry.diet.startedAt); const end = new Date(entry.diet.endedAt); addProjection({ entry, activity: 'meal', start, end, includeEnd: true, durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000)), title: entry.diet.meal ?? '用餐' }); continue }
      const occurredAt = new Date(entry.occurredAt); items.push({ createdTime: Date.parse(entry.createdAt), entry, hour: occurredAt.getHours(), key: `record:${entry.id}`, kind: 'record', minute: occurredAt.getMinutes(), sortTime: occurredAt.getTime() })
    }
    const addRoutine = (track: RoutineTrack) => { const interval = routineInterval(track); if (!interval) { const at = new Date(`${track.day}T${track.time}:00`); if (track.day === day && !(day === today && at > now)) items.push({ createdTime: at.getTime(), hour: at.getHours(), key: `routine:${track.trackKey}`, kind: 'routine', minute: at.getMinutes(), sortTime: at.getTime(), track }); return } if (track.recordId && (track.category === 'activity' ? dayEntries.some((entry) => entry.id === track.recordId) : actualActivityIds.has(track.recordId))) return; if (interval.start > now && day === today) return; const visibleEnd = day === today && now < interval.end ? now : interval.end; const includeEnd = visibleEnd.getTime() === interval.end.getTime(); for (const point of projectActivityInterval(interval.start, visibleEnd, day, includeEnd)) items.push({ activity: track.category === 'sleep' ? 'sleep' : track.category === 'diet' ? 'meal' : 'activity', createdTime: interval.start.getTime(), durationMinutes: interval.durationMinutes, hour: point.hour, key: `routine-activity:${track.trackKey}:${point.key}`, kind: 'activity-routine', minute: point.minute, projection: point.kind, sortTime: point.at.getTime(), title: track.category === 'sleep' ? '睡眠' : track.title, track }) }
    visiblePreviousTracks.filter((track) => Boolean(track.endTime)).forEach(addRoutine); visibleTracks.forEach(addRoutine)
    const lastHour = day === today ? now.getHours() : 23
    for (const hour of orderedHours(localSortOrder).filter((candidate) => candidate <= lastHour)) { const at = new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`); items.push({ createdTime: at.getTime(), hour, key: `hour-divider:${hour}`, kind: 'hour-divider', minute: 0, sortTime: at.getTime() }) }
    const direction = localSortOrder === 'asc' ? 1 : -1
    return items.sort((left, right) => direction * (left.sortTime - right.sortTime) || (left.kind === 'hour-divider' ? -1 : right.kind === 'hour-divider' ? 1 : 0) || right.createdTime - left.createdTime || right.key.localeCompare(left.key))
  }, [day, dayEntries, localSortOrder, now, today, visiblePreviousTracks, visibleTracks])

  const storageKey = `hoooho:journal-grid-scroll:${memberId}:${day}:${localSortOrder}`
  useLayoutEffect(() => { if (loading || routines.loading || previousRoutines.loading || didInitialScrollRef.current === storageKey) return; const scroller = timeViewRef.current?.querySelector<HTMLElement>('.journal-scroll-region'); if (!scroller) return; didInitialScrollRef.current = storageKey; const saved = sessionStorage.getItem(storageKey); scroller.scrollTop = saved === null ? 0 : Number(saved) }, [loading, previousRoutines.loading, routines.loading, storageKey])
  useEffect(() => { const scroller = timeViewRef.current?.querySelector<HTMLElement>('.journal-scroll-region'); if (!scroller) return; const save = () => sessionStorage.setItem(storageKey, String(scroller.scrollTop)); scroller.addEventListener('scroll', save, { passive: true }); return () => { save(); scroller.removeEventListener('scroll', save) } }, [storageKey])
  useLayoutEffect(() => { if (!focusRecord || focusRecord.day !== day || loading) return; const root = timeViewRef.current; const scroller = root?.querySelector<HTMLElement>('.journal-scroll-region'); if (!root || !scroller || !dayEntries.some((entry) => entry.id === focusRecord.recordId)) return; setHighlightedRecordId(focusRecord.recordId); window.requestAnimationFrame(() => { const node = root.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(focusRecord.recordId)}"]`); if (node) scroller.scrollTop = Math.max(0, node.offsetTop - 72) }); if (!entries.some((candidate) => candidate.id === focusRecord.recordId)) return; const timer = window.setTimeout(() => { setHighlightedRecordId(''); onFocusHandled?.() }, 4000); return () => window.clearTimeout(timer) }, [day, dayEntries, entries, focusRecord, loading, onFocusHandled])

  const selectMonth = (month: string) => { if (!/^\d{4}-\d{2}$/.test(month)) return; const [year, monthNumber] = month.split('-').map(Number); const currentDay = parsePlainDate(day)?.day ?? 1; const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(); const selected = `${month}-${String(Math.min(currentDay, lastDay)).padStart(2, '0')}`; onDayChange(selected > today ? today : selected) }
  const openTriggerCard = (optionIndex?: 0 | 1) => { if (!selectedCard) return; const detail = { target: selectedCard.config.category, mode: day === today ? selectedCard.config.mode : 'backfill', day, prefill: optionIndex === undefined ? {} : selectedCard.config.prefill[optionIndex], accountId, memberId, cardId: selectedCard.config.id, cycle: selectedCard.cycle, relatedEventId: selectedCard.prerequisiteEntry?.eventId, relatedRecordId: selectedCard.prerequisiteEntry?.id }; sessionStorage.setItem(triggerSuggestionKey, JSON.stringify(detail)); window.dispatchEvent(new CustomEvent('hoooho:timeline-prompt', { detail })) }
  const refreshRoutines = () => setRoutineRevision((value) => value + 1); const showSaved = (message: string) => { setSavedNotice(message); window.setTimeout(() => setSavedNotice(''), 1800) }; const openRoutineTrack = (track: RoutineTrack) => { if (track.status === 'confirmed' && track.eventId && track.recordId) onRecordOpen(track.eventId, track.recordId); else setSelectedTrack(track) }; const currentScrollTop = () => timeViewRef.current?.querySelector<HTMLElement>('.journal-scroll-region')?.scrollTop ?? 0
  const timelineRows = displayItems.map((item) => { const label = clockLabel(item.hour, item.minute); return <div className={timelineRowClass(item)} data-hour={item.hour} data-hour-divider={item.kind === 'hour-divider' ? label : undefined} data-time={item.kind === 'hour-divider' ? undefined : label} key={item.key}><time>{label}</time><span aria-hidden="true" className="journal-timeline-marker"><span /></span><div className="journal-hour-cell">{timelineItemContent(item, { allTracks, highlightedRecordId, onRecordOpen: (entry) => onRecordOpen(entry.eventId, entry.id), onRoutineOpen: openRoutineTrack })}</div></div> })
  if (day === today) {
    const currentRow = <CurrentTimeRow key="current-time" />
    if (localSortOrder === 'desc') timelineRows.unshift(currentRow)
    else timelineRows.push(currentRow)
  }

  return <section aria-label="单日时间轴" className="journal-time-view" data-layout-mode="list" ref={timeViewRef}><div className="journal-date-navigation">
    <label className="journal-year-picker"><span>{day.slice(0, 4)}</span><input aria-label="选择年月" max={today.slice(0, 7)} onChange={(event) => selectMonth(event.target.value)} type="month" value={day.slice(0, 7)} /></label><span className="journal-yesterday-entry"><HohoButton aria-label="前一天" onClick={() => onDayChange(shiftJournalDate(day, -1))} size="icon" title="前一天" variant="ghost"><ChevronLeft size={21} /></HohoButton></span><label aria-live="polite" className="journal-day-picker"><span><b>{formatPlainMonthDay(day)}</b></span><input aria-label="选择日期" max={today} onChange={(event) => onDayChange(event.target.value)} type="date" value={day} /></label><HohoButton aria-label="后一天" disabled={day >= today} onClick={() => onDayChange(shiftJournalDate(day, 1))} size="icon" title="后一天" variant="ghost"><ChevronRight size={21} /></HohoButton><HohoButton aria-label="搜索健康随记" onClick={() => navigate('/health-events/search', { state: { journalReturn: { day, scrollTop: currentScrollTop() } } })} size="icon" title="搜索" variant="ghost"><Search size={19} /></HohoButton><HohoButton aria-label={`记录顺序：${localSortOrder === 'desc' ? '最新在上' : '最新在下'}，点击切换`} aria-pressed={localSortOrder === 'asc'} onClick={() => setLocalSortOrder((value) => { const next = value === 'desc' ? 'asc' : 'desc'; sessionStorage.setItem('hoooho:journal-sort', next); return next })} size="icon" title="排序" variant="ghost"><ArrowUpDown size={19} /></HohoButton><HohoButton aria-label="调整作息" onClick={() => setSetupOpen(true)} size="icon" title="调整作息" variant="ghost"><Settings size={20} /></HohoButton>
  </div><div className="journal-scroll-region">
    {(loading || routines.loading || previousRoutines.loading) && <div className="journal-grid-loading" role="status">正在加载时间轴…</div>}{error && <StatusNotice action={<HohoButton onClick={retry} variant="secondary">重新加载</HohoButton>} title={entries.length ? '记录刷新失败，正在显示上次内容' : error} tone="error" />}{(routines.error || previousRoutines.error) && <StatusNotice action={<HohoButton onClick={() => { routines.retry(); previousRoutines.retry() }} variant="secondary">重新加载</HohoButton>} title="日常作息加载失败" tone="error" />}
    <div aria-label={`${day} 全天时间轴`} className="journal-day-grid">{timelineRows}</div>
    {routines.data.consent === 'unset' && !routines.loading && <article className="routine-consent-card"><strong>把平常的作息留在时间轴上</strong><p>设置后每天都会显示轻量轨迹，不点也没关系，也不会发送催填提醒。</p><div><HohoButton onClick={() => setSetupOpen(true)}>设置作息</HohoButton><button onClick={async () => { await routineTrackService.setConsent(memberId, 'declined', token); refreshRoutines() }} type="button">暂不使用</button></div></article>}{selectedCard ? <TriggerOpportunityCard key={`${memberId}:${selectedCard.config.id}:${selectedCard.cycle}:${cardRevision}`} locale={triggerLocale} onAction={openTriggerCard} onDismiss={() => { setTriggerCardStatus(accountId, memberId, selectedCard.config.id, selectedCard.cycle, 'dismissed'); setCardRevision((value) => value + 1) }} selected={selectedCard} /> : null}
  </div><RoutineSetupSheet effectiveFrom={today} memberId={memberId} onClose={() => setSetupOpen(false)} onSaved={(message) => { refreshRoutines(); showSaved(message) }} open={setupOpen} routineDay={routines.data} token={token} /><RoutineTrackSheet memberId={memberId} now={now} onClose={() => setSelectedTrack(null)} onSaved={(message) => { refreshRoutines(); onRoutineRecorded?.(); showSaved(message) }} openTrack={selectedTrack} token={token} />{savedNotice && <div aria-live="polite" className="journal-saved-toast" role="status">{savedNotice}</div>}</section>
}
