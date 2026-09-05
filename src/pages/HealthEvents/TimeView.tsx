import { ChevronLeft, ChevronRight, Paperclip } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { EmptyState, HealthTimeline, ListSkeleton, StatusNotice, HohoButton, HealthTag } from '../../components/design-system'
import { formatPlainMonthDay } from '../../utils/localCalendarDate'
import { journalCategoryLabels, journalDayGroups, journalTime, shiftJournalDate } from './timeViewModel'
import { JournalCategoryIcon } from './JournalCategoryIcon'
import { useJournal } from './useJournal'

export function TimeView({ memberId, token, day, today, onDayChange, revision, onContext }: { memberId: string; token: string; day: string; today: string; onDayChange: (day: string) => void; revision: number; onContext: (context: { memberId: string; eventId: string | null }) => void }) {
  const navigate = useNavigate()
  const { entries, loading, error, retry } = useJournal(memberId, token, revision)
  const contextEventId = entries[0]?.eventId ?? null
  useEffect(() => { onContext({ memberId, eventId: contextEventId }) }, [memberId, contextEventId, onContext])
  const groups = journalDayGroups(entries, day)
  const relative = day === today ? '今天 · ' : day === shiftJournalDate(today, -1) ? '昨天 · ' : ''
  return <section className="journal-time-view" aria-label="单日时间轴">
    <div className="journal-date-navigation">
      <HohoButton size="icon" variant="ghost" aria-label="前一天" onClick={() => onDayChange(shiftJournalDate(day, -1))}><ChevronLeft size={22} /></HohoButton>
      <h2 className="hoho-text-section-title" aria-live="polite">{relative}{day.slice(0, 4) !== today.slice(0, 4) ? `${day.slice(0, 4)}年` : ''}{formatPlainMonthDay(day)}</h2>
      <HohoButton size="icon" variant="ghost" aria-label="后一天" disabled={day >= today} onClick={() => onDayChange(shiftJournalDate(day, 1))}><ChevronRight size={22} /></HohoButton>
    </div>
    {day !== today && <div className="journal-return-today"><HohoButton size="small" variant="text" onClick={() => onDayChange(today)}>回到今天</HohoButton></div>}
    {loading ? <ListSkeleton rows={4} /> : error ? <StatusNotice tone="error" title={error} action={<HohoButton variant="secondary" onClick={retry}>重新加载</HohoButton>} /> : groups.length === 0 ? <EmptyState title="这一天还没有记录" description="饮食、活动或身体变化，都可以记下来。" /> :
      <HealthTimeline ariaLabel="当天记录，较新的在上方" level="detail" className="journal-timeline" items={groups.map((group) => ({
        id: group.label, label: group.label,
        content: <div className="journal-hour-records">{group.items.map((entry) => <button className="journal-record" key={entry.id} type="button" onClick={() => navigate(`/health-events/${encodeURIComponent(entry.eventId)}`)}>
          <span className="journal-record-time">{journalTime(entry).label}</span>
          <JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} />
          <span className="journal-record-content"><span className="journal-record-summary">{entry.content}</span><span className="journal-record-tags">{(entry.categories?.length ? entry.categories : ['other'] as const).map((category) => <HealthTag key={category}>{journalCategoryLabels[category]}</HealthTag>)}{entry.attachmentCount > 0 && <span className="journal-attachment" aria-label={`${entry.attachmentCount} 个附件`}><Paperclip size={13} />{entry.attachmentCount}</span>}</span></span>
          <ChevronRight aria-hidden="true" className="text-text-secondary" size={16} />
        </button>)}</div>
      }))} />}
  </section>
}
