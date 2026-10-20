import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { HohoButton } from '../../components/design-system/HohoButton'
import { StatusNotice } from '../../components/design-system/StatusNotice'
import { api, FamilyApiError, messageOf } from './api'
import { workspaceModules, type ModuleId, type WorkspaceLocation } from './navigation'
import { arrangementDate, arrangementPages, calendarDays, chinaToday, financeCalendarItems, inMonth, monthTitle, moveMonth, onDate, type ArrangementIntent, type CalendarItem } from './arrangement-model'
import { type ArrangementStore } from './arrangements'
import './month-calendar.css'

type Props = { store: ArrangementStore; admin: boolean; month: string; setMonth: (month: string) => void; open: (location: WorkspaceLocation, intent?: Omit<ArrangementIntent, 'key'>) => void; onUnauthorized: () => void }
const tone = (module: ModuleId) => ({ '--family-category-color': `var(--hoho-color-category-${module})` } as CSSProperties)
const shortDate = (date: string) => `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日`
const targetFor = (module: ModuleId): WorkspaceLocation => ({ module, page: workspaceModules.find(item => item.id === module)?.pages.find(item => item.id === arrangementPages[module])?.id || workspaceModules.find(item => item.id === module)!.pages[0].id })

export function FamilyMonthCalendar({ store, admin, month, setMonth, open, onUnauthorized }: Props) {
  const [finance, setFinance] = useState<CalendarItem[]>([])
  const [financeLoading, setFinanceLoading] = useState(true)
  const [financeError, setFinanceError] = useState('')
  const [hidden, setHidden] = useState<Set<ModuleId>>(new Set())
  const [expanded, setExpanded] = useState<Partial<Record<ModuleId, boolean>>>({})
  const [showDone, setShowDone] = useState(false)
  const [selected, setSelected] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [destination, setDestination] = useState('schedule/tasks')
  const detailRef = useRef<HTMLElement>(null)
  const unauthorized = useRef(onUnauthorized); unauthorized.current = onUnauthorized
  const fetchFinance = async (signal?: AbortSignal) => {
    setFinanceLoading(true); setFinanceError('')
    try { const result = await api<{ data: Parameters<typeof financeCalendarItems>[0] }>('/finance', undefined, signal); if (!signal?.aborted) setFinance(financeCalendarItems(result.data)) }
    catch (cause) { if (!signal?.aborted) { if (cause instanceof FamilyApiError && cause.status === 401) unauthorized.current(); setFinanceError(messageOf(cause)) } }
    finally { if (!signal?.aborted) setFinanceLoading(false) }
  }
  useEffect(() => { const controller = new AbortController(); void fetchFinance(controller.signal); return () => controller.abort() }, [])
  useEffect(() => { setSelected(previous => previous && previous !== 'undated' && previous.startsWith(month) ? previous : undefined); setAdding(false) }, [month])
  const today = chinaToday(), days = calendarDays(month)
  const all: CalendarItem[] = [...(store.snapshot?.plans || []), ...finance].filter(item => inMonth(item, month))
  const visible = all.filter(item => !hidden.has(item.module) && (showDone || item.status !== 'done')).sort((a, b) => (a.startDate || `${a.month}-32`).localeCompare(b.startDate || `${b.month}-32`) || a.title.localeCompare(b.title, 'zh-CN'))
  const undated = visible.filter(item => !item.startDate)
  const scoped = selected ? visible.filter(item => selected === 'undated' ? !item.startDate : onDate(item, selected)) : visible
  const counts = days.filter(day => day.startsWith(month)).map(date => ({ date, count: visible.filter(item => onDate(item, date) && item.status !== 'done').length })).sort((a, b) => b.count - a.count || a.date.localeCompare(b.date))
  const busiest = counts[0]
  const jump = (item: CalendarItem) => open(item.location || { module: item.module, page: item.page }, item.source ? undefined : { id: item.id, month })
  const create = (location: WorkspaceLocation) => open(location, { month, date: selected && selected !== 'undated' ? selected : undefined })
  const revealDetails = () => { if (window.matchMedia('(max-width: 900px)').matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })) }
  const selectDate = (date: string) => { setSelected(date); setAdding(false); revealDetails() }
  const busy = store.loading || financeLoading
  return <section className="family-month-view" aria-label="家庭月历">
    <div className="family-month-toolbar"><div className="family-month-navigation"><h2 className="hoho-text-section-title" aria-live="polite">{monthTitle(month)}</h2><HohoButton variant="ghost" size="icon" aria-label="上个月" disabled={month === '2000-01'} onClick={() => setMonth(moveMonth(month, -1))}><ChevronLeft size={18}/></HohoButton><HohoButton variant="ghost" size="icon" aria-label="下个月" disabled={month === '2099-12'} onClick={() => setMonth(moveMonth(month, 1))}><ChevronRight size={18}/></HohoButton><HohoButton variant="secondary" size="small" onClick={() => { setMonth(today.slice(0, 7)); setSelected(undefined) }}>本月</HohoButton></div><div className="family-month-controls"><label><input type="checkbox" checked={showDone} onChange={event => setShowDone(event.target.checked)}/>显示已完成</label>{admin && <HohoButton size="small" onClick={() => { setAdding(!adding); setSelected(undefined); if (!adding) revealDetails() }}><Plus size={16} aria-hidden="true"/>添加安排</HohoButton>}</div></div>
    <p className="family-month-summary" role="status">{busy ? '正在汇总本月安排…' : `${visible.length} 项安排 · ${undated.length} 项日期待定`}{!busy && busiest?.count > 0 && <> · 最集中：{shortDate(busiest.date)}（{busiest.count} 项）</>}</p>
    {store.error && <StatusNotice tone="error" title="安排读取未完成" action={<HohoButton variant="secondary" size="small" onClick={() => void store.load()}>重试安排</HohoButton>}>{store.error}</StatusNotice>}
    {financeError && <StatusNotice tone="error" title="财务日期未能汇总" action={<HohoButton variant="secondary" size="small" onClick={() => void fetchFinance()}>重试财务日期</HohoButton>}>{financeError}</StatusNotice>}
    <div className="family-month-layout">
      <div className="family-month-board">
        <div className="family-month-undated"><span>本月内<small>日期待定</small></span><div>{undated.slice(0, 3).map(item => <button key={item.id} type="button" className="family-month-chip" style={tone(item.module)} onClick={() => jump(item)} title={item.title}>{item.title}</button>)}{undated.length > 3 && <button type="button" className="family-month-undated-more" onClick={() => setSelected('undated')}>另 {undated.length - 3} 项</button>}{!undated.length && <span className="family-month-hint">尚无日期待定的安排</span>}</div>{admin && <HohoButton size="icon" variant="ghost" aria-label="添加本月日期待定安排" onClick={() => open(targetFor('schedule'), { month })}><Plus size={16}/></HohoButton>}</div>
        <table className="family-month-grid" style={{ '--family-month-weeks': days.length / 7 } as CSSProperties}>
          <caption className="sr-only">{monthTitle(month)}，按类别着色；点击日期查看安排，点击事项进入对应页面。</caption>
          <thead><tr>{['周一','周二','周三','周四','周五','周六','周日'].map(day => <th key={day} scope="col">{day}</th>)}</tr></thead>
          <tbody>{Array.from({ length: days.length / 7 }, (_, week) => <tr key={week}>{days.slice(week * 7, week * 7 + 7).map(date => {
            const items = visible.filter(item => onDate(item, date)), outside = !date.startsWith(month)
            return <td key={date} data-outside={outside || undefined} data-selected={selected === date || undefined} data-today={date === today || undefined}><div className="family-month-cell">
              <button type="button" className="family-month-day" aria-label={`${date}，${items.length} 项安排`} aria-current={date === today ? 'date' : undefined} aria-pressed={selected === date} onClick={() => { if (outside) setMonth(date.slice(0, 7)); selectDate(date) }}><span>{Number(date.slice(8))}</span>{items.length > 0 && <small>{items.length} 项</small>}</button>
              <div className="family-month-events">{items.slice(0, 2).map(item => <button key={item.id} type="button" className={`family-month-event${item.status === 'done' ? ' is-done' : ''}`} style={tone(item.module)} title={`${workspaceModules.find(module => module.id === item.module)?.title} · ${item.title}`} aria-label={`${date} ${item.title}，进入对应页面`} onClick={() => jump(item)}><span>{item.status === 'done' && '✓ '}{item.title}</span></button>)}{items.length > 2 && <button className="family-month-overflow" type="button" aria-label={`查看 ${date} 的全部 ${items.length} 项安排`} onClick={() => selectDate(date)}>+{items.length - 2} 项</button>}</div>
            </div></td>
          })}</tr>)}</tbody>
        </table>
        <p className="family-month-footnote">点击日期查看或添加 · 点击事项进入所属页面 · 同色为同一类别</p>
      </div>
      <aside className="family-month-tree" ref={detailRef} aria-label="按类别分组的本月安排">
        <div className="family-month-tree-title"><div><h3 className="hoho-text-card-title">{selected === 'undated' ? '本月日期待定' : selected ? shortDate(selected) : '本月安排'}</h3><p className="hoho-text-caption">按类别分组 · {scoped.length} 项</p></div>{selected && <HohoButton size="icon" variant="ghost" aria-label="查看整月安排" onClick={() => { setSelected(undefined); setAdding(false) }}><X size={16}/></HohoButton>}</div>
        {(adding || selected) && <div className="family-month-add">{admin ? <><label className="hoho-field"><span className="hoho-text-label">添加到对应页面</span><select className="hoho-input" value={destination} onChange={event => setDestination(event.target.value)}>{workspaceModules.map(module => <optgroup label={module.title} key={module.id}>{module.pages.filter(page => page.id !== 'overview' && page.id !== 'policy').map(page => <option key={page.id} value={`${module.id}/${page.id}`}>{page.title}</option>)}</optgroup>)}</select></label><HohoButton variant="secondary" size="small" onClick={() => { const [module, page] = destination.split('/'); create({ module: module as ModuleId, page }) }}><Plus size={15} aria-hidden="true"/>{selected && selected !== 'undated' ? '去添加当天安排' : '去添加本月安排'}<ArrowUpRight size={14} aria-hidden="true"/></HohoButton></> : <p className="hoho-text-caption">家人可查看安排；需要调整时请联系管理员。</p>}</div>}
        <div className="family-month-groups">{workspaceModules.map(module => {
          const items = scoped.filter(item => item.module === module.id), count = all.filter(item => item.module === module.id && (showDone || item.status !== 'done')).length
          const isOpen = expanded[module.id] ?? items.length > 0
          return <section className="family-month-group" style={tone(module.id)} key={module.id}>
            <div className="family-month-group-heading"><label className="family-month-category-toggle"><input type="checkbox" checked={!hidden.has(module.id)} aria-label={`显示${module.title}`} onChange={() => setHidden(previous => { const next = new Set(previous); if (next.has(module.id)) next.delete(module.id); else next.add(module.id); return next })}/><span aria-hidden="true"/></label><button type="button" aria-expanded={isOpen} aria-controls={`family-month-group-${module.id}`} onClick={() => setExpanded(previous => ({ ...previous, [module.id]: !isOpen }))}><ChevronDown className={isOpen ? '' : 'is-collapsed'} size={15} aria-hidden="true"/><strong>{module.title}</strong><small>{count}</small></button>{admin && <HohoButton size="icon" variant="ghost" aria-label={`到${module.title}添加安排`} onClick={() => create(targetFor(module.id))}><Plus size={15}/></HohoButton>}</div>
            {isOpen && <div className="family-month-group-children" id={`family-month-group-${module.id}`}>{items.length ? module.pages.map(page => {
              const children = items.filter(item => item.page === page.id)
              if (!children.length) return null
              return <div className="family-month-page-group" key={page.id}><button type="button" className="family-month-page-link" onClick={() => open({ module: module.id, page: page.id })}>{page.title}<ArrowUpRight size={12} aria-hidden="true"/></button><ul>{children.map(item => <li key={item.id}><button type="button" className={item.status === 'done' ? 'is-done' : ''} onClick={() => jump(item)}><span className="family-month-item-title">{item.status === 'done' && <Check size={13} aria-hidden="true"/>}{item.title}</span><small>{arrangementDate(item)}{item.owner && ` · ${item.owner}`}{item.source && ` · ${item.source}`}{item.status === 'done' && ' · 已完成'}</small></button></li>)}</ul></div>
            }) : <p className="family-month-group-empty">{hidden.has(module.id) ? '已在月历隐藏此类别' : selected ? '这段时间暂无安排' : '本月暂无安排'}</p>}</div>}
          </section>
        })}</div>
        {!busy && !all.length && <p className="family-month-empty">本月还没有安排。可从分类旁的“＋”进入对应页面添加。</p>}
      </aside>
    </div>
  </section>
}
