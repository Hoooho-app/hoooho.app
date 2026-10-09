import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MainAppHeader } from '../../components/navigation'
import { HealthCard, HohoButton, HohoInput, StatusNotice, Typography } from '../../components/design-system'
import { useAppStore } from '../../store/useAppStore'
import { useJournal } from '../HealthEvents/useJournal'
import { getLocalDateKey } from '../../utils/localCalendarDate'
import '../../features/case-continuity/cases.css'
import './HomeFlows.css'

function useRecords() {
  const memberId = useAppStore(s => s.currentMemberId), token = useAppStore(s => s.authToken) ?? ''
  const member = useAppStore(s => s.members.find(m => m.id === memberId))
  return { memberId, member, ...useJournal(memberId, token, 0) }
}
export function HealthCalendarPage() {
  const { member, memberId, entries, loading, error, retry } = useRecords(), navigate = useNavigate()
  const today = getLocalDateKey(new Date())!, [month, setMonth] = useState(today.slice(0, 7))
  const days = useMemo(() => [...new Set(entries.filter(e => e.timePrecision !== 'unknown' && getLocalDateKey(e.occurredAt)?.startsWith(month)).map(e => getLocalDateKey(e.occurredAt)!))].sort().reverse(), [entries, month])
  return <main className="app-shell continuity-page"><MainAppHeader title="健康月历"/><div className="continuity-scroll home-flows" key={memberId}><Typography variant="body">{member?.name} · 按发生日期查看已有记录</Typography><HohoInput label="选择月份" type="month" value={month} max={today.slice(0, 7)} onChange={e => setMonth(e.target.value)}/>{loading && <p role="status">正在读取记录…</p>}{error && <StatusNotice tone="error" title={error}><HohoButton onClick={retry}>重试</HohoButton></StatusNotice>}{days.map(day => <HealthCard key={day} className="home-flow-card"><Typography variant="cardTitle">{day}</Typography><p>{entries.filter(e => getLocalDateKey(e.occurredAt) === day && e.timePrecision !== 'unknown').length} 条记录</p><HohoButton variant="text" onClick={() => navigate('/health-events', { state: { journalReturn: { day } } })}>查看当天记录</HohoButton></HealthCard>)}{!loading && !error && !days.length && <p>这个月暂无明确发生日期的记录。未明确时间的记录仍保留在健康随记中。</p>}</div></main>
}
