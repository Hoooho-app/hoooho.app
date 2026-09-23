import { ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, LayoutGrid, List, Moon, Paperclip, Search, Settings2, Utensils } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheetSurface, HealthTag, HohoButton, StatusNotice } from '../../components/design-system'
import type { RoutineTrack } from '../../services/routineTracks'
import { routineTrackService } from '../../services/routineTracks'
import { healthEventRecordService } from '../../services/healthEventRecords'
import { formatPlainMonthDay, formatPlainWeekday, parsePlainDate } from '../../utils/localCalendarDate'
import { bowelOccurrenceNumber, journalCategoryLabels, journalListSummary, journalTime, journalUpdateLabel, shiftJournalDate, type JournalEntry } from './timeViewModel'
import { symptomLocationDisplay, visibleSymptomKeywords } from './symptomRecordLogic'
import { sleepTimelineSummary } from './sleepTime'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { useJournal } from './useJournal'
import { useAppStore } from '../../store/useAppStore'
import { TriggerOpportunityCard } from './TriggerOpportunityCard'
import { resolveTriggerLocale } from './triggerOpportunityI18n'
import { selectTriggerOpportunity } from './triggerOpportunitySelector'
import { readTriggerCardStatus, setTriggerCardStatus, triggerSuggestionKey } from './triggerOpportunityState'
import { entriesForDay, hourForEntry, hourForTrack, minutePosition, orderedHours } from './timeGridModel'
import { useRoutineTracks } from './useRoutineTracks'
import { RoutineSetupSheet, RoutineTrackSheet } from './RoutineSheets'

function symptomFacts(entry: JournalEntry) {
  const narrative = entry.symptom?.narrative ?? entry.content
  return { keywords: visibleSymptomKeywords(narrative, entry.symptom?.keywords ?? []).join(' · '), location: symptomLocationDisplay(entry.symptom) }
}

type GridItem = { key: string; minute: number; sortTime: number; createdTime: number; kind: 'record'; entry: JournalEntry } | { key: string; minute: number; sortTime: number; createdTime: number; kind: 'routine'; track: RoutineTrack }

function RecordRow({ confirmed, entry, entries, layoutMode, ending, highlighted, onCorrectSleep, onEndSleep, onOpen, now }: { confirmed: boolean; entry: JournalEntry; entries: JournalEntry[]; layoutMode: 'list' | 'thumbnail'; ending: boolean; highlighted: boolean; onCorrectSleep: () => void; onEndSleep: () => void; onOpen: () => void; now: Date }) {
  const facts = symptomFacts(entry)
  const elapsed = entry.sleep?.status === 'ongoing' ? Math.floor((now.getTime() - Date.parse(entry.sleep.sleepAt)) / 60_000) : 0
  const abnormal = Boolean(entry.sleep?.status === 'ongoing' && (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 1440))
  const sleepStart = entry.sleep ? new Date(entry.sleep.sleepAt).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : ''
  return <article className={`journal-record journal-grid-record${entry.symptom ? ' journal-record--symptom' : ''}${layoutMode === 'thumbnail' ? ' journal-record--thumbnail' : ''}${confirmed ? ' journal-grid-record--confirmed' : ''}${entry.sleep?.status === 'ongoing' ? ' journal-grid-record--ongoing' : ''}${highlighted ? ' journal-grid-record--highlighted' : ''}`} data-record-id={entry.id}>
    <button className="journal-record-main" type="button" onClick={onOpen}>
    <span className="journal-record-time">{journalTime(entry).label}</span>
    <JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} dietKind={entry.diet?.kind} />
    <span className="journal-record-tags">{entry.categories?.includes('elimination') && <HealthTag>{`今天第${bowelOccurrenceNumber(entries, entry)}次`}</HealthTag>}{entry.sleep?.quality && <HealthTag>{entry.sleep.quality}</HealthTag>}{(entry.categories?.length ? entry.categories : ['other'] as const).map((category) => <HealthTag key={category}>{category === 'medication' && (entry.medication?.medications?.length ?? 0) > 1 ? `用药 · 共${entry.medication!.medications!.length}种` : journalCategoryLabels[category]}</HealthTag>)}</span>
    <span className="journal-record-content"><span className="journal-record-summary">{entry.sleep ? entry.sleep.status === 'ongoing' ? abnormal ? `睡眠时间未补全 · ${sleepStart}` : `${entry.sleep.kind === 'night' ? '夜间睡眠' : '白天小睡'} · 已开始` : sleepTimelineSummary(entry.sleep.kind, entry.sleep.durationMinutes) : journalListSummary(entry)}</span>{facts.keywords ? <span className="journal-symptom-facts">{facts.keywords}</span> : null}{facts.location ? <span className="journal-symptom-facts">{facts.location}</span> : null}{entry.updateCount ? <span className="journal-record-update-meta">{journalUpdateLabel(entry)}</span> : null}{entry.attachmentCount > 0 && <span className="journal-attachment" aria-label={`${entry.attachmentCount} 个附件`}><Paperclip size={13} />{entry.attachmentCount}</span>}</span>
    {confirmed ? <CheckCircle2 aria-label="已确认" className="routine-confirm-stamp" size={18} /> : <ChevronRight aria-hidden="true" className="text-text-secondary" size={16} />}
    </button>
    {entry.sleep?.status === 'ongoing' && <div className="journal-sleep-inline-action"><span>{abnormal ? `这次睡眠尚未补全时间 · 原始开始 ${sleepStart}` : `已持续 ${Math.floor(elapsed / 60)}小时${elapsed % 60}分钟`}</span><HohoButton loading={ending} onClick={abnormal ? onCorrectSleep : onEndSleep} size="small" variant="secondary">{abnormal ? '核对时间' : '结束睡眠'}</HohoButton></div>}
  </article>
}

function RoutineRow({ track, onOpen }: { track: RoutineTrack; onOpen: () => void }) {
  const description = track.category === 'sleep' ? `通常 ${track.time}–次日 ${track.endTime}` : `平常这个时间吃${track.title}`
  return <button className={`routine-grid-card${track.status === 'skipped' ? ' routine-grid-card--skipped' : ''}${track.status === 'confirmed' ? ' routine-grid-card--confirmed' : ''}`} data-routine-key={track.trackKey} onClick={onOpen} type="button">
    <span className="routine-grid-time">{track.time}</span>
    {track.category === 'sleep' ? <Moon aria-hidden="true" size={18} /> : <Utensils aria-hidden="true" size={18} />}
    <span className="routine-grid-copy"><span><strong>{track.title}</strong><small>日常作息</small></span><em>{track.status === 'confirmed' ? '已记录，点开查看' : track.status === 'skipped' ? (track.category === 'diet' ? '今天没吃' : '本次未发生') : description}</em></span>
    {track.status === 'confirmed' ? <CheckCircle2 aria-label="已确认" className="routine-confirm-stamp" size={18} /> : <ChevronRight aria-hidden="true" size={16} />}
  </button>
}

function HourItems({ allEntries, endingSleepId, highlightedRecordId, items, layoutMode, now, tracks, onCorrectSleep, onEndSleep, onRecordOpen, onRoutineOpen }: { allEntries: JournalEntry[]; endingSleepId: string; highlightedRecordId?: string; items: GridItem[]; layoutMode: 'list' | 'thumbnail'; now: Date; tracks: RoutineTrack[]; onCorrectSleep: (entry: JournalEntry) => void; onEndSleep: (entry: JournalEntry) => void; onRecordOpen: (entry: JournalEntry) => void; onRoutineOpen: (track: RoutineTrack) => void }) {
  const groups = items.reduce<Array<{ minute: number; items: GridItem[] }>>((result, item) => {
    const existing = result.find((group) => group.minute === item.minute)
    if (existing) existing.items.push(item)
    else result.push({ minute: item.minute, items: [item] })
    return result
  }, [])
  return <>{groups.map((group) => <div className={group.items.length > 1 ? 'journal-minute-group journal-minute-group--shared' : 'journal-minute-group'} data-minute={group.minute} key={group.minute}>{group.items.length > 1 && <span className="journal-minute-group-label">{`${String(group.minute).padStart(2, '0')}分 · 同一分钟`}</span>}{group.items.map((item) => item.kind === 'record'
    ? <RecordRow confirmed={tracks.some((track) => track.recordId === item.entry.id)} ending={endingSleepId === item.entry.id} entries={allEntries} entry={item.entry} highlighted={highlightedRecordId === item.entry.id} key={item.key} layoutMode={layoutMode} now={now} onCorrectSleep={() => onCorrectSleep(item.entry)} onEndSleep={() => onEndSleep(item.entry)} onOpen={() => onRecordOpen(item.entry)} />
    : <RoutineRow key={item.key} onOpen={() => onRoutineOpen(item.track)} track={item.track} />)}</div>)}</>
}

export function TimeView({ memberId, token, day, today, focusRecord, onFocusHandled, onDayChange, onRecordOpen, onRoutineRecorded, revision, onContext, sortOrder }: { memberId: string; token: string; day: string; today: string; focusRecord?: { recordId: string; day: string; revision: number; entry: JournalEntry } | null; onFocusHandled?: () => void; onDayChange: (day: string) => void; onRecordOpen: (eventId: string, recordId: string, options?: { correctSleep?: boolean }) => void; onRoutineRecorded?: () => void; revision: number; onContext: (context: { memberId: string; eventId: string | null }) => void; sortOrder: 'desc' | 'asc' }) {
  const navigate = useNavigate()
  const [layoutMode, setLayoutMode] = useState<'list' | 'thumbnail'>(() => sessionStorage.getItem('hoooho:journal-layout') === 'thumbnail' ? 'thumbnail' : 'list')
  const [layoutNotice, setLayoutNotice] = useState('')
  const [localSortOrder, setLocalSortOrder] = useState<'desc' | 'asc'>(() => sessionStorage.getItem('hoooho:journal-sort') === 'asc' ? 'asc' : sortOrder)
  const [routineRevision, setRoutineRevision] = useState(0)
  const [setupOpen, setSetupOpen] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState<RoutineTrack | null>(null)
  const [expandedHour, setExpandedHour] = useState<number | null>(null)
  const [revealedHours, setRevealedHours] = useState<Set<number>>(() => new Set())
  const [highlightedRecordId, setHighlightedRecordId] = useState('')
  const [savedNotice, setSavedNotice] = useState('')
  const [endingSleepId, setEndingSleepId] = useState('')
  const [now, setNow] = useState(() => new Date())
  const timeViewRef = useRef<HTMLElement>(null)
  const layoutNoticeTimerRef = useRef<number | null>(null)
  const layoutAnchorRef = useRef<{ key: string; offset: number } | null>(null)
  const didInitialScrollRef = useRef('')
  const { entries, loading, error, retry } = useJournal(memberId, token, revision)
  const routines = useRoutineTracks(memberId, day, token, routineRevision + revision)
  const accountId = useAppStore((state) => state.authUser?.id ?? 'guest')
  const [cardRevision, setCardRevision] = useState(0)
  const [triggerLocale, setTriggerLocale] = useState(() => resolveTriggerLocale())
  const timelineEntries = useMemo(() => focusRecord?.entry && !entries.some((entry) => entry.id === focusRecord.recordId) ? [...entries, focusRecord.entry] : entries, [entries, focusRecord])
  const dayEntries = useMemo(() => entriesForDay(timelineEntries, day), [day, timelineEntries])
  const visibleTracks = routines.data.tracks.filter((track) => !(track.status === 'confirmed' && track.recordId && dayEntries.some((entry) => entry.id === track.recordId)))
  const activeSleep = timelineEntries.find((entry) => {
    if (entry.sleep?.status !== 'ongoing') return false
    const elapsed = Math.floor((now.getTime() - Date.parse(entry.sleep.sleepAt)) / 60_000)
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= 1440
  })
  const yesterday = shiftJournalDate(today, -1)
  const relative = day === today ? '今天' : day === yesterday ? '昨天' : formatPlainWeekday(day)
  const selectedCard = activeSleep || routines.data.consent === 'enabled' ? null : selectTriggerOpportunity(now, day, today, timelineEntries, (cardId, cycle) => Boolean(readTriggerCardStatus(accountId, memberId, cardId, cycle)))
  const hours = orderedHours(localSortOrder)

  useEffect(() => {
    const update = () => setNow(new Date())
    const timer = window.setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [])
  useEffect(() => {
    const update = () => setTriggerLocale(resolveTriggerLocale())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    window.addEventListener('languagechange', update)
    return () => { observer.disconnect(); window.removeEventListener('languagechange', update) }
  }, [])
  useEffect(() => () => { if (layoutNoticeTimerRef.current !== null) window.clearTimeout(layoutNoticeTimerRef.current) }, [])
  useEffect(() => { onContext({ memberId, eventId: timelineEntries[0]?.eventId ?? null }) }, [memberId, onContext, timelineEntries])
  useEffect(() => { setSelectedTrack(null); setExpandedHour(null); setRevealedHours(new Set()); didInitialScrollRef.current = '' }, [day, memberId])

  const storageKey = `hoooho:journal-grid-scroll:${memberId}:${day}:${localSortOrder}`
  useLayoutEffect(() => {
    if (loading || routines.loading || didInitialScrollRef.current === storageKey) return
    const root = timeViewRef.current
    const scroller = root?.querySelector<HTMLElement>('.journal-scroll-region')
    if (!root || !scroller) return
    didInitialScrollRef.current = storageKey
    const saved = sessionStorage.getItem(storageKey)
    if (saved !== null) { scroller.scrollTop = Number(saved); return }
    const targetHour = day === today ? now.getHours() : dayEntries[0] ? hourForEntry(dayEntries[0], day) : 0
    const row = root.querySelector<HTMLElement>(`[data-hour="${targetHour}"]`)
    if (row) scroller.scrollTop = Math.max(0, row.offsetTop - 180)
  }, [day, dayEntries, loading, now, routines.loading, storageKey, today])
  useEffect(() => {
    const root = timeViewRef.current
    const scroller = root?.querySelector<HTMLElement>('.journal-scroll-region')
    if (!scroller) return
    const save = () => sessionStorage.setItem(storageKey, String(scroller.scrollTop))
    scroller.addEventListener('scroll', save, { passive: true })
    return () => { save(); scroller.removeEventListener('scroll', save) }
  }, [storageKey])
  useLayoutEffect(() => {
    if (!focusRecord || focusRecord.day !== day || loading) return
    const entry = dayEntries.find((candidate) => candidate.id === focusRecord.recordId)
    const root = timeViewRef.current
    const scroller = root?.querySelector<HTMLElement>('.journal-scroll-region')
    if (!entry || !root || !scroller) return
    const hour = hourForEntry(entry, day)
    setRevealedHours((current) => new Set(current).add(hour))
    setHighlightedRecordId(entry.id)
    window.requestAnimationFrame(() => {
      const node = root.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(entry.id)}"]`)
      if (node) scroller.scrollTop = Math.max(0, node.offsetTop - 104)
    })
    if (!entries.some((candidate) => candidate.id === focusRecord.recordId)) return
    const timer = window.setTimeout(() => { setHighlightedRecordId(''); onFocusHandled?.() }, 4000)
    return () => window.clearTimeout(timer)
  }, [day, dayEntries, entries, focusRecord, loading, onFocusHandled])

  const selectMonth = (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return
    const [year, monthNumber] = month.split('-').map(Number)
    const currentDay = parsePlainDate(day)?.day ?? 1
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    const selected = `${month}-${String(Math.min(currentDay, lastDay)).padStart(2, '0')}`
    onDayChange(selected > today ? today : selected)
  }
  const captureAnchor = () => {
    const root = timeViewRef.current; const scroller = root?.querySelector<HTMLElement>('.journal-scroll-region')
    if (!root || !scroller) return null
    const item = [...root.querySelectorAll<HTMLElement>('[data-record-id], [data-routine-key]')].find((node) => node.getBoundingClientRect().bottom > scroller.getBoundingClientRect().top + 120)
    const key = item?.dataset.recordId ?? item?.dataset.routineKey
    return key && item ? { key, offset: item.getBoundingClientRect().top - scroller.getBoundingClientRect().top } : null
  }
  const toggleLayoutMode = () => {
    layoutAnchorRef.current = captureAnchor()
    const next = layoutMode === 'list' ? 'thumbnail' : 'list'
    sessionStorage.setItem('hoooho:journal-layout', next); setLayoutMode(next); setLayoutNotice(next === 'list' ? '已切换为列表视图' : '已切换为缩略图视图')
    if (layoutNoticeTimerRef.current !== null) window.clearTimeout(layoutNoticeTimerRef.current)
    layoutNoticeTimerRef.current = window.setTimeout(() => setLayoutNotice(''), 1500)
  }
  useLayoutEffect(() => {
    const anchor = layoutAnchorRef.current; const root = timeViewRef.current; const scroller = root?.querySelector<HTMLElement>('.journal-scroll-region')
    if (!anchor || !root || !scroller) return
    const node = [...root.querySelectorAll<HTMLElement>('[data-record-id], [data-routine-key]')].find((item) => item.dataset.recordId === anchor.key || item.dataset.routineKey === anchor.key)
    if (node) scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset
    layoutAnchorRef.current = null
  }, [layoutMode])
  const itemsAtHour = (hour: number) => [
    ...dayEntries.filter((entry) => hourForEntry(entry, day) === hour).map((entry): GridItem => { const occurredAt = entry.sleep?.sleepAt ?? entry.occurredAt; return { key: `record:${entry.id}`, minute: hourForEntry(entry, day) === 0 && new Date(occurredAt).getHours() !== 0 ? 0 : new Date(occurredAt).getMinutes(), sortTime: Date.parse(occurredAt), createdTime: Date.parse(entry.createdAt), kind: 'record', entry } }),
    ...visibleTracks.filter((track) => hourForTrack(track) === hour).map((track): GridItem => { const sortTime = Date.parse(`${day}T${track.time}:00`); return { key: `routine:${track.trackKey}`, minute: Number(track.time.slice(3, 5)), sortTime, createdTime: sortTime, kind: 'routine', track } })
  ].sort((left, right) => (localSortOrder === 'asc' ? 1 : -1) * (left.sortTime - right.sortTime || left.createdTime - right.createdTime || left.key.localeCompare(right.key)))
  const openTriggerCard = (optionIndex?: 0 | 1) => {
    if (!selectedCard) return
    const detail = { target: selectedCard.config.category, mode: day === today ? selectedCard.config.mode : 'backfill', day, prefill: optionIndex === undefined ? {} : selectedCard.config.prefill[optionIndex], accountId, memberId, cardId: selectedCard.config.id, cycle: selectedCard.cycle, relatedEventId: selectedCard.prerequisiteEntry?.eventId, relatedRecordId: selectedCard.prerequisiteEntry?.id }
    sessionStorage.setItem(triggerSuggestionKey, JSON.stringify(detail)); window.dispatchEvent(new CustomEvent('hoooho:timeline-prompt', { detail }))
  }
  const refreshRoutines = () => setRoutineRevision((value) => value + 1)
  const showSaved = (message: string) => { setSavedNotice(message); window.setTimeout(() => setSavedNotice(''), 1800) }
  const openRoutineTrack = (track: RoutineTrack) => {
    if (track.status === 'confirmed' && track.eventId && track.recordId) onRecordOpen(track.eventId, track.recordId)
    else setSelectedTrack(track)
  }
  const endSleep = async (entry: JournalEntry) => {
    if (!entry.sleep || endingSleepId) return
    setEndingSleepId(entry.id)
    try {
      await healthEventRecordService.endSleep(entry.id, { wakeAt: new Date().toISOString() }, token)
      showSaved('睡眠记录已结束'); onRoutineRecorded?.(); void retry()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '结束睡眠失败，请重试'
      if (message.includes('核对时间')) onRecordOpen(entry.eventId, entry.id)
      else showSaved(message)
    } finally { setEndingSleepId('') }
  }
  const currentScrollTop = () => timeViewRef.current?.querySelector<HTMLElement>('.journal-scroll-region')?.scrollTop ?? 0

  return <section className="journal-time-view" data-layout-mode={layoutMode} aria-label="单日时间轴" ref={timeViewRef}>
    <div className="journal-date-navigation">
      <label className="journal-year-picker"><span>{day.slice(0, 4)}年</span><input aria-label="选择年月" max={today.slice(0, 7)} onChange={(event) => selectMonth(event.target.value)} type="month" value={day.slice(0, 7)} /></label>
      <span className="journal-yesterday-entry"><HohoButton size="icon" variant="ghost" aria-label="前一天" onClick={() => onDayChange(shiftJournalDate(day, -1))}><ChevronLeft size={22} /></HohoButton></span>
      <label className="journal-day-picker" aria-live="polite"><span>{relative} · <b>{formatPlainMonthDay(day)}</b></span><input aria-label="选择日期" max={today} onChange={(event) => onDayChange(event.target.value)} type="date" value={day} /></label>
      <HohoButton size="icon" variant="ghost" aria-label="后一天" disabled={day >= today} onClick={() => onDayChange(shiftJournalDate(day, 1))}><ChevronRight size={22} /></HohoButton>
      <HohoButton size="icon" variant="ghost" aria-label="搜索健康随身记" onClick={() => navigate('/health-events/search', { state: { journalReturn: { day, scrollTop: currentScrollTop() } } })}><Search size={18} /></HohoButton>
      <span className="journal-layout-switch"><HohoButton size="icon" variant="ghost" aria-label={layoutMode === 'list' ? '当前为列表视图，点击切换为缩略图视图' : '当前为缩略图视图，点击切换为列表视图'} onClick={toggleLayoutMode}>{layoutMode === 'list' ? <List size={18} /> : <LayoutGrid size={18} />}</HohoButton>{layoutNotice && <span className="journal-layout-notice" aria-live="polite" role="status">{layoutNotice}</span>}</span>
      <HohoButton size="icon" variant="ghost" aria-label={`记录顺序：${localSortOrder === 'desc' ? '最新在上' : '最新在下'}，点击切换`} aria-pressed={localSortOrder === 'asc'} onClick={() => setLocalSortOrder((value) => { const next = value === 'desc' ? 'asc' : 'desc'; sessionStorage.setItem('hoooho:journal-sort', next); return next })}><ArrowUpDown size={18} /></HohoButton>
    </div>
    <div className="routine-toolbar"><span>全天时间轴</span><button onClick={() => setSetupOpen(true)} type="button"><Settings2 size={16} />{routines.data.consent === 'enabled' ? '调整作息' : '设置日常作息'}</button></div>
    <div className="journal-scroll-region">
    {routines.data.consent === 'unset' && !routines.loading && <article className="routine-consent-card"><strong>把平常的作息留在时间轴上</strong><p>设置后每天都会显示轻量轨迹，不点也没关系，也不会发送催填提醒。</p><div><HohoButton onClick={() => setSetupOpen(true)}>设置作息</HohoButton><button onClick={async () => { await routineTrackService.setConsent(memberId, 'declined', token); refreshRoutines() }} type="button">暂不使用</button></div></article>}
    {(loading || routines.loading) && <div className="journal-grid-loading" role="status">正在加载时间轴…</div>}
    {error && <StatusNotice tone="error" title={entries.length ? '记录刷新失败，正在显示上次内容' : error} action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} />}
    {routines.error && <StatusNotice tone="error" title="日常作息加载失败" action={<HohoButton variant="secondary" onClick={routines.retry}>重新加载</HohoButton>} />}
    {selectedCard ? <TriggerOpportunityCard locale={triggerLocale} onAction={openTriggerCard} onDismiss={() => { setTriggerCardStatus(accountId, memberId, selectedCard.config.id, selectedCard.cycle, 'dismissed'); setCardRevision((value) => value + 1) }} selected={selectedCard} key={`${memberId}:${selectedCard.config.id}:${selectedCard.cycle}:${cardRevision}`} /> : null}
    <div className="journal-day-grid" aria-label={`${day} 全天时间轴`}>
      {hours.map((hour) => {
        const items = itemsAtHour(hour); const visible = revealedHours.has(hour) ? items : items.slice(0, 2); const isCurrent = day === today && now.getHours() === hour
        const linePosition = minutePosition(now.getMinutes())
        return <section className={`journal-hour-row${isCurrent ? ' journal-hour-row--current' : ''}${items.length ? ' journal-hour-row--populated' : ' journal-hour-row--empty'}`} data-hour={hour} key={hour}>
          <div className="journal-hour-scale"><strong>{String(hour).padStart(2, '0')}:00</strong>{(items.length > 0 || isCurrent) && <><span>15</span><span>30</span><span>45</span></>}</div>
          <div className="journal-hour-content"><HourItems allEntries={dayEntries} endingSleepId={endingSleepId} highlightedRecordId={highlightedRecordId} items={visible} layoutMode={layoutMode} now={now} onCorrectSleep={(entry) => onRecordOpen(entry.eventId, entry.id, { correctSleep: true })} onEndSleep={endSleep} onRecordOpen={(entry) => onRecordOpen(entry.eventId, entry.id)} onRoutineOpen={openRoutineTrack} tracks={routines.data.tracks} />{items.length > visible.length && <button className="journal-hour-more" onClick={() => setExpandedHour(hour)} type="button">还有 {items.length - visible.length} 条</button>}</div>
          {isCurrent && <div className="journal-current-line" style={{ top: `${linePosition}%` }}><span>{`现在 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</span><i /></div>}
        </section>
      })}
    </div>
    </div>
    <RoutineSetupSheet effectiveFrom={today} memberId={memberId} onClose={() => setSetupOpen(false)} onSaved={(message) => { refreshRoutines(); showSaved(message) }} open={setupOpen} routineDay={routines.data} token={token} />
    <RoutineTrackSheet memberId={memberId} now={now} onClose={() => setSelectedTrack(null)} onSaved={(message) => { refreshRoutines(); onRoutineRecorded?.(); showSaved(message) }} openTrack={selectedTrack} token={token} />
    <BottomSheetSurface label="这个小时的全部内容" onClose={() => setExpandedHour(null)} open={expandedHour !== null} title={expandedHour === null ? '这个小时' : `${String(expandedHour).padStart(2, '0')}:00`}>
      {expandedHour !== null && <div className="journal-hour-sheet"><HourItems allEntries={dayEntries} endingSleepId={endingSleepId} highlightedRecordId={highlightedRecordId} items={itemsAtHour(expandedHour)} layoutMode="thumbnail" now={now} onCorrectSleep={(entry) => { setExpandedHour(null); onRecordOpen(entry.eventId, entry.id, { correctSleep: true }) }} onEndSleep={endSleep} onRecordOpen={(entry) => { setExpandedHour(null); onRecordOpen(entry.eventId, entry.id) }} onRoutineOpen={(track) => { setExpandedHour(null); openRoutineTrack(track) }} tracks={routines.data.tracks} /></div>}
    </BottomSheetSurface>
    {savedNotice && <div className="journal-saved-toast" aria-live="polite" role="status">{savedNotice}</div>}
  </section>
}
