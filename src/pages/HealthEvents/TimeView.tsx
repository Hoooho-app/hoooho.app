import { ArrowUpDown, ChevronLeft, ChevronRight, LayoutGrid, List, Paperclip, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HealthTimeline, ListSkeleton, StatusNotice, HohoButton, HealthTag } from '../../components/design-system'
import { formatPlainMonthDay, formatPlainWeekday, parsePlainDate } from '../../utils/localCalendarDate'
import { bowelOccurrenceNumber, journalCategoryLabels, journalDayGroups, journalListSummary, journalTime, journalUpdateLabel, shiftJournalDate, type JournalEntry } from './timeViewModel'
import { symptomLocationDisplay, visibleSymptomKeywords } from './symptomRecordLogic'
import { sleepTimelineSummary } from './sleepTime'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { useJournal } from './useJournal'
import { useAppStore } from '../../store/useAppStore'
import { TriggerOpportunityCard } from './TriggerOpportunityCard'
import { resolveTriggerLocale } from './triggerOpportunityI18n'
import { selectTriggerOpportunity } from './triggerOpportunitySelector'
import { readTriggerCardStatus, setTriggerCardStatus, triggerSuggestionKey } from './triggerOpportunityState'

function symptomFacts(entry: JournalEntry) {
  const narrative = entry.symptom?.narrative ?? entry.content
  return {
    keywords: visibleSymptomKeywords(narrative, entry.symptom?.keywords ?? []).join(' · '),
    location: symptomLocationDisplay(entry.symptom),
  }
}

export function TimeView({ memberId, token, day, today, onDayChange, onRecordOpen, revision, onContext, sortOrder }: { memberId: string; token: string; day: string; today: string; onDayChange: (day: string) => void; onRecordOpen: (eventId: string, recordId: string) => void; revision: number; onContext: (context: { memberId: string; eventId: string | null }) => void; sortOrder: 'desc' | 'asc' }) {
  const navigate = useNavigate()
  const [layoutMode, setLayoutMode] = useState<'list' | 'thumbnail'>('list')
  const [layoutNotice, setLayoutNotice] = useState('')
  const timeViewRef = useRef<HTMLElement>(null)
  const layoutNoticeTimerRef = useRef<number | null>(null)
  const layoutAnchorRef = useRef<{ recordId: string; offset: number } | null>(null)
  const [localSortOrder, setLocalSortOrder] = useState(sortOrder)
  const { entries, loading, error, retry } = useJournal(memberId, token, revision)
  const memberName = useAppStore((state) => state.members.find((member) => member.id === memberId)?.name ?? '')
  const accountId = useAppStore((state) => state.authUser?.id ?? 'guest')
  const [cardRevision, setCardRevision] = useState(0)
  const [triggerLocale, setTriggerLocale] = useState(() => resolveTriggerLocale())
  useEffect(() => () => {
    if (layoutNoticeTimerRef.current !== null) window.clearTimeout(layoutNoticeTimerRef.current)
  }, [])
  useEffect(() => {
    const update = () => setTriggerLocale(resolveTriggerLocale())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    window.addEventListener('languagechange', update)
    return () => { observer.disconnect(); window.removeEventListener('languagechange', update) }
  }, [])
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer) }, [])
  const contextEventId = entries[0]?.eventId ?? null
  useEffect(() => { onContext({ memberId, eventId: contextEventId }) }, [memberId, contextEventId, onContext])
  const groups = journalDayGroups(entries, day, localSortOrder)
  const selectedCard = selectTriggerOpportunity(now, day, today, entries, (cardId, cycle) => Boolean(readTriggerCardStatus(accountId, memberId, cardId, cycle)))
  const openTriggerCard = (optionIndex?: 0 | 1) => {
    if (!selectedCard) return
    const detail = { target: selectedCard.config.category, mode: day === today ? selectedCard.config.mode : 'backfill', day, prefill: optionIndex === undefined ? {} : selectedCard.config.prefill[optionIndex], accountId, memberId, cardId: selectedCard.config.id, cycle: selectedCard.cycle, relatedEventId: selectedCard.prerequisiteEntry?.eventId, relatedRecordId: selectedCard.prerequisiteEntry?.id }
    sessionStorage.setItem(triggerSuggestionKey, JSON.stringify(detail))
    window.dispatchEvent(new CustomEvent('hoooho:timeline-prompt', { detail }))
  }
  const activeSleep = entries.find((entry) => entry.sleep?.status === 'ongoing')
  const yesterday = shiftJournalDate(today, -1)
  const relative = day === today ? '今天' : day === yesterday ? '昨天' : formatPlainWeekday(day)
  const selectMonth = (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return
    const [year, monthNumber] = month.split('-').map(Number)
    const currentDay = parsePlainDate(day)?.day ?? 1
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
    const selected = `${month}-${String(Math.min(currentDay, lastDay)).padStart(2, '0')}`
    onDayChange(selected > today ? today : selected)
  }
  const captureVisibleRecord = () => {
    const root = timeViewRef.current
    const scroller = root?.closest<HTMLElement>('.health-events-content')
    if (!root || !scroller) return null
    const scrollerRect = scroller.getBoundingClientRect()
    const navigationBottom = root.querySelector('.journal-date-navigation')?.getBoundingClientRect().bottom ?? scrollerRect.top
    const visibleTop = Math.max(scrollerRect.top, navigationBottom)
    const record = [...root.querySelectorAll<HTMLElement>('.journal-record[data-record-id]')].find((item) => item.getBoundingClientRect().bottom > visibleTop)
    return record?.dataset.recordId ? { recordId: record.dataset.recordId, offset: record.getBoundingClientRect().top - scrollerRect.top } : null
  }
  const toggleLayoutMode = () => {
    layoutAnchorRef.current = captureVisibleRecord()
    const nextMode = layoutMode === 'list' ? 'thumbnail' : 'list'
    setLayoutMode(nextMode)
    setLayoutNotice(nextMode === 'list' ? '已切换为列表视图' : '已切换为缩略图视图')
    if (layoutNoticeTimerRef.current !== null) window.clearTimeout(layoutNoticeTimerRef.current)
    layoutNoticeTimerRef.current = window.setTimeout(() => setLayoutNotice(''), 1500)
  }
  useLayoutEffect(() => {
    const anchor = layoutAnchorRef.current
    const root = timeViewRef.current
    const scroller = root?.closest<HTMLElement>('.health-events-content')
    if (!anchor || !root || !scroller) return
    const record = [...root.querySelectorAll<HTMLElement>('.journal-record[data-record-id]')].find((item) => item.dataset.recordId === anchor.recordId)
    if (record) scroller.scrollTop += record.getBoundingClientRect().top - scroller.getBoundingClientRect().top - anchor.offset
    layoutAnchorRef.current = null
  }, [layoutMode])
  return <section className="journal-time-view" data-layout-mode={layoutMode} aria-label="单日时间轴" ref={timeViewRef}>
    <div className="journal-date-navigation">
      <label className="journal-year-picker"><span>{day.slice(0, 4)}年</span><input aria-label="选择年月" max={today.slice(0, 7)} onChange={(event) => selectMonth(event.target.value)} type="month" value={day.slice(0, 7)} /></label>
      <span className="journal-yesterday-entry"><HohoButton size="icon" variant="ghost" aria-label="前一天" onClick={() => onDayChange(shiftJournalDate(day, -1))}><ChevronLeft size={22} /></HohoButton></span>
      <label className="journal-day-picker" aria-live="polite"><span>{relative} · <b>{formatPlainMonthDay(day)}</b></span><input aria-label="选择日期" max={today} onChange={(event) => onDayChange(event.target.value)} type="date" value={day} /></label>
      <HohoButton size="icon" variant="ghost" aria-label="后一天" disabled={day >= today} onClick={() => onDayChange(shiftJournalDate(day, 1))}><ChevronRight size={22} /></HohoButton>
      <HohoButton size="icon" variant="ghost" aria-label="搜索健康随身记" onClick={() => navigate('/health-events/search', { state: { journalReturn: { day, scrollTop: 0 } } })}><Search size={18} /></HohoButton>
      <span className="journal-layout-switch">
        <HohoButton size="icon" variant="ghost" aria-label={layoutMode === 'list' ? '当前为列表视图，点击切换为缩略图视图' : '当前为缩略图视图，点击切换为列表视图'} onClick={toggleLayoutMode}>{layoutMode === 'list' ? <List size={18} /> : <LayoutGrid size={18} />}</HohoButton>
        {layoutNotice && <span className="journal-layout-notice" aria-live="polite" role="status">{layoutNotice}</span>}
      </span>
      <HohoButton size="icon" variant="ghost" aria-label={`记录顺序：${localSortOrder === 'desc' ? '最新在上' : '最新在下'}，点击切换`} aria-pressed={localSortOrder === 'asc'} onClick={() => setLocalSortOrder((value) => value === 'desc' ? 'asc' : 'desc')}><ArrowUpDown size={18} /></HohoButton>
    </div>
    {loading ? <ListSkeleton rows={4} /> : error && entries.length === 0 ? <StatusNotice tone="error" title={error} action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} /> : <>
      {error && <div className="journal-refresh-error"><span>刷新失败，正在显示上次内容</span><button onClick={retry} type="button">重新加载</button></div>}
      {day === today && <div className="journal-now-marker"><span>{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</span><strong>现在</strong></div>}
      {activeSleep && day === today ? <article className="journal-active-sleep"><strong>{`等${memberName}醒来，点一下就能结束睡眠`}</strong><HohoButton onClick={() => onRecordOpen(activeSleep.eventId, activeSleep.id)} variant="secondary">结束睡眠</HohoButton></article> : selectedCard ? <TriggerOpportunityCard locale={triggerLocale} onAction={openTriggerCard} onDismiss={() => { setTriggerCardStatus(accountId, memberId, selectedCard.config.id, selectedCard.cycle, 'dismissed'); setCardRevision((value) => value + 1) }} selected={selectedCard} key={`${memberId}:${selectedCard.config.id}:${selectedCard.cycle}:${cardRevision}`} /> : null}
      {groups.length > 0 && <HealthTimeline ariaLabel={`当天记录，${localSortOrder === 'desc' ? '较新的在上方' : '较早的在上方'}`} level="detail" className="journal-timeline" items={groups.map((group) => ({
        id: group.label, label: group.label,
        content: <div className="journal-hour-records">{group.items.map((entry) => { const facts = symptomFacts(entry); return <button className={`journal-record${entry.symptom ? ' journal-record--symptom' : ''}${layoutMode === 'thumbnail' ? ' journal-record--thumbnail' : ''}`} data-record-id={entry.id} key={entry.id} type="button" onClick={() => onRecordOpen(entry.eventId, entry.id)}>
          <span className="journal-record-time">{journalTime(entry).label}</span>
          <JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} dietKind={entry.diet?.kind} />
          <span className="journal-record-tags">{entry.categories?.includes('elimination') && <HealthTag>{`今天第${bowelOccurrenceNumber(entries, entry)}次`}</HealthTag>}{entry.sleep?.quality && <HealthTag>{entry.sleep.quality}</HealthTag>}{(entry.categories?.length ? entry.categories : ['other'] as const).map((category) => <HealthTag key={category}>{category === 'medication' && (entry.medication?.medications?.length ?? 0) > 1 ? `用药 · 共${entry.medication!.medications!.length}种` : journalCategoryLabels[category]}</HealthTag>)}</span>
          <span className="journal-record-content"><span className="journal-record-summary">{entry.sleep ? sleepTimelineSummary(entry.sleep.kind, entry.sleep.durationMinutes) : journalListSummary(entry)}</span>{facts.keywords ? <span className="journal-symptom-facts">{facts.keywords}</span> : null}{facts.location ? <span className="journal-symptom-facts">{facts.location}</span> : null}{entry.updateCount ? <span className="journal-record-update-meta">{journalUpdateLabel(entry)}</span> : null}{entry.attachmentCount > 0 && <span className="journal-attachment" aria-label={`${entry.attachmentCount} 个附件`}><Paperclip size={13} />{entry.attachmentCount}</span>}</span>
          <ChevronRight aria-hidden="true" className="text-text-secondary" size={16} />
        </button> })}</div>
      }))} />}
      {groups.length === 0 && day !== today && <div className="journal-empty-day"><strong>这一天还没有记录</strong></div>}
      {groups.length > 0 && day === today && <p className="journal-gentle-status">今天的事情，正在一点点记清楚</p>}
    </>}
  </section>
}
