import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MainAppHeader } from '../../components/navigation'
import { BottomSheetSurface, EmptyState, HohoButton } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { getLocalDateKey, parsePlainDate, formatPlainMonthDay } from '../../utils/localCalendarDate'
import { JournalRecordDetail } from '../HealthEvents/JournalRecordDetail'
import { journalListSummary } from '../HealthEvents/timeViewModel'
import { calendarCategories, calendarItems, calendarMonthDays, calendarTime, scopeEntries, type CalendarEntry } from './model'
import type { JournalCategory } from '../../types/journal'
import { CalendarRecorder } from './CalendarRecorder'
import { calendarCategoryLabels, calendarRecordTone } from './presentation'
import { calendarDayInfo } from './holidays'
import { useCalendar } from './useCalendar'
import './calendar.css'

export function HealthCalendarPage() {
  const token = useAppStore(s => s.authToken ?? '')
  const memberId = useAppStore(s => s.currentMemberId)
  return <CalendarView key={`${memberId}:${token}`} memberId={memberId} token={token}/>
}
function CalendarView({ memberId, token }: { memberId: string; token: string }) {
  const members = useAppStore(s => s.members), navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer) }, [])
  const today = getLocalDateKey(now)!
  const rawDay = params.get('day') ?? today
  const day = parsePlainDate(rawDay) && rawDay <= today ? rawDay : today
  const month = day.slice(0, 7)
  const [category, setCategory] = useState(''), [revision, setRevision] = useState(0)
  const [dayOpen, setDayOpen] = useState(false), [selected, setSelected] = useState<CalendarEntry | null>(null), [recording, setRecording] = useState(false)
  const data = useCalendar(memberId, token, revision)
  const scoped = useMemo(() => scopeEntries(data.entries, '', category), [data.entries, category])
  const dayItems = useMemo(() => calendarItems(scoped, day, 'desc', now), [scoped, day, now])
  const dates = useMemo(() => calendarMonthDays(month), [month]), weeks = Math.ceil(dates.length / 7)
  const ready = !data.loading && !data.error
  const grid = useRef<HTMLDivElement>(null)
  const [previewLimit, setPreviewLimit] = useState(1)
  useLayoutEffect(() => {
    const node = grid.current
    if (!node) return
    const resize = () => {
      const cell = node.querySelector<HTMLElement>('.health-calendar__day')
      if (!cell) return
      const line = parseFloat(getComputedStyle(node).fontSize) * 1.4 + 2
      // Reserve a date line and the overflow count; fit entries to the actual viewport, including six-week months.
      setPreviewLimit(Math.max(1, Math.min(5, Math.floor((cell.clientHeight - 42) / line))))
    }
    const observer = new ResizeObserver(resize); observer.observe(node); resize()
    return () => observer.disconnect()
  }, [month, weeks, members.length])
  const chooseDay = (value: string) => { if (parsePlainDate(value) && value <= today) setParams({ day: value }) }
  const shiftMonth = (amount: number) => {
    const p = parsePlainDate(day)!, at = new Date(p.year, p.month - 1 + amount, 1, 12)
    at.setDate(Math.min(p.day, new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate()))
    chooseDay(getLocalDateKey(at)! > today ? today : getLocalDateKey(at)!)
  }
  const addRecord = () => { setDayOpen(false); setRecording(true) }
  return <main className="app-shell health-calendar">
    <MainAppHeader compact title="健康月历"/>
    <div className="health-calendar__content">
      {!members.length ? <EmptyState title="先添加记录对象" action={<HohoButton onClick={() => navigate('/family/new')}>添加孩子</HohoButton>}/> : <>
        <section aria-label="月历" className="health-calendar__month" aria-busy={data.loading}>
          <div className="health-calendar__toolbar">
            <HohoButton variant="ghost" size="icon" aria-label="上个月" onClick={() => shiftMonth(-1)}><ChevronLeft size={18}/></HohoButton>
            <label className="health-calendar__month-picker"><strong>{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</strong><input aria-label="选择日历日期" type="date" value={day} max={today} onChange={e => chooseDay(e.target.value)}/></label>
            <HohoButton variant="ghost" size="icon" aria-label="下个月" disabled={month >= today.slice(0, 7)} onClick={() => shiftMonth(1)}><ChevronRight size={18}/></HohoButton>
            <select aria-label="筛选记录类型" value={category} onChange={e => { setCategory(e.target.value); setDayOpen(false) }}><option value="">全部类型</option>{calendarCategories.map(c => <option key={c} value={c}>{calendarCategoryLabels[c]}</option>)}</select>
          </div>
          {(data.loading || data.error) && <div className="health-calendar__status" role={data.error ? 'alert' : 'status'}>{data.error || '正在读取记录…'}{data.error && <HohoButton size="small" variant="text" onClick={() => setRevision(v => v + 1)}>重试</HohoButton>}</div>}
          <div className="health-calendar__grid" ref={grid} style={{ '--calendar-weeks': weeks } as CSSProperties}>
            {['一','二','三','四','五','六','日'].map(weekday => <span className="health-calendar__weekday" data-weekend={weekday === '六' || weekday === '日'} key={weekday}>{weekday}</span>)}
            {Array.from({ length: weeks * 7 }, (_, i) => {
              const date = dates[i]
              if (!date) return <span className="health-calendar__blank" key={`blank:${i}`} aria-hidden="true"/>
              const info = calendarDayInfo(date)
              const previews = [...new Map(calendarItems(scoped, date, 'desc', now).map(item => [item.entry.id, item.entry])).values()]
              return <button key={date} type="button" disabled={date > today} className="health-calendar__day" data-weekend={info.weekend} data-rest={info.rest} data-work={info.work} title={info.description} aria-label={`${date}，${!ready ? '记录加载中' : previews.length ? `${previews.length}条记录` : '暂无记录'}，${info.description}`} aria-current={date === day ? 'date' : undefined} data-today={date === today} onClick={() => { chooseDay(date); setDayOpen(ready && previews.length > 0) }}>
                <span className="health-calendar__date-heading"><span className="health-calendar__date-number">{Number(date.slice(8))}</span>{info.festival && <span className="health-calendar__festival">{info.festival}</span>}{!info.festival && (info.work || info.rest) && <span className="health-calendar__holiday-marker">{info.work ? '班' : '休'}</span>}</span>
                <span className="health-calendar__previews">{ready && previews.slice(0, previewLimit).map(entry => <span key={entry.id} className="health-calendar__preview" data-tone={calendarRecordTone(entry.categories, category)} title={(entry.categories ?? []).map(c => calendarCategoryLabels[c]).join('、')}>{journalListSummary(entry)}</span>)}</span>
                {ready && previews.length > previewLimit && <small className="health-calendar__more">+{previews.length - previewLimit}</small>}
              </button>
            })}
          </div>
        </section>
        <footer className="health-calendar__actions"><HohoButton size="icon" className="health-calendar__add" aria-label="新增记录" disabled={!token || !memberId} onClick={addRecord}><Plus size={26}/></HohoButton></footer>
      </>}
    </div>
    {dayOpen && !selected && <BottomSheetSurface open title={`${formatPlainMonthDay(day)}的记录`} label="当天记录" onClose={() => setDayOpen(false)} headerAction={<HohoButton size="icon" variant="ghost" aria-label="新增当天记录" onClick={addRecord}><Plus size={21}/></HohoButton>}>
      <ol className="health-calendar__records">{dayItems.map(item => <li key={item.key}><button type="button" onClick={() => setSelected(item.entry)}><span>{item.precision === 'exact' ? calendarTime(item.at) : '时间未明'}</span><strong>{item.label && `${item.label} · `}{journalListSummary(item.entry)}</strong><ChevronRight size={16}/></button></li>)}</ol>
    </BottomSheetSurface>}
    {selected && <JournalRecordDetail eventId={selected.eventId} recordId={selected.id} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); setDayOpen(false); setRevision(v => v + 1) }}/>}
    {recording && <CalendarRecorder initialCategory={category ? category as JournalCategory : undefined} memberId={memberId} token={token} day={day} today={today} onClose={() => setRecording(false)} onRecorded={at => { chooseDay(getLocalDateKey(at)!); setRevision(v => v + 1) }}/>}
  </main>
}
