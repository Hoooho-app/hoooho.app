import { ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, List, Paperclip, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HealthTimeline, ListSkeleton, StatusNotice, HohoButton, HealthTag } from '../../components/design-system'
import { formatPlainMonthDay, formatPlainWeekday, getLocalDateKey, parsePlainDate } from '../../utils/localCalendarDate'
import { bowelOccurrenceNumber, journalCategoryLabels, journalDayGroups, journalListSummary, journalTime, journalUpdateLabel, shiftJournalDate } from './timeViewModel'
import { sleepTimelineSummary } from './sleepTime'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { useJournal } from './useJournal'
import { useAppStore } from '../../store/useAppStore'
import { TriggerOpportunityCard } from './TriggerOpportunityCard'
import { resolveTriggerLocale } from './triggerOpportunityI18n'
import { selectTriggerOpportunity } from './triggerOpportunitySelector'
import { readTriggerCardStatus, setTriggerCardStatus, triggerSuggestionKey } from './triggerOpportunityState'

export function TimeView({ memberId, token, day, today, onDayChange, onRecordOpen, revision, onContext, sortOrder }: { memberId: string; token: string; day: string; today: string; onDayChange: (day: string) => void; onRecordOpen: (eventId: string, recordId: string) => void; revision: number; onContext: (context: { memberId: string; eventId: string | null }) => void; sortOrder: 'desc' | 'asc' }) {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<'day' | 'month'>('day')
  const [localSortOrder, setLocalSortOrder] = useState(sortOrder)
  const { entries, loading, error, retry } = useJournal(memberId, token, revision)
  const memberName = useAppStore((state) => state.members.find((member) => member.id === memberId)?.name ?? '')
  const accountId = useAppStore((state) => state.authUser?.id ?? 'guest')
  const [cardRevision, setCardRevision] = useState(0)
  const [triggerLocale, setTriggerLocale] = useState(() => resolveTriggerLocale())
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
  const monthEntries = entries.filter((entry) => getLocalDateKey(entry.occurredAt)?.slice(0, 7) === day.slice(0, 7))
  const monthDays = [...new Set(monthEntries.map((entry) => getLocalDateKey(entry.occurredAt)).filter((value): value is string => Boolean(value)))].sort((a, b) => localSortOrder === 'desc' ? b.localeCompare(a) : a.localeCompare(b))
  const groups = viewMode === 'day' ? journalDayGroups(entries, day, localSortOrder) : monthDays.map((date) => ({ label: `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`, items: journalDayGroups(entries, date, localSortOrder).flatMap((group) => group.items) }))
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
  const shiftMonth = (amount: number) => {
    const parts = parsePlainDate(day); if (!parts) return
    const target = new Date(parts.year, parts.month - 1 + amount, 1, 12)
    const next = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-01`
    onDayChange(next > today ? today : next)
  }
  return <section className="journal-time-view" aria-label="单日时间轴">
    <div className="journal-date-navigation">
      <label className="journal-year-picker"><span>{day.slice(0, 4)}年</span><input aria-label="选择年月" max={today.slice(0, 7)} onChange={(event) => selectMonth(event.target.value)} type="month" value={day.slice(0, 7)} /></label>
      <HohoButton className="journal-view-toggle" size="icon" variant="ghost" aria-label={viewMode === 'day' ? '切换到月视图' : '切换到日视图'} onClick={() => setViewMode((value) => value === 'day' ? 'month' : 'day')}>{viewMode === 'day' ? <List size={18} /> : <CalendarDays size={18} />}</HohoButton>
      <span className="journal-yesterday-entry"><HohoButton size="icon" variant="ghost" aria-label={viewMode === 'day' ? '前一天' : '上个月'} onClick={() => viewMode === 'day' ? onDayChange(shiftJournalDate(day, -1)) : shiftMonth(-1)}><ChevronLeft size={22} /></HohoButton></span>
      <label className="journal-day-picker" aria-live="polite"><span>{viewMode === 'day' ? <>{relative} · <b>{formatPlainMonthDay(day)}</b></> : <><b>{Number(day.slice(5, 7))}月</b>{day.slice(0, 7) === today.slice(0, 7) ? ' · 本月' : ''}</>}</span><input aria-label={viewMode === 'day' ? '选择日期' : '选择月份'} max={viewMode === 'day' ? today : today.slice(0, 7)} onChange={(event) => viewMode === 'day' ? onDayChange(event.target.value) : selectMonth(event.target.value)} type={viewMode === 'day' ? 'date' : 'month'} value={viewMode === 'day' ? day : day.slice(0, 7)} /></label>
      <HohoButton size="icon" variant="ghost" aria-label={viewMode === 'day' ? '后一天' : '下个月'} disabled={viewMode === 'day' ? day >= today : day.slice(0, 7) >= today.slice(0, 7)} onClick={() => viewMode === 'day' ? onDayChange(shiftJournalDate(day, 1)) : shiftMonth(1)}><ChevronRight size={22} /></HohoButton>
      <HohoButton size="icon" variant="ghost" aria-label="搜索健康随身记" onClick={() => navigate('/health-events/search', { state: { journalReturn: { day, scrollTop: 0 } } })}><Search size={18} /></HohoButton>
      <HohoButton size="icon" variant="ghost" aria-label="切换记录顺序" onClick={() => setLocalSortOrder((value) => value === 'desc' ? 'asc' : 'desc')}><ArrowUpDown size={18} /></HohoButton>
    </div>
    {loading ? <ListSkeleton rows={4} /> : error ? <StatusNotice tone="error" title={error} action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} /> : <>
      {viewMode === 'day' && day === today && <div className="journal-now-marker"><span>{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</span><strong>现在</strong></div>}
      {viewMode === 'day' && (activeSleep && day === today ? <article className="journal-active-sleep"><strong>{`等${memberName}醒来，点一下就能结束睡眠`}</strong><HohoButton onClick={() => onRecordOpen(activeSleep.eventId, activeSleep.id)} variant="secondary">结束睡眠</HohoButton></article> : selectedCard ? <TriggerOpportunityCard locale={triggerLocale} onAction={openTriggerCard} onDismiss={() => { setTriggerCardStatus(accountId, memberId, selectedCard.config.id, selectedCard.cycle, 'dismissed'); setCardRevision((value) => value + 1) }} selected={selectedCard} key={`${memberId}:${selectedCard.config.id}:${selectedCard.cycle}:${cardRevision}`} /> : null)}
      {groups.length > 0 && <HealthTimeline ariaLabel={`当天记录，${sortOrder === 'desc' ? '较新的在上方' : '较早的在上方'}`} level="detail" className="journal-timeline" items={groups.map((group) => ({
        id: group.label, label: group.label,
        content: <div className="journal-hour-records">{group.items.map((entry) => <button className={`journal-record${viewMode === 'day' && entry.symptom ? ' journal-record--symptom' : ''}`} key={entry.id} type="button" onClick={() => onRecordOpen(entry.eventId, entry.id)}>
          <span className="journal-record-time">{journalTime(entry).label}</span>
          <JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} dietKind={entry.diet?.kind} />
          <span className="journal-record-tags">{entry.categories?.includes('elimination') && <HealthTag>{`今天第${bowelOccurrenceNumber(entries, entry)}次`}</HealthTag>}{entry.sleep?.quality && <HealthTag>{entry.sleep.quality}</HealthTag>}{(entry.categories?.length ? entry.categories : ['other'] as const).map((category) => <HealthTag key={category}>{category === 'medication' && (entry.medication?.medications?.length ?? 0) > 1 ? `用药 · 共${entry.medication!.medications!.length}种` : journalCategoryLabels[category]}</HealthTag>)}</span>
          <span className="journal-record-content"><span className="journal-record-summary">{entry.sleep ? sleepTimelineSummary(entry.sleep.kind, entry.sleep.durationMinutes) : journalListSummary(entry)}</span>{entry.symptom?.keywords?.length ? <span className="journal-symptom-facts">{entry.symptom.keywords.join(' · ')}</span> : null}{entry.symptom?.locationText ? <span className="journal-symptom-facts">{entry.symptom.locationText}</span> : null}{entry.updateCount ? <span className="journal-record-update-meta">{journalUpdateLabel(entry)}</span> : null}{entry.attachmentCount > 0 && <span className="journal-attachment" aria-label={`${entry.attachmentCount} 个附件`}><Paperclip size={13} />{entry.attachmentCount}</span>}</span>
          <ChevronRight aria-hidden="true" className="text-text-secondary" size={16} />
        </button>)}</div>
      }))} />}
      {groups.length > 0 && <p className="journal-gentle-status">今天的事情，正在一点点记清楚</p>}
    </>}
  </section>
}
