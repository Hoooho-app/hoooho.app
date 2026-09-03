import { ArrowRight } from 'lucide-react'
import { HohoButton } from '../../../components/design-system'
import { RecordSubjectCard } from '../../../components/health'
import type { HealthEventSubject } from '../../../services/healthEventPersonalization'

interface EventDetailStickyHeaderProps {
  onAction: () => void
  showActions?: boolean
  subject: HealthEventSubject
}

export function EventDetailStickyHeader({ onAction, showActions = true, subject }: EventDetailStickyHeaderProps) {
  return (
    <section className="health-event-detail-sticky">
      <div className="health-event-detail-sticky__identity">
        <RecordSubjectCard age={subject.displayAge} avatar={subject.avatar} gender={subject.genderLabel} name={subject.name} />
      </div>
      {showActions && <HohoButton className="health-event-next-button" onClick={onAction}>就诊准备<ArrowRight size={18} strokeWidth={1.8} /></HohoButton>}
    </section>
  )
}
