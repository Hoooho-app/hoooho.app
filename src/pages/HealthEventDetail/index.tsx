import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { healthEvents } from '../../mock/events'
import type { HealthEventStage } from '../../types'
import { useHealthEventPersonalization } from '../../hooks/useHealthEventPersonalization'
import {
  EventHeader,
  EventIdentitySection,
  EventStatus,
  AttachmentSection,
  ConcernSection,
  MedicalInfoSection,
  NextActionSection,
  PersonalizedModulesSection,
  SymptomSection,
  StageDetailSection,
  TemperatureChartSection,
  TimelineSection
} from './components'

export function HealthEventDetailPage() {
  const { eventId } = useParams()
  const event = healthEvents.find((item) => item.id === eventId)
  const initialStage: HealthEventStage = event?.status === 'recovered' ? 'recovered' : event?.status === 'ongoing' ? 'handling' : 'observing'
  const [stage, setStage] = useState<HealthEventStage>(initialStage)
  const { subject, recommendedModules } = useHealthEventPersonalization(event?.memberId, stage)

  if (!event) return <Navigate to="/health-events" replace />

  return (
    <main className="app-shell bg-background pb-8">
      <EventHeader />
      <div className="page-content space-y-6">
        <EventIdentitySection subject={subject} />
        <SymptomSection event={event} />
        <EventStatus stage={stage} onStageChange={setStage} />
        <StageDetailSection event={event} stage={stage} />
        <TimelineSection event={event} />
        <TemperatureChartSection event={event} />
        <AttachmentSection event={event} />
        <PersonalizedModulesSection modules={recommendedModules} />
        <ConcernSection event={event} />
        <MedicalInfoSection event={event} />
        <NextActionSection status={event.status} />
      </div>
    </main>
  )
}
