import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ClipboardList, NotebookText, Route } from 'lucide-react'
import { HealthCard, HealthTag, HohoButton, Typography } from '../../components/design-system'
import { useCases } from '../../features/case-continuity/useCases'
import { activeSymptomFollowups, followupDate } from './symptomFollowup'
import './HomeFlows.css'

type FollowupSnapshot = { description?: string | null; time?: string | null }
const seenFollowups = new Map<string, FollowupSnapshot>()

export function HomeFlows({ nurseVisual }: { nurseVisual: ReactNode }) {
  const navigate = useNavigate()
  const { data, memberId, token } = useCases()
  const symptoms = activeSymptomFollowups(data?.active ?? [], memberId)
  const item = symptoms[0]
  const [updated, setUpdated] = useState({ description: false, time: false })
  useEffect(() => {
    const next = { id: item?.event.id, description: item?.followup.description, time: item?.followup.latestOccurredAt }
    if (!next.id) return
    const key = `${memberId}:${next.id}`
    const previous = seenFollowups.get(key)
    setUpdated({ description: !!previous && previous.description !== next.description, time: !!previous && previous.time !== next.time })
    if (seenFollowups.size > 50) seenFollowups.clear()
    seenFollowups.set(key, next)
    const timer = setTimeout(() => setUpdated({ description: false, time: false }), 1200)
    return () => clearTimeout(timer)
  }, [memberId, item?.event.id, item?.followup.description, item?.followup.latestOccurredAt])
  return <section className="home-flows" aria-label="首页服务入口">
    <HealthCard className="home-flow-card nurse-home-dialogue" aria-label="健康随记">
      <header><div className="home-followup-heading"><NotebookText size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">健康随记</Typography></div><time dateTime={new Date().toLocaleDateString('sv-SE')}>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</time></header>
      <div className="nurse-home-dialogue__body"><div className="nurse-home-dialogue__copy"><Typography variant="caption">吃了什么、睡得怎样、哪里不舒服，都帮你记清楚。</Typography><Typography className="home-record-time-hint" variant="caption">现在或过去的情况，都可以记。</Typography></div><div className="nurse-station-visual">{nurseVisual}</div></div>
      <HohoButton fullWidth size="large" disabled={!token || !memberId} onClick={() => navigate('/smart-record?source=front-desk', {state:{frontDeskReturn:true}})}>和护士说说</HohoButton>
    </HealthCard>
    {item && <HealthCard className="home-flow-card home-symptom-followup" role="region" aria-label="症状跟进">
      <header>
        <div className="home-followup-heading"><Route size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">症状跟进</Typography></div>
        <Typography variant="caption" className="home-followup-count">{symptoms.length} 项</Typography>
      </header>
      <button className="home-followup-preview" type="button" aria-label={`查看${item.followup.title}的详情`} onClick={() => navigate(`/health-events/${encodeURIComponent(item.event.id)}`)}>
        <strong className="home-symptom-title"><Activity size={18} strokeWidth={1.8} aria-hidden="true" /><span>{item.followup.title}</span></strong>
        {item.followup.description && <span className="home-symptom-description" data-paper-updated={updated.description || undefined}>{item.followup.description}</span>}
        {item.followup.keyword && <span className="home-symptom-keyword"><HealthTag tone="primary">{item.followup.keyword}</HealthTag></span>}
        <span className="home-symptom-dates">
          {followupDate(item.followup.firstOccurredAt) && <small>首次记录 {followupDate(item.followup.firstOccurredAt)}</small>}
          {followupDate(item.followup.latestOccurredAt) && <small data-paper-updated={updated.time || undefined}>最近更新 {followupDate(item.followup.latestOccurredAt)}</small>}
        </span>
      </button>
      <HohoButton fullWidth variant="primary" onClick={() => navigate('/cases')}>情况跟进</HohoButton>
    </HealthCard>}
    <HealthCard className="home-flow-card" aria-label="准备和医生说清楚">
      <div className="home-followup-heading"><ClipboardList size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">准备和医生说清楚</Typography></div>
      <Typography variant="body">快速准备孩子的就诊情况单（既往史）</Typography>
      <HohoButton fullWidth variant="primary" size="large" onClick={() => navigate('/visit-summary')}>就诊情况单</HohoButton>
    </HealthCard>
  </section>
}
