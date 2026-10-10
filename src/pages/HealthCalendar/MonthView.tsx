import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { HohoButton, StatusNotice } from '../../components/design-system'
import { calendarMonthDays } from './model'
import { calendarDayInfo } from './holidays'
import { calendarCategoryLabels, calendarRecordTone } from './presentation'
import { monthOccurrenceEntries } from './navigation'
import { journalListSummary, type JournalEntry } from '../HealthEvents/timeViewModel'
import './calendar.css'

export function MonthView({ month, today, day, category, entries, loading, error, onRetry, onDay }: { month: string; today: string; day: string; category: string; entries: readonly JournalEntry[]; loading: boolean; error: string; onRetry: () => void; onDay: (day: string) => void }) {
  const dates = useMemo(() => calendarMonthDays(month), [month]), weeks = Math.ceil(dates.length / 7)
  const records = useMemo(() => monthOccurrenceEntries(entries, month), [entries, month])
  const grid = useRef<HTMLDivElement>(null), [limit, setLimit] = useState(0)
  useLayoutEffect(() => {
    const node = grid.current
    if (!node) return
    const resize = () => {
      const cell = node.querySelector<HTMLElement>('.health-calendar__day')
      if (!cell) return
      const line = parseFloat(getComputedStyle(node).fontSize) * 1.4 + 2
      setLimit(Math.max(0, Math.min(5, Math.floor((cell.clientHeight - 48) / line))))
    }
    const observer = new ResizeObserver(resize); observer.observe(node); resize()
    return () => observer.disconnect()
  }, [month, weeks])
  return <section className="health-calendar__month" aria-label="月历" aria-busy={loading}>
    {loading && <div className="calendar-loading" role="status">正在读取记录…</div>}
    {error && <StatusNotice tone="error" title={error} action={<HohoButton variant="secondary" size="small" onClick={onRetry}>重新加载</HohoButton>}/>}
    <div className="health-calendar__grid" ref={grid} style={{ '--calendar-weeks': weeks } as CSSProperties}>
      {['一', '二', '三', '四', '五', '六', '日'].map((label, index) => <span className="health-calendar__weekday" data-weekend={index > 4} key={label}>{label}</span>)}
      {Array.from({ length: weeks * 7 }, (_, index) => {
        const date = dates[index]
        if (!date) return <span className="health-calendar__blank" key={`blank-${index}`}/>
        const info = calendarDayInfo(date), items = records.get(date) ?? [], hidden = Math.max(0, items.length - limit)
        return <button type="button" className="health-calendar__day" key={date} data-today={date === today} data-selected={date === day} data-weekend={index % 7 > 4} data-rest={info.rest} data-work={info.work} aria-current={date === today ? 'date' : undefined} aria-label={`${date}，${info.description}${date === today ? '，今天' : ''}，${items.length}条记录`} disabled={date > today} onClick={() => onDay(date)}>
          <span className="health-calendar__date-heading"><span className="health-calendar__date-number">{Number(date.slice(8))}</span>{(info.rest || info.work) && <span className="health-calendar__holiday-marker">{info.work ? '班' : '休'}</span>}</span>
          {info.festival && <span className="health-calendar__festival">{info.festival}</span>}
          <span className="health-calendar__previews">{items.slice(0, limit).map(entry => {
            const summary = journalListSummary(entry), label = calendarCategoryLabels[entry.categories?.[0] ?? 'other']
            return <span className="health-calendar__preview" key={entry.id} data-tone={calendarRecordTone(entry.categories, category)} title={summary}>{summary.startsWith(label) ? summary : `${label}·${summary}`}</span>
          })}</span>
          {hidden > 0 && <span className="health-calendar__more">+{hidden}</span>}
        </button>
      })}
    </div>
  </section>
}
