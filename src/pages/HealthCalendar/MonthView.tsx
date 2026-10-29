import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { calendarMonthDays } from './model'
import { calendarDayInfo } from './holidays'
import { calendarRecordTone, presentCalendarRecord } from './presentation'
import { monthOccurrenceEntries } from './navigation'
import { AlarmClock } from '../../components/icons'
import type { CalendarReminder } from './reminders'
import { shiftJournalDate } from '../HealthEvents/timeViewModel'
import type { JournalEntry } from '../HealthEvents/timeViewModel'
import '../NurseStation/HomeFlows.css'
import './calendar.css'

export function MonthView({ month, today, day, category, entries, reminders = new Map(), loading, error, onRetry, onDay }: { month: string; today: string; day: string; category: string; entries: readonly JournalEntry[]; reminders?: ReadonlyMap<string, readonly CalendarReminder[]>; loading: boolean; error: string; onRetry: () => void; onDay: (day: string) => void }) {
  const dates = useMemo(() => {
    const original = calendarMonthDays(month), offset = original.findIndex(Boolean)
    return Array.from({ length: Math.ceil(original.length / 7) * 7 }, (_, index) => shiftJournalDate(`${month}-01`, index - offset))
  }, [month]), weeks = Math.ceil(dates.length / 7)
  const records = useMemo(() => new Map([...new Set(dates.map(date => date.slice(0, 7)))].flatMap(visibleMonth => [...monthOccurrenceEntries(entries, visibleMonth)])), [entries, dates])
  const grid = useRef<HTMLDivElement>(null), [limit, setLimit] = useState(0)
  useLayoutEffect(() => {
    const node = grid.current
    if (!node) return
    const resize = () => {
      const cell = node.querySelector<HTMLElement>('.health-calendar__day')
      if (!cell) return
      const line = parseFloat(getComputedStyle(node).fontSize) * 1.4 + 2
      setLimit(Math.max(0, Math.min(5, Math.floor((cell.clientHeight - 32) / line))))
    }
    const observer = new ResizeObserver(resize); observer.observe(node); resize()
    return () => observer.disconnect()
  }, [month, weeks])
  return <section className="health-calendar__month" aria-label="月历" aria-busy={loading}>
    {loading && <div className="calendar-loading" role="status">正在读取记录…</div>}
    {error && <StatusNotice tone="error" title={error} action={<HohoButton variant="secondary" size="small" onClick={onRetry}>重新加载</HohoButton>}/>}
    <span aria-hidden="true" className="home-paper-fold"/>
    <div className="health-calendar__grid" ref={grid} style={{ '--calendar-weeks': weeks } as CSSProperties}>
      {['一', '二', '三', '四', '五', '六', '日'].map((label, index) => <span className="health-calendar__weekday" data-weekend={index > 4} key={label}>{label}</span>)}
      {Array.from({ length: weeks * 7 }, (_, index) => {
        const date = dates[index]
        if (!date) return <span className="health-calendar__blank" key={`blank-${index}`}/>
        const info = calendarDayInfo(date), currentMonth = date.startsWith(`${month}-`), items = records.get(date) ?? [], planned = currentMonth ? reminders.get(date) ?? [] : []
        const capacity = info.festival ? Math.max(0, limit - 1) : limit
        const visibleLimit = planned.length ? Math.max(0, capacity - 1) : capacity, hidden = Math.max(0, items.length - visibleLimit)
        return <button type="button" className="health-calendar__day" key={date} data-outside={!currentMonth} data-today={date === today} data-selected={date === day} data-weekend={index % 7 > 4} data-rest={info.rest} data-work={info.work} aria-current={date === today ? 'date' : undefined} aria-label={`${date}，${info.description}${date === today ? '，今天' : ''}，${items.length}条记录${planned.length ? `，${planned.length}项待办` : ''}`} onClick={() => onDay(date)}>
          <span className="health-calendar__date-heading"><span className="health-calendar__date-number">{Number(date.slice(8))}</span>{(info.rest || info.work) && <span className="health-calendar__holiday-marker">{info.work ? '班' : '休'}</span>}</span>
          {info.festival && <span className="health-calendar__festival">{info.festival}</span>}
          <span className="health-calendar__previews">{items.slice(0, visibleLimit).map(entry => {
            const summary = presentCalendarRecord(entry)
            return <span className="health-calendar__preview" key={entry.id} data-tone={calendarRecordTone(entry)} title={summary.fullDetail}>{summary.monthSummary}</span>
          })}</span>
          {hidden > 0 && <span className="health-calendar__more">+{hidden}</span>}
          {planned.length > 0 && <span className="health-calendar__reminders"><AlarmClock size={13} strokeWidth={1.7} aria-hidden="true"/>{planned.length}</span>}
        </button>
      })}
    </div>
  </section>
}
