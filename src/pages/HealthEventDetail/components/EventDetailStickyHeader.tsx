import { ArrowRight } from 'lucide-react'
import { Avatar } from '../../../components/common'
import { HohoButton } from '../../../components/design-system'
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
        <Avatar name={subject.name} size="md" src={subject.avatar} />
        <div className="min-w-0">
          <span className="hoho-text-caption block">记录对象</span>
          <strong className="mt-0.5 block truncate text-base">{subject.name}</strong>
          <span className="hoho-text-caption block truncate">{subject.genderLabel} · {subject.displayAge}</span>
        </div>
      </div>
      {showActions && <HohoButton className="health-event-next-button" onClick={onAction}>下一步<ArrowRight size={18} strokeWidth={1.8} /></HohoButton>}
    </section>
  )
}
