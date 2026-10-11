import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { HohoButton } from '../../components/design-system'
import { formatPlainMonthDay } from '../../utils/localCalendarDate'
import { shiftJournalDate } from '../HealthEvents/timeViewModel'
import { calendarCategories, calendarGroupLabels } from './presentation'
import { shiftCalendarMonth, switchCalendarView, type CalendarNavigation } from './navigation'

export function CalendarToolbar({ state, today, onChange }: { state: CalendarNavigation; today: string; onChange: (state: CalendarNavigation) => void }) {
  const monthMode = state.view === 'month'
  const shift = (amount: number) => onChange(monthMode ? { ...state, month: shiftCalendarMonth(state.month, amount) } : { ...state, day: shiftJournalDate(state.day, amount), month: shiftJournalDate(state.day, amount).slice(0, 7) })
  return <div className="calendar-toolbar" aria-label="健康日历工具栏" data-view={state.view}>
    <div className="calendar-date-navigation">
      <HohoButton size="icon" variant="ghost" aria-label={monthMode ? '上个月' : '前一天'} onClick={() => shift(-1)}><ChevronLeft size={16}/></HohoButton>
      <label className="calendar-date-picker"><span>{monthMode ? `${Number(state.month.slice(0, 4))}年${Number(state.month.slice(5))}月` : formatPlainMonthDay(state.day)}</span><input aria-label={monthMode ? '选择月份' : '选择日期'} type={monthMode ? 'month' : 'date'} max={monthMode ? today.slice(0, 7) : today} value={monthMode ? state.month : state.day} onChange={event => onChange({ ...state, ...(monthMode ? { month: event.target.value } : { day: event.target.value, month: event.target.value.slice(0, 7) }) })}/></label>
      <HohoButton size="icon" variant="ghost" aria-label={monthMode ? '下个月' : '后一天'} disabled={monthMode ? state.month >= today.slice(0, 7) : state.day >= today} onClick={() => shift(1)}><ChevronRight size={16}/></HohoButton>
    </div>
    <HohoButton className="calendar-view-toggle" variant="ghost" aria-label="切换日历视图" aria-pressed={monthMode} title={monthMode ? '切换到日历' : '切换到月历'} onClick={() => onChange(switchCalendarView(state, monthMode ? 'day' : 'month', today))}>{monthMode ? '月历' : '日历'}</HohoButton>
    <select aria-label="筛选记录类型" value={state.category} onChange={event => onChange({ ...state, category: event.target.value })}><option value="">全部类型</option>{calendarCategories.map(category => <option value={category} key={category}>{calendarGroupLabels[category]}</option>)}</select>
    <div className="calendar-sort-slot">{!monthMode && <HohoButton size="icon" variant="ghost" aria-label={`记录顺序：${state.sort === 'desc' ? '最新在上' : '最新在下'}，点击切换`} aria-pressed={state.sort === 'asc'} onClick={() => onChange({ ...state, sort: state.sort === 'asc' ? 'desc' : 'asc' })}><ArrowUpDown size={17}/></HohoButton>}</div>
  </div>
}
