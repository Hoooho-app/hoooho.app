import { ArrowUpDown, CalendarDays, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { BottomSheetSurface, HohoButton } from '../../components/design-system'
import { formatPlainMonthDay } from '../../utils/localCalendarDate'
import { shiftJournalDate } from '../HealthEvents/timeViewModel'
import { calendarCategories, calendarGroupLabels } from './presentation'
import { shiftCalendarMonth, switchCalendarView, type CalendarNavigation } from './navigation'

export function CalendarToolbar({ state, today, onChange }: { state: CalendarNavigation; today: string; onChange: (state: CalendarNavigation) => void }) {
  const monthMode = state.view === 'month'
  const [pickerOpen, setPickerOpen] = useState(false)
  const shift = (amount: number) => onChange(monthMode ? { ...state, month: shiftCalendarMonth(state.month, amount) } : { ...state, day: shiftJournalDate(state.day, amount), month: shiftJournalDate(state.day, amount).slice(0, 7) })
  const chooseDate = (value: string) => {
    if (!value) return
    onChange({ ...state, ...(monthMode ? { month: value } : { day: value, month: value.slice(0, 7) }) })
  }
  const ViewIcon = monthMode ? CalendarDays : CalendarRange
  return <>
    <div className="calendar-toolbar" aria-label="健康日历工具栏" data-view={state.view}>
      <HohoButton size="icon" className="calendar-view-toggle" variant="primary" aria-label="切换日历视图" aria-pressed={monthMode} title={monthMode ? '切换到日历' : '切换到月历'} onClick={() => onChange(switchCalendarView(state, monthMode ? 'day' : 'month', today))}><ViewIcon aria-hidden="true" size={20} strokeWidth={1.7}/></HohoButton>
      <div className="calendar-date-navigation">
        <HohoButton size="icon" variant="ghost" aria-label={monthMode ? '上个月' : '前一天'} onClick={() => shift(-1)}><ChevronLeft aria-hidden="true" size={16}/></HohoButton>
        <label className="calendar-date-picker"><span>{monthMode ? `${Number(state.month.slice(0, 4))}年${Number(state.month.slice(5))}月` : formatPlainMonthDay(state.day)}</span><input aria-label={monthMode ? '选择月份' : '选择日期'} type={monthMode ? 'month' : 'date'} value={monthMode ? state.month : state.day} onClick={event => { event.preventDefault(); setPickerOpen(true) }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPickerOpen(true) } }} onChange={event => chooseDate(event.target.value)}/></label>
        <HohoButton size="icon" variant="ghost" aria-label={monthMode ? '下个月' : '后一天'} onClick={() => shift(1)}><ChevronRight aria-hidden="true" size={16}/></HohoButton>
      </div>
      <select aria-label="筛选记录类型" value={state.category} onChange={event => onChange({ ...state, category: event.target.value })}><option value="">查看全部</option>{calendarCategories.map(category => <option value={category} key={category}>查看{calendarGroupLabels[category]}</option>)}</select>
      <div className="calendar-sort-slot">{!monthMode && <HohoButton size="icon" variant="ghost" aria-label={`记录顺序：${state.sort === 'desc' ? '最新在上' : '最新在下'}，点击切换`} aria-pressed={state.sort === 'asc'} onClick={() => onChange({ ...state, sort: state.sort === 'asc' ? 'desc' : 'asc' })}><ArrowUpDown aria-hidden="true" size={17}/></HohoButton>}</div>
    </div>
    <BottomSheetSurface open={pickerOpen} label="日历日期选择" title={monthMode ? '选择月份' : '选择日期'} onClose={() => setPickerOpen(false)} footer={<HohoButton fullWidth onClick={() => setPickerOpen(false)}>确定</HohoButton>}>
      <div className="calendar-picker-content"><input className="hoho-input" aria-label={monthMode ? '日历月份' : '日历日期'} type={monthMode ? 'month' : 'date'} value={monthMode ? state.month : state.day} onChange={event => chooseDate(event.target.value)}/><HohoButton variant="secondary" onClick={() => { onChange({ ...state, day: today, month: today.slice(0, 7) }); setPickerOpen(false) }}>今天</HohoButton></div>
    </BottomSheetSurface>
  </>
}
