import { ArrowUpDown, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MainAppHeader } from '../../components/navigation'
import { BottomSheetSurface, EmptyState, HohoButton, StatusNotice } from '../../components/design-system'
import { useCurrentMember } from '../../hooks/useCurrentMember'
import { useAppStore } from '../../store/useAppStore'
import { getLocalDateKey, parsePlainDate, formatPlainMonthDay, formatPlainWeekday } from '../../utils/localCalendarDate'
import { JournalRecordDetail } from '../HealthEvents/JournalRecordDetail'
import { journalCategoryLabels } from '../HealthEvents/timeViewModel'
import { calendarBoundary, calendarCategories, calendarFacts, calendarExport, calendarIntervalLabel, calendarItems, calendarMonthDays, calendarTime, scopeEntries, type CalendarEntry, type CalendarItem, type CalendarOrder } from './model'
import { useCalendar } from './useCalendar'
import './calendar.css'

export function HealthCalendarPage() {
  const token = useAppStore(s => s.authToken ?? '')
  const memberId = useAppStore(s => s.currentMemberId)
  // Remount the complete view on subject/session change: sheets and filters must not leak to another child.
  return <CalendarView key={`${memberId}:${token}`} memberId={memberId} token={token}/>
}
function CalendarView({ memberId, token }: { memberId: string; token: string }) {
  const member = useCurrentMember(), members = useAppStore(s => s.members), navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30000); return () => window.clearInterval(timer) }, [])
  const today = getLocalDateKey(now)!, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const rawDay = params.get('day') ?? today
  const day = parsePlainDate(rawDay) && rawDay <= today ? rawDay : today
  const month = day.slice(0, 7)
  const eventId = ''; const [category, setCategory] = useState(''), [order, setOrder] = useState<CalendarOrder>('desc')
  const [revision, setRevision] = useState(0), [selected, setSelected] = useState<CalendarEntry | null>(null), [exportOpen, setExportOpen] = useState(false)
  const data = useCalendar(memberId, token, revision)
  const scoped = useMemo(() => scopeEntries(data.entries, eventId, category), [data.entries, eventId, category])
  const dayItems = useMemo(() => calendarItems(scoped, day, order, now), [scoped, day, order, now])
  const unknown = scoped.filter(entry => entry.timePrecision === 'unknown')
  const known = dayItems.filter(item => item.precision === 'exact'), uncertain = dayItems.filter(item => item.precision !== 'exact')
  const ready = !data.loading && !data.error
  const activeCase = data.cases.find(item => item.event.id === eventId)
  const scopeLabel = [activeCase?.event.title ?? '全部事项', category ? journalCategoryLabels[category as keyof typeof journalCategoryLabels] : '全部类型'].join(' · ')
  const chooseDay = (value: string) => { if (parsePlainDate(value) && value <= today) setParams({ day: value }) }
  const shiftMonth = (amount: number) => { const p = parsePlainDate(day)!; const at = new Date(p.year, p.month - 1 + amount, 1, 12); const last = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate(); at.setDate(Math.min(p.day, last)); chooseDay(getLocalDateKey(at)! > today ? today : getLocalDateKey(at)!) }
  const renderItem = (item: CalendarItem) => <RecordItem key={item.key} item={item} onOpen={() => setSelected(item.entry)}/>
  return <main className="app-shell health-calendar"><MainAppHeader compact title="健康月历" action={<HohoButton size="icon" variant="ghost" aria-label="刷新健康月历" loading={data.loading} onClick={() => setRevision(v => v + 1)}><RefreshCw size={18}/></HohoButton>}/>
    <div className="health-calendar__content">
      {!members.length ? <EmptyState title="先添加记录对象" description="添加孩子后，可以按日期回看健康记录。" action={<HohoButton onClick={() => navigate('/family/new')}>添加孩子</HohoButton>}/> : <>
        <section aria-label="月历" className="health-calendar__month">
          <div className="health-calendar__month-nav"><HohoButton variant="ghost" size="icon" aria-label="上个月" onClick={() => shiftMonth(-1)}><ChevronLeft size={20}/></HohoButton><label><strong>{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</strong><input aria-label="选择日历日期" type="date" value={day} max={today} onChange={e => chooseDay(e.target.value)}/></label><HohoButton variant="ghost" size="icon" aria-label="下个月" disabled={month >= today.slice(0, 7)} onClick={() => shiftMonth(1)}><ChevronRight size={20}/></HohoButton><HohoButton variant="text" size="small" onClick={() => chooseDay(today)}>今天</HohoButton></div>
          <div className="health-calendar__filter-row"><span>{member.name}</span><select aria-label="筛选记录类型" value={category} onChange={e => setCategory(e.target.value)}><option value="">全部类型</option>{calendarCategories.map(c => <option key={c} value={c}>{c === 'care' ? '身体涂抹' : c === 'diet' ? '喂养 / 饮食' : journalCategoryLabels[c]}</option>)}</select></div>
          <div className="health-calendar__grid">{['一','二','三','四','五','六','日'].map(weekday => <span className="health-calendar__weekday" key={weekday}>{weekday}</span>)}{calendarMonthDays(month).map((date, i) => {
            if (!date) return <span key={`blank:${i}`} aria-hidden="true"/>
            const previews = [...new Map(calendarItems(scoped, date, 'desc', now).map(item => [item.entry.id, item.entry])).values()]
            const count = previews.length
            return <button key={date} type="button" disabled={date > today} className="health-calendar__day" aria-label={`${date}，${!ready ? '记录加载中' : count ? `${count}条记录` : '暂无记录'}`} aria-current={date === day ? 'date' : undefined} data-today={date === today} onClick={() => chooseDay(date)}><span className="health-calendar__date-number">{Number(date.slice(8))}</span>{ready && previews.slice(0, 5).map(entry => <span key={entry.id} className="health-calendar__preview">{entry.content.split('\n').find(line => line.trim()) || entry.eventTitle}</span>)}{ready && count > 5 && <small>+{count - 5}条</small>}</button>
          })}</div>
        </section>
        <section className="health-calendar__recall" aria-label="当日回看"><div className="health-calendar__day-heading"><h2>{formatPlainMonthDay(day)} <small>{formatPlainWeekday(day)}</small></h2><HohoButton size="icon" variant="ghost" aria-label={`记录顺序：${order === 'desc' ? '较晚在前' : '较早在前'}，点击切换`} onClick={() => setOrder(v => v === 'desc' ? 'asc' : 'desc')}><ArrowUpDown size={18}/></HohoButton></div>
          <p className="health-calendar__note">{calendarBoundary}</p>
          {data.loading && <StatusNotice title="正在读取健康记录…"/>}{data.error && <StatusNotice title={data.error} tone="error" action={<HohoButton size="small" variant="secondary" onClick={() => setRevision(v => v + 1)}>重试</HohoButton>}/>}
          {ready && <><p className="health-calendar__note">{scopeLabel} · {order === 'desc' ? '较晚在前' : '较早在前'} · 显示时区：{timeZone}</p>{!dayItems.length && <EmptyState title="这一天暂无符合筛选的记录" description="未记录不代表没有发生。可以换一天，或调整筛选。"/>}<ol className="health-calendar__timeline">{known.map(renderItem)}</ol>{uncertain.length > 0 && <><h3>当天，时间未明确</h3><p className="health-calendar__note">只知道日期或时段，无法与精确时间记录确定先后。</p><ol className="health-calendar__timeline">{uncertain.map(renderItem)}</ol></>}
            {unknown.length > 0 && <details className="health-calendar__unknown"><summary>日期 / 时间不详 · {unknown.length}条</summary><p className="health-calendar__note">属于当前筛选范围，无法确认是否发生在这一天；不计入当天数量。</p><ol className="health-calendar__timeline">{unknown.map(entry => renderItem({ entry, key: entry.id, at: '', precision: 'unknown', label: entry.timeLabel || '日期 / 时间不详' }))}</ol></details>}
          </>}
        </section>
        <HohoButton fullWidth disabled={!ready} onClick={() => setExportOpen(true)}><Download size={18}/>带去看医生</HohoButton>
      </>}
    </div>
    {selected && <JournalRecordDetail eventId={selected.eventId} recordId={selected.id} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); setRevision(v => v + 1) }}/>}
    {exportOpen && <ExportSheet entries={scoped} memberName={member.name} initialDay={day} today={today} scope={scopeLabel} timeZone={timeZone} onClose={() => setExportOpen(false)}/>}
  </main>
}
function RecordItem({ item, onOpen }: { item: CalendarItem; onOpen: () => void }) {
  const { entry } = item
  return <li><button type="button" className="health-calendar__record" onClick={onOpen}><span className="health-calendar__record-time">{item.precision === 'exact' ? calendarTime(item.at) : item.precision === 'unknown' ? '日期不详' : '时间未明'}</span><span className="health-calendar__record-copy"><span className="health-calendar__record-meta">{item.label && `${item.label} · `}{(entry.categories ?? ['other']).map(c => journalCategoryLabels[c]).join(' / ')}</span><strong>{entry.content}</strong>{calendarIntervalLabel(entry) && <small>{calendarIntervalLabel(entry)}</small>}{calendarFacts(entry).map(fact => <small key={fact}>{fact}</small>)}<small>{entry.eventTitle} · {entry.sourceLabel}</small></span><ChevronRight size={17}/></button></li>
}
function ExportSheet({ entries, memberName, initialDay, today, scope, timeZone, onClose }: { entries: CalendarEntry[]; memberName: string; initialDay: string; today: string; scope: string; timeZone: string; onClose: () => void }) {
  const [from, setFrom] = useState(initialDay), [to, setTo] = useState(initialDay), [includeUnknown, setIncludeUnknown] = useState(false), [notice, setNotice] = useState('')
  const valid = Boolean(parsePlainDate(from) && parsePlainDate(to) && from <= to && to <= today)
  const download = async () => {
    try {
      const html = calendarExport(entries, { memberName, from, to, scope, timeZone, includeUnknown })
      const filename = `Hoooho-health-calendar-${from}-${to}.html`
      const file = new File([html], filename, { type: 'text/html' })
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: '健康月历回看' }); setNotice('已打开系统分享，可保存到文件。'); return }
      const url = URL.createObjectURL(file), link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000); setNotice('已生成 HTML 文件，可离线打开并打印。')
    } catch (error) { if ((error as Error).name !== 'AbortError') setNotice('文件生成或分享失败，请重试。') }
  }
  return <BottomSheetSurface open title="带去看医生" label="导出健康月历" onClose={onClose} footer={<HohoButton fullWidth disabled={!valid} onClick={() => void download()}>保存 HTML 回看文件</HohoButton>}><div className="health-calendar__export"><p>{memberName} · {scope}</p><label>开始日期<input aria-label="导出开始日期" type="date" max={to || today} value={from} onChange={e => setFrom(e.target.value)}/></label><label>结束日期<input aria-label="导出结束日期" type="date" min={from} max={today} value={to} onChange={e => setTo(e.target.value)}/></label>{!valid && <p role="alert">开始日期不能晚于结束日期，结束日期不能晚于今天。</p>}<label className="health-calendar__checkbox"><input type="checkbox" checked={includeUnknown} onChange={e => setIncludeUnknown(e.target.checked)}/>附上日期 / 时间不详的记录（单独列出）</label><p className="health-calendar__note">导出保留当前筛选、原记录和来源原文，按实际发生时间回看；跨日记录保留完整区间。医生可直接打开文件，也可打印。</p><p className="health-calendar__note">{calendarBoundary}</p>{notice && <p role="status">{notice}</p>}</div></BottomSheetSurface>
}
