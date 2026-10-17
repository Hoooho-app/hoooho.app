import { type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { NotebookText, Stethoscope } from 'lucide-react'
import { HealthCard, HohoButton, Typography } from '../../components/design-system'
import { useCases } from '../../features/case-continuity/useCases'
import { useAppStore } from '../../store/useAppStore'
import { RecordEntryActions } from '../HealthEvents/RecordEntryActions'
import { activeSymptomFollowups, symptomPreview } from './symptomFollowup'
import './HomeFlows.css'
import {UpdateDot,useRecordUpdates} from '../../features/record-updates/RecordUpdates'

export function HomeFlows({ nurseVisual }: { nurseVisual: ReactNode }) {
  const navigate = useNavigate()
  const { data, memberId, token } = useCases()
  const accountId = useAppStore(state => state.authUser?.id ?? '')
  const updates=useRecordUpdates()
  const identity = `${accountId}:${memberId}`
  const symptoms = activeSymptomFollowups(data?.active ?? [], memberId)
  return <section className="home-flows" aria-label="首页服务入口">
    <div className="home-followup-paper" data-paper-layers="1">
      <HealthCard className="home-flow-card home-symptom-followup" role="region" aria-label="症状事件">
        <span className="home-paper-fold" aria-hidden="true" />
        <header>
          <div className="home-followup-heading"><Stethoscope size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">症状事件</Typography></div>
          <Typography variant="caption" className="home-followup-count">{symptoms.length} 项</Typography>
        </header>
        {symptoms.length ? <ul className="home-event-descriptions" aria-label="症状简述">{symptoms.slice(0, 1).map(item => { const preview = symptomPreview(item, data?.timezone); return <li key={item.event.id}><span className="home-symptom-title">{item.followup.title}</span>{preview.description && <p className="home-symptom-description">{preview.description}</p>}{preview.latest && <div className="home-symptom-meta"><span>最近记录：<time dateTime={item.followup.latestOccurredAt!}>{preview.latest}</time></span></div>}</li> })}</ul> : <Typography variant="caption">暂无跟进症状</Typography>}
        <div className="home-followup-actions">
          <HohoButton fullWidth variant="primary" onClick={() => navigate('/cases')}>症状跟进<UpdateDot show={updates.some(i=>i.destination==='symptom')}/></HohoButton>
          <HohoButton fullWidth variant="secondary" onClick={() => navigate('/visit-summary')}>情况单</HohoButton>
        </div>
      </HealthCard>
    </div>
    <HealthCard className="home-flow-card nurse-home-dialogue" aria-label="健康随记">
      <div className="nurse-home-dialogue__intro">
        <div className="home-followup-heading"><NotebookText size={18} strokeWidth={1.8} aria-hidden="true" /><Typography variant="sectionTitle">健康随记</Typography></div>
        <Typography className="nurse-home-dialogue__summary" variant="caption">吃了什么、睡得怎样、哪里不舒服，都帮你记清楚。</Typography>
        <div className="nurse-station-visual">{nurseVisual}</div>
      </div>
      <RecordEntryActions disabled={!token || !memberId} identity={identity} onSmartRecord={() => navigate('/smart-record?source=front-desk', { state: { frontDeskReturn: true } })} onRecord={(category, kind) => navigate('/health-events', { state: { nurseRecordEntry: category, nurseRecordDietKind: kind, calendarIdentity: identity, frontDeskReturn: true } })} />
    </HealthCard>
  </section>
}
