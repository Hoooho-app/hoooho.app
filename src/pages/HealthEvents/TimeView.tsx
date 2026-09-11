import { ChevronLeft, ChevronRight, Paperclip } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HealthTimeline, ListSkeleton, StatusNotice, HohoButton, HealthTag } from '../../components/design-system'
import { formatPlainMonthDay, formatPlainWeekday, parsePlainDate } from '../../utils/localCalendarDate'
import { bowelOccurrenceNumber, journalCategoryLabels, journalDayGroups, journalListSummary, journalTime, journalUpdateLabel, shiftJournalDate } from './timeViewModel'
import { sleepTimelineSummary } from './sleepTime'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { useJournal } from './useJournal'
import { getTimelinePrompt, type TimelinePromptMode, type TimelinePromptTarget } from './timelinePrompt'
import { useAppStore } from '../../store/useAppStore'
import { JournalMemoryTypewriter } from './JournalMemoryTypewriter'

export function TimeView({ memberId, token, day, today, onDayChange, onRecordOpen, revision, onContext, sortOrder }: { memberId: string; token: string; day: string; today: string; onDayChange: (day: string) => void; onRecordOpen: (eventId: string, recordId: string) => void; revision: number; onContext: (context: { memberId: string; eventId: string | null }) => void; sortOrder: 'desc' | 'asc' }) {
  const { entries, loading, error, retry } = useJournal(memberId, token, revision)
  const memberName = useAppStore((state) => state.members.find((member) => member.id === memberId)?.name ?? '')
  const onPromptAction = (target: TimelinePromptTarget, mode: TimelinePromptMode) => window.dispatchEvent(new CustomEvent('hoooho:timeline-prompt', { detail: { target, mode, day } }))
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer) }, [])
  const contextEventId = entries[0]?.eventId ?? null
  useEffect(() => { onContext({ memberId, eventId: contextEventId }) }, [memberId, contextEventId, onContext])
  const groups = journalDayGroups(entries, day, sortOrder)
  const prompt = getTimelinePrompt(now, memberName, day, today, entries)
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
  return <section className="journal-time-view" aria-label="单日时间轴">
    <div className="journal-date-navigation">
      <label className="journal-year-picker"><span>{day.slice(0, 4)}年</span><input aria-label="选择年月" max={today.slice(0, 7)} onChange={(event) => selectMonth(event.target.value)} type="month" value={day.slice(0, 7)} /></label>
      <span className="journal-yesterday-entry"><HohoButton size="icon" variant="ghost" aria-label="前一天" onClick={() => onDayChange(shiftJournalDate(day, -1))}><ChevronLeft size={22} /></HohoButton></span>
      <label className="journal-day-picker" aria-live="polite"><span>{relative} · <b>{formatPlainMonthDay(day)}</b></span><input aria-label="选择日期" max={today} onChange={(event) => onDayChange(event.target.value)} type="date" value={day} /></label>
      <HohoButton size="icon" variant="ghost" aria-label="后一天" disabled={day >= today} onClick={() => onDayChange(shiftJournalDate(day, 1))}><ChevronRight size={22} /></HohoButton>
    </div>
    {loading ? <ListSkeleton rows={4} /> : error ? <StatusNotice tone="error" title={error} action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} /> : <>
      {day === today && <div className="journal-now-marker"><span>{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</span><strong>现在</strong></div>}
      {activeSleep && day === today ? <article className="journal-active-sleep"><strong>{`等${memberName}醒来，点一下就能结束睡眠`}</strong><HohoButton onClick={() => onRecordOpen(activeSleep.eventId, activeSleep.id)} variant="secondary">结束睡眠</HohoButton></article> : prompt ? <article className="journal-memory-prompt"><span className="journal-memory-eyebrow"><i aria-hidden="true" />{prompt.eyebrow}</span><strong>{prompt.question}</strong><button className="journal-memory-action" onClick={() => onPromptAction(prompt.target, prompt.mode)} type="button"><JournalCategoryIcon category={prompt.target} /><span>{prompt.action}</span><ChevronRight aria-hidden="true" size={17} /></button><JournalMemoryTypewriter key={memberId} /></article> : null}
      {groups.length > 0 && <HealthTimeline ariaLabel={`当天记录，${sortOrder === 'desc' ? '较新的在上方' : '较早的在上方'}`} level="detail" className="journal-timeline" items={groups.map((group) => ({
        id: group.label, label: group.label,
        content: <div className="journal-hour-records">{group.items.map((entry) => <button className="journal-record" key={entry.id} type="button" onClick={() => onRecordOpen(entry.eventId, entry.id)}>
          <span className="journal-record-time">{journalTime(entry).label}</span>
          <JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} dietKind={entry.diet?.kind} />
          <span className="journal-record-tags">{entry.categories?.includes('elimination') && <HealthTag>{`今天第${bowelOccurrenceNumber(entries, entry)}次`}</HealthTag>}{entry.sleep?.quality && <HealthTag>{entry.sleep.quality}</HealthTag>}{(entry.categories?.length ? entry.categories : ['other'] as const).map((category) => <HealthTag key={category}>{category === 'medication' && (entry.medication?.medications?.length ?? 0) > 1 ? `用药 · 共${entry.medication!.medications!.length}种` : journalCategoryLabels[category]}</HealthTag>)}</span>
          <span className="journal-record-content"><span className="journal-record-summary">{entry.sleep ? sleepTimelineSummary(entry.sleep.kind, entry.sleep.durationMinutes) : journalListSummary(entry)}</span>{entry.updateCount ? <span className="journal-record-update-meta">{journalUpdateLabel(entry)}</span> : null}{entry.attachmentCount > 0 && <span className="journal-attachment" aria-label={`${entry.attachmentCount} 个附件`}><Paperclip size={13} />{entry.attachmentCount}</span>}</span>
          <ChevronRight aria-hidden="true" className="text-text-secondary" size={16} />
        </button>)}</div>
      }))} />}
      {groups.length > 0 && <p className="journal-gentle-status">今天的事情，正在一点点记清楚</p>}
    </>}
  </section>
}
