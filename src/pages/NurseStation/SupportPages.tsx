import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MainAppHeader } from '../../components/navigation'
import { HealthCard, HohoButton, HohoInput, StatusNotice, Typography } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { useJournal } from '../HealthEvents/useJournal'
import { JournalRecordDetail } from '../HealthEvents/JournalRecordDetail'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import { journalCategoryLabels, type JournalEntry } from '../HealthEvents/timeViewModel'
import '../../features/case-continuity/cases.css'
import './HomeFlows.css'

function useRecords() {
  const memberId = useAppStore(s => s.currentMemberId), token = useAppStore(s => s.authToken) ?? ''
  const member = useAppStore(s => s.members.find(m => m.id === memberId))
  return { memberId, member, ...useJournal(memberId, token, 0) }
}
function Records({ entries }: { entries: JournalEntry[] }) {
  const [selected, setSelected] = useState<JournalEntry | null>(null)
  return <><div className="record-finder-content">{entries.map(entry => <article key={entry.id} className="record-finder-answer"><time>{entry.timePrecision === 'unknown' ? entry.timeLabel || '发生时间未明确' : new Date(entry.occurredAt).toLocaleString('zh-CN')}{entry.timePrecision === 'period' ? '（约）' : ''}</time><strong>{entry.categories?.map(c => journalCategoryLabels[c]).join('、')}</strong><p>{entry.content}</p>{!entry.id.startsWith('event:') && <HohoButton variant="text" onClick={() => setSelected(entry)}>查看原话与附件</HohoButton>}</article>)}</div>{selected && <JournalRecordDetail eventId={selected.eventId} recordId={selected.id} onChanged={() => setSelected(null)} onClose={() => setSelected(null)} />}</>
}
export function HealthCalendarPage() {
  const { member, memberId, entries, loading, error, retry } = useRecords(), navigate = useNavigate()
  const today = getLocalDateKey(new Date())!, [month, setMonth] = useState(today.slice(0, 7))
  const days = useMemo(() => [...new Set(entries.filter(e => e.timePrecision !== 'unknown' && getLocalDateKey(e.occurredAt)?.startsWith(month)).map(e => getLocalDateKey(e.occurredAt)!))].sort().reverse(), [entries, month])
  return <main className="app-shell continuity-page"><MainAppHeader title="健康月历"/><div className="continuity-scroll home-flows" key={memberId}><Typography variant="body">{member?.name} · 按发生日期查看已有记录</Typography><HohoInput label="选择月份" type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)}/>{loading && <p role="status">正在读取记录…</p>}{error && <StatusNotice tone="error" title={error}><HohoButton onClick={retry}>重试</HohoButton></StatusNotice>}{days.map(day => <HealthCard key={day} className="home-flow-card"><Typography variant="cardTitle">{day}</Typography><p>{entries.filter(e => getLocalDateKey(e.occurredAt) === day && e.timePrecision !== 'unknown').length} 条记录</p><HohoButton variant="text" onClick={() => navigate('/health-events', { state: { journalReturn: { day } } })}>查看当天记录</HohoButton></HealthCard>)}{!loading && !error && !days.length && <p>这个月暂无明确发生日期的记录。未明确时间的记录仍保留在健康随记中。</p>}</div></main>
}
export function CareHandoffPage() {
  const { member, memberId, sourceEntries, loading, error, retry } = useRecords(), [days, setDays] = useState(3), [message, setMessage] = useState('')
  const now = new Date(), start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days + 1)
  const records = sourceEntries.filter(e => e.timePrecision === 'unknown' || Date.parse(e.occurredAt) >= start.getTime()).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
  const text = `${member?.name ?? '当前孩子'}的照护交接\n范围：${start.toLocaleDateString('zh-CN')}至${now.toLocaleDateString('zh-CN')}，另列发生时间未明确的记录。\n${records.map(r => `${r.timePrecision === 'unknown' ? '时间未明确' : new Date(r.occurredAt).toLocaleString('zh-CN')}${r.timePrecision === 'period' ? '（约）' : ''}：${r.content}`).join('\n')}\n仅整理已记录的事实。用药请核对原医嘱与用药安排，不依据交接摘要新增或调整药量。`
  return <main className="app-shell continuity-page"><MainAppHeader title="照护交接"/><div className="continuity-scroll home-flows" key={memberId}><Typography variant="sectionTitle">{member?.name}的照护交接</Typography><Typography variant="body">把近期已经记录的饮食、睡眠和身体变化交给照护人。原话和附件可逐条核对。</Typography><div className="home-flow-actions">{[1, 3, 7].map(n => <HohoButton key={n} variant={days === n ? 'secondary' : 'text'} aria-pressed={days === n} onClick={() => { setDays(n); setMessage('') }}>近 {n} 天</HohoButton>)}</div>{loading && <p role="status">正在读取当前孩子的记录…</p>}{error && <StatusNotice tone="error" title={error}><HohoButton onClick={retry}>重试</HohoButton></StatusNotice>}<HohoButton disabled={loading || !!error || !records.length} onClick={() => { void navigator.clipboard.writeText(text).then(() => setMessage('已复制交接内容')).catch(() => setMessage('复制未完成，请重试')) }}>复制交接内容</HohoButton>{message && <p role="status">{message}</p>}{!loading && !records.length && <p>所选范围暂无记录。没有记录不代表没有发生。</p>}<Records entries={records}/><Typography variant="caption">仅整理已有事实，用药请核对原医嘱与用药安排。</Typography></div></main>
}
