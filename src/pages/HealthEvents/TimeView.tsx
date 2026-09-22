import { ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, LayoutGrid, List, Moon, Paperclip, Search, Settings2, Utensils } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BottomSheetSurface, HealthTag, HohoButton, StatusNotice } from '../../components/design-system'
import type { RoutineTrack } from '../../services/routineTracks'
import { routineTrackService } from '../../services/routineTracks'
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

type GridItem = { key: string; minute: number; kind: 'record'; entry: JournalEntry } | { key: string; minute: number; kind: 'routine'; track: RoutineTrack }

function RecordRow({ confirmed, entry, entries, layoutMode, onOpen }: { confirmed: boolean; entry: JournalEntry; entries: JournalEntry[]; layoutMode: 'list' | 'thumbnail'; onOpen: () => void }) {
  const facts = symptomFacts(entry)
  return <button className={`journal-record journal-grid-record${entry.symptom ? ' journal-record--symptom' : ''}${layoutMode === 'thumbnail' ? ' journal-record--thumbnail' : ''}${confirmed ? ' journal-grid-record--confirmed' : ''}`} data-record-id={entry.id} type="button" onClick={onOpen}>
    <span className="journal-record-time">{journalTime(entry).label}</span>
    <JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} dietKind={entry.diet?.kind} />
    <span className="journal-record-tags">{entry.categories?.includes('elimination') && <HealthTag>{`今天第${bowelOccurrenceNumber(entries, entry)}次`}</HealthTag>}{entry.sleep?.quality && <HealthTag>{entry.sleep.quality}</HealthTag>}{(entry.categories?.length ? entry.categories : ['other'] as const).map((category) => <HealthTag key={category}>{category === 'medication' && (entry.medication?.medications?.length ?? 0) > 1 ? `用药 · 共${entry.medication!.medications!.length}种` : journalCategoryLabels[category]}</HealthTag>)}</span>
    <span className="journal-record-content"><span className="journal-record-summary">{entry.sleep ? sleepTimelineSummary(entry.sleep.kind, entry.sleep.durationMinutes) : journalListSummary(entry)}</span>{facts.keywords ? <span className="journal-symptom-facts">{facts.keywords}</span> : null}{facts.location ? <span className="journal-symptom-facts">{facts.location}</span> : null}{entry.updateCount ? <span className="journal-record-update-meta">{journalUpdateLabel(entry)}</span> : null}{entry.attachmentCount > 0 && <span className="journal-attachment" aria-label={`${entry.attachmentCount} 个附件`}><Paperclip size={13} />{entry.attachmentCount}</span>}</span>
    {confirmed ? <CheckCircle2 aria-label="已确认" className="routine-confirm-stamp" size={18} /> : <ChevronRight aria-hidden="true" className="text-text-secondary" size={16} />}
  </button>
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

function HourItems({ allEntries, items, layoutMode, tracks, onRecordOpen, onRoutineOpen }: { allEntries: JournalEntry[]; items: GridItem[]; layoutMode: 'list' | 'thumbnail'; tracks: RoutineTrack[]; onRecordOpen: (entry: JournalEntry) => void; onRoutineOpen: (track: RoutineTrack) => void }) {
  return <>{items.map((item) => item.kind === 'record'
    ? <RecordRow confirmed={tracks.some((track) => track.recordId === item.entry.id)} entries={allEntries} entry={item.entry} key={item.key} layoutMode={layoutMode} onOpen={() => onRecordOpen(item.entry)} />
    : <RoutineRow key={item.key} onOpen={() => onRoutineOpen(item.track)} track={item.track} />)}</>
}

export function TimeView({ memberId, token, day, today, onDayChange, onRecordOpen, onRoutineRecorded, revision, onContext, sortOrder }: { memberId: string; token: string; day: string; today: string; onDayChange: (day: string) => void; onRecordOpen: (eventId: string, recordId: string) => void; onRoutineRecorded?: () => void; revision: number; onContext: (context: { memberId: string; eventId: string | null }) => void; sortOrder: 'desc' | 'asc' }) {
  const navigate = useNavigate()
  const [layoutMode, setLayoutMode] = useState<'list' | 'thumbnail'>('list')
  const [layoutNotice, setLayoutNotice] = useState('')
  const [localSortOrder, setLocalSortOrder] = useState(sortOrder)
  const [routineRevision, setRoutineRevision] = useState(0)
  const [setupOpen, setSetupOpen] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState<RoutineTrack | null>(null)
  const [expandedHour, setExpandedHour] = useState<number | null>(null)
  const [savedNotice, setSavedNotice] = useState('')
  const [now, setNow] = useState(() => new Date())
  const timeViewRef = useRef<HTMLElement>(null)
  const layoutNoticeTimerRef = useRef<number | null>(null)
  const layoutAnchorRef = useRef<{ key: string; offset: number } | null>(null)
  const didInitialScrollRef = useRef('')
  const { entries, loading, error, retry } = useJournal(memberId, token, revision)
  const routines = useRoutineTracks(memberId, day, token, routineRevision + revision)
  const memberName = useAppStore((state) => state.members.find((member) => member.id === memberId)?.name ?? '')
  const accountId = useAppStore((state) => state.authUser?.id ?? 'guest')
  const [cardRevision, setCardRevision] = useState(0)
  const [triggerLocale, setTriggerLocale] = useState(() => resolveTriggerLocale())
  const dayEntries = useMemo(() => entriesForDay(entries, day), [day, entries])
  const visibleTracks = routines.data.tracks.filter((track) => !(track.status === 'confirmed' && track.recordId && dayEntries.some((entry) => entry.id === track.recordId)))
  const activeSleep = entries.find((entry) => entry.sleep?.status === 'ongoing')
  const yesterday = shiftJournalDate(today, -1)
  const relative = day === today ? '今天' : day === yesterday ? '昨天' : formatPlainWeekday(day)
  const selectedCard = routines.data.consent === 'enabled' ? null : selectTriggerOpportunity(now, day, today, entries, (cardId, cycle) => Boolean(readTriggerCardStatus(accountId, memberId, cardId, cycle)))
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
  useEffect(() => { onContext({ memberId, eventId: entries[0]?.eventId ?? null }) }, [entries, memberId, onContext])
  useEffect(() => { setSelectedTrack(null); setExpandedHour(null); didInitialScrollRef.current = '' }, [day, memberId])

  const storageKey = `hoooho:journal-grid-scroll:${memberId}:${day}:${localSortOrder}`
  useLayoutEffect(() => {
    if (loading || routines.loading || didInitialScrollRef.current === storageKey) return
    const root = timeViewRef.current
    const scroller = root?.closest<HTMLElement>('.health-events-content')
    if (!root || !scroller) return
    didInitialScrollRef.current = storageKey
    const saved = sessionStorage.getItem(storageKey)
    if (saved !== null) { scroller.scrollTop = Number(saved); return }
    const targetHour = day === today ? now.getHours() : dayEntries[0] ? hourForEntry(dayEntries[0]) : 0
    const row = root.querySelector<HTMLElement>(`[data-hour="${targetHour}"]`)
    if (row) scroller.scrollTop = Math.max(0, row.offsetTop - 180)
  }, [day, dayEntries, loading, now, routines.loading, storageKey, today])
  useEffect(() => {
    const root = timeViewRef.current
    const scroller = root?.closest<HTMLElement>('.health-events-content')
    if (!scroller) return
    const save = () => sessionStorage.setItem(storageKey, String(scroller.scrollTop))
    scroller.addEventListener('scroll', save, { passive: true })
    return () => { save(); scroller.removeEventListener('scroll', save) }
  }, [storageKey])

  const selectMonth = (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return
    const [year, monthNumber] = month.split('-').map(Number)
    const currentDay = parsePlainDate(day)?.day ?? 1
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    const selected = `${month}-${String(Math.min(currentDay, lastDay)).padStart(2, '0')}`
    onDayChange(selected > today ? today : selected)
  }
  const captureAnchor = () => {
    const root = timeViewRef.current; const scroller = root?.closest<HTMLElement>('.health-events-content')
    if (!root || !scroller) return null
    const item = [...root.querySelectorAll<HTMLElement>('[data-record-id], [data-routine-key]')].find((node) => node.getBoundingClientRect().bottom > scroller.getBoundingClientRect().top + 120)
    const key = item?.dataset.recordId ?? item?.dataset.routineKey
    return key && item ? { key, offset: item.getBoundingClientRect().top - scroller.getBoundingClientRect().top } : null
  }
  const toggleLayoutMode = () => {
    layoutAnchorRef.current = captureAnchor()
    const next = layoutMode === 'list' ? 'thumbnail' : 'list'
    setLayoutMode(next); setLayoutNotice(next === 'list' ? '已切换为列表视图' : '已切换为缩略图视图')
    if (layoutNoticeTimerRef.current !== null) window.clearTimeout(layoutNoticeTimerRef.current)
    layoutNoticeTimerRef.current = window.setTimeout(() => setLayoutNotice(''), 1500)
  }
  useLayoutEffect(() => {
    const anchor = layoutAnchorRef.current; const root = timeViewRef.current; const scroller = root?.closest<HTMLElement>('.health-events-content')
    if (!anchor || !root || !scroller) return
    const node = [...root.querySelectorAll<HTMLElement>('[data-record-id], [data-routine-key]')].find((item) => item.dataset.recordId === anchor.key || item.dataset.routineKey === anchor.key)
    if (node) scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset
    layoutAnchorRef.current = null
  }, [layoutMode])
  const itemsAtHour = (hour: number) => [
    ...dayEntries.filter((entry) => hourForEntry(entry) === hour).map((entry): GridItem => ({ key: `record:${entry.id}`, minute: new Date(entry.occurredAt).getMinutes(), kind: 'record', entry })),
    ...visibleTracks.filter((track) => hourForTrack(track) === hour).map((track): GridItem => ({ key: `routine:${track.trackKey}`, minute: Number(track.time.slice(3, 5)), kind: 'routine', track }))
  ].sort((left, right) => left.minute - right.minute || left.key.localeCompare(right.key))
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
  const currentScrollTop = () => timeViewRef.current?.closest<HTMLElement>('.health-events-content')?.scrollTop ?? 0

  return <section className="journal-time-view" data-layout-mode={layoutMode} aria-label="单日时间轴" ref={timeViewRef}>
    <div className="journal-date-navigation">
      <label className="journal-year-picker"><span>{day.slice(0, 4)}年</span><input aria-label="选择年月" max={today.slice(0, 7)} onChange={(event) => selectMonth(event.target.value)} type="month" value={day.slice(0, 7)} /></label>
      <span className="journal-yesterday-entry"><HohoButton size="icon" variant="ghost" aria-label="前一天" onClick={() => onDayChange(shiftJournalDate(day, -1))}><ChevronLeft size={22} /></HohoButton></span>
      <label className="journal-day-picker" aria-live="polite"><span>{relative} · <b>{formatPlainMonthDay(day)}</b></span><input aria-label="选择日期" max={today} onChange={(event) => onDayChange(event.target.value)} type="date" value={day} /></label>
      <HohoButton size="icon" variant="ghost" aria-label="后一天" disabled={day >= today} onClick={() => onDayChange(shiftJournalDate(day, 1))}><ChevronRight size={22} /></HohoButton>
      <HohoButton size="icon" variant="ghost" aria-label="搜索健康随身记" onClick={() => navigate('/health-events/search', { state: { journalReturn: { day, scrollTop: currentScrollTop() } } })}><Search size={18} /></HohoButton>
      <span className="journal-layout-switch"><HohoButton size="icon" variant="ghost" aria-label={layoutMode === 'list' ? '当前为列表视图，点击切换为缩略图视图' : '当前为缩略图视图，点击切换为列表视图'} onClick={toggleLayoutMode}>{layoutMode === 'list' ? <List size={18} /> : <LayoutGrid size={18} />}</HohoButton>{layoutNotice && <span className="journal-layout-notice" aria-live="polite" role="status">{layoutNotice}</span>}</span>
      <HohoButton size="icon" variant="ghost" aria-label={`记录顺序：${localSortOrder === 'desc' ? '最新在上' : '最新在下'}，点击切换`} aria-pressed={localSortOrder === 'asc'} onClick={() => setLocalSortOrder((value) => value === 'desc' ? 'asc' : 'desc')}><ArrowUpDown size={18} /></HohoButton>
    </div>
    <div className="routine-toolbar"><span>{routines.data.consent === 'enabled' ? '日常作息轨迹' : '全天时间轴'}</span><button onClick={() => setSetupOpen(true)} type="button"><Settings2 size={16} />{routines.data.consent === 'enabled' ? '调整作息' : '设置日常作息'}</button></div>
    {routines.data.consent === 'unset' && !routines.loading && <article className="routine-consent-card"><strong>把平常的作息留在时间轴上</strong><p>设置后每天都会显示轻量轨迹，不点也没关系，也不会发送催填提醒。</p><div><HohoButton onClick={() => setSetupOpen(true)}>设置作息</HohoButton><button onClick={async () => { await routineTrackService.setConsent(memberId, 'declined', token); refreshRoutines() }} type="button">暂不使用</button></div></article>}
    {(loading || routines.loading) && <div className="journal-grid-loading" role="status">正在加载时间轴…</div>}
    {error && <StatusNotice tone="error" title={entries.length ? '记录刷新失败，正在显示上次内容' : error} action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} />}
    {routines.error && <StatusNotice tone="error" title="日常作息加载失败" action={<HohoButton variant="secondary" onClick={routines.retry}>重新加载</HohoButton>} />}
    {activeSleep && day === today ? <article className="journal-active-sleep"><strong>{`等${memberName}醒来，点一下就能结束睡眠`}</strong><HohoButton onClick={() => onRecordOpen(activeSleep.eventId, activeSleep.id)} variant="secondary">结束睡眠</HohoButton></article> : selectedCard ? <TriggerOpportunityCard locale={triggerLocale} onAction={openTriggerCard} onDismiss={() => { setTriggerCardStatus(accountId, memberId, selectedCard.config.id, selectedCard.cycle, 'dismissed'); setCardRevision((value) => value + 1) }} selected={selectedCard} key={`${memberId}:${selectedCard.config.id}:${selectedCard.cycle}:${cardRevision}`} /> : null}
    <div className="journal-day-grid" aria-label={`${day} 全天时间轴`}>
      {hours.map((hour) => {
        const items = itemsAtHour(hour); const visible = items.slice(0, 2); const isCurrent = day === today && now.getHours() === hour
        const linePosition = localSortOrder === 'asc' ? minutePosition(now.getMinutes()) : 100 - minutePosition(now.getMinutes())
        return <section className={`journal-hour-row${isCurrent ? ' journal-hour-row--current' : ''}`} data-hour={hour} key={hour}>
          <div className="journal-hour-scale"><strong>{String(hour).padStart(2, '0')}:00</strong><span>15</span><span>30</span><span>45</span></div>
          <div className="journal-hour-content"><HourItems allEntries={dayEntries} items={visible} layoutMode={layoutMode} onRecordOpen={(entry) => onRecordOpen(entry.eventId, entry.id)} onRoutineOpen={openRoutineTrack} tracks={routines.data.tracks} />{items.length > 2 && <button className="journal-hour-more" onClick={() => setExpandedHour(hour)} type="button">还有 {items.length - 2} 条</button>}</div>
          {isCurrent && <div className="journal-current-line" style={{ top: `${linePosition}%` }}><span>{`现在 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</span><i /></div>}
        </section>
      })}
    </div>
    <RoutineSetupSheet effectiveFrom={today} memberId={memberId} onClose={() => setSetupOpen(false)} onSaved={refreshRoutines} open={setupOpen} routineDay={routines.data} token={token} />
    <RoutineTrackSheet memberId={memberId} now={now} onClose={() => setSelectedTrack(null)} onSaved={(message) => { refreshRoutines(); onRoutineRecorded?.(); showSaved(message) }} openTrack={selectedTrack} token={token} />
    <BottomSheetSurface label="这个小时的全部内容" onClose={() => setExpandedHour(null)} open={expandedHour !== null} title={expandedHour === null ? '这个小时' : `${String(expandedHour).padStart(2, '0')}:00`}>
      {expandedHour !== null && <div className="journal-hour-sheet"><HourItems allEntries={dayEntries} items={itemsAtHour(expandedHour)} layoutMode="thumbnail" onRecordOpen={(entry) => { setExpandedHour(null); onRecordOpen(entry.eventId, entry.id) }} onRoutineOpen={(track) => { setExpandedHour(null); openRoutineTrack(track) }} tracks={routines.data.tracks} /></div>}
    </BottomSheetSurface>
    {savedNotice && <div className="journal-saved-toast" aria-live="polite" role="status">{savedNotice}</div>}
  </section>
}
