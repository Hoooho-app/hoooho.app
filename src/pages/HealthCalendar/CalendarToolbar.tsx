import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Check, Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { HohoButton } from '../../components/design-system'
import { formatPlainMonthDay } from '../../utils/localCalendarDate'
import { shiftJournalDate } from '../HealthEvents/timeViewModel'
import { calendarCategories, calendarCategoryLabels } from './presentation'
import { shiftCalendarMonth, switchCalendarView, type CalendarNavigation } from './navigation'

function ViewMenu({ value, onChange }: { value: CalendarNavigation['view']; onChange: (value: CalendarNavigation['view']) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>(`[data-value="${value}"]`)?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, value])
  return <div className="calendar-view-menu" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false) }}>
    <button type="button" ref={trigger} aria-label="切换日历视图" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}>{value === 'day' ? '日历' : '月历'}<ChevronDown size={12}/></button>
    {open && <div role="menu" aria-label="日历视图" className="calendar-view-options" onKeyDown={event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus()
      }
    }}>{(['day', 'month'] as const).map(view => <button type="button" role="menuitemradio" aria-checked={value === view} data-value={view} key={view} onClick={() => { onChange(view); close() }}>{view === 'day' ? '日历' : '月历'}{value === view && <Check size={16}/>}</button>)}</div>}
  </div>
}
export function CalendarToolbar({ state, today, onChange, onSettings }: { state: CalendarNavigation; today: string; onChange: (state: CalendarNavigation) => void; onSettings: () => void }) {
  const monthMode = state.view === 'month'
  const shift = (amount: number) => onChange(monthMode ? { ...state, month: shiftCalendarMonth(state.month, amount) } : { ...state, day: shiftJournalDate(state.day, amount), month: shiftJournalDate(state.day, amount).slice(0, 7) })
  return <div className="calendar-toolbar" aria-label="健康日历工具栏" data-view={state.view}>
    <div className="calendar-date-navigation">
      <HohoButton size="icon" variant="ghost" aria-label={monthMode ? '上个月' : '前一天'} onClick={() => shift(-1)}><ChevronLeft size={16}/></HohoButton>
      <label className="calendar-date-picker"><span>{monthMode ? `${Number(state.month.slice(0, 4))}年${Number(state.month.slice(5))}月` : formatPlainMonthDay(state.day)}</span><input aria-label={monthMode ? '选择月份' : '选择日期'} type={monthMode ? 'month' : 'date'} max={monthMode ? today.slice(0, 7) : today} value={monthMode ? state.month : state.day} onChange={event => onChange({ ...state, ...(monthMode ? { month: event.target.value } : { day: event.target.value, month: event.target.value.slice(0, 7) }) })}/></label>
      <HohoButton size="icon" variant="ghost" aria-label={monthMode ? '下个月' : '后一天'} disabled={monthMode ? state.month >= today.slice(0, 7) : state.day >= today} onClick={() => shift(1)}><ChevronRight size={16}/></HohoButton>
    </div>
    <select aria-label="筛选记录类型" value={state.category} onChange={event => onChange({ ...state, category: event.target.value })}><option value="">全部类型</option>{calendarCategories.map(category => <option value={category} key={category}>{calendarCategoryLabels[category]}</option>)}</select>
    {!monthMode && <HohoButton size="icon" variant="ghost" aria-label={`记录顺序：${state.sort === 'desc' ? '最新在上' : '最新在下'}，点击切换`} aria-pressed={state.sort === 'asc'} onClick={() => onChange({ ...state, sort: state.sort === 'asc' ? 'desc' : 'asc' })}><ArrowUpDown size={17}/></HohoButton>}
    <ViewMenu value={state.view} onChange={view => onChange(switchCalendarView(state, view, today))}/>
    <HohoButton size="icon" variant="ghost" aria-label="调整作息" onClick={onSettings}><Settings size={18}/></HohoButton>
  </div>
}
