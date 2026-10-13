import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ClipboardList, NotebookText, Route } from 'lucide-react'
import { HealthCard, HealthTag, HohoButton, Typography } from '../../components/design-system'
import { useCases } from '../../features/case-continuity/useCases'
import { useAppStore } from '../../store/useAppStore'
import { RecordEntryActions } from '../HealthEvents/RecordEntryActions'
import { activeSymptomFollowups, followupDate } from './symptomFollowup'
import './HomeFlows.css'

type FollowupSnapshot = { time?: string | null }
const seenFollowups = new Map<string, FollowupSnapshot>()

export function HomeFlows({ nurseVisual }: { nurseVisual: ReactNode }) {
  const navigate = useNavigate()
  const { data, memberId, token } = useCases()
  const accountId = useAppStore(state => state.authUser?.id ?? '')
  const identity = `${accountId}:${memberId}`
  const symptoms = activeSymptomFollowups(data?.active ?? [], memberId)
  const item = symptoms[0]
  const [updated, setUpdated] = useState(false)
  useEffect(() => {
    const next = { id: item?.event.id, time: item?.followup.latestOccurredAt }
    if (!next.id) return
    const key = `${memberId}:${next.id}`
    const previous = seenFollowups.get(key)
    setUpdated(!!previous && previous.time !== next.time)
    if (seenFollowups.size > 50) seenFollowups.clear()
    seenFollowups.set(key, next)
    const timer = setTimeout(() => setUpdated(false), 1200)
    return () => clearTimeout(timer)
  }, [memberId, item?.event.id, item?.followup.latestOccurredAt])
  return <section className="home-flows" aria-label="首页服务入口">
    <div className="home-followup-paper" data-paper-layers={Math.max(1, Math.min(3, symptoms.length))}>
      <HealthCard className="home-flow-card home-symptom-followup" role="region" aria-label="症状跟进">
        <span className="home-paper-fold" aria-hidden="true" />
        <header>
          <div className="home-followup-heading"><Route size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">症状跟进</Typography></div>
          <Typography variant="caption" className="home-followup-count">{symptoms.length} 项</Typography>
        </header>
        {item ? <button className="home-followup-preview" type="button" aria-label={`查看${item.followup.title}的详情`} onClick={() => navigate(`/health-events/${encodeURIComponent(item.event.id)}`)}>
          <span className="home-symptom-summary"><strong className="home-symptom-title"><Activity size={18} strokeWidth={1.8} aria-hidden="true" /><span>{item.followup.title}</span></strong>
            {item.followup.keyword && <span className="home-symptom-keyword"><HealthTag tone="primary">{item.followup.keyword}</HealthTag></span>}
          </span>
          <span className="home-symptom-dates">
            {followupDate(item.followup.firstOccurredAt) && <small>首次记录 {followupDate(item.followup.firstOccurredAt)}</small>}
            {followupDate(item.followup.latestOccurredAt) && <small data-paper-updated={updated || undefined}>最近更新 {followupDate(item.followup.latestOccurredAt)}</small>}
          </span>
        </button> : <Typography variant="caption">暂无跟进症状</Typography>}
        <div className="home-followup-actions">
          <HohoButton fullWidth variant="secondary" onClick={() => navigate('/cases')}><Activity size={18} aria-hidden="true" />情况跟进</HohoButton>
          <HohoButton fullWidth variant="primary" disabled={!token || !memberId} onClick={() => navigate('/visit-summary')}><ClipboardList size={18} aria-hidden="true" />情况单</HohoButton>
        </div>
      </HealthCard>
    </div>
    <HealthCard className="home-flow-card nurse-home-dialogue" aria-label="健康随记">
      <header><div className="home-followup-heading"><NotebookText size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">健康随记</Typography></div><time dateTime={new Date().toLocaleDateString('sv-SE')}>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</time></header>
      <div className="nurse-home-dialogue__body"><div className="nurse-home-dialogue__copy"><Typography variant="caption">吃了什么、睡得怎样、哪里不舒服，都帮你记清楚。</Typography><Typography className="home-record-time-hint" variant="caption">现在或过去的情况，都可以记。</Typography></div><div className="nurse-station-visual">{nurseVisual}</div></div>
      <RecordEntryActions disabled={!token || !memberId} identity={identity} onSmartRecord={() => navigate('/smart-record?source=front-desk', { state: { frontDeskReturn: true } })} onRecord={(category, kind) => navigate('/health-events', { state: { nurseRecordEntry: category, nurseRecordDietKind: kind, calendarIdentity: identity } })} />
    </HealthCard>
  </section>
}
