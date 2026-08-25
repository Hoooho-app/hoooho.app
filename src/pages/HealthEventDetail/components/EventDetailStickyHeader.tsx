import { Network } from 'lucide-react'
import { Avatar } from '../../../components/common'
import { HohoButton } from '../../../components/design-system'
import type { HealthEventSubject } from '../../../services/healthEventPersonalization'

interface EventDetailStickyHeaderProps {
  onAction: () => void
  onAddRecord: () => void
  showActions?: boolean
  subject: HealthEventSubject
}

export function EventDetailStickyHeader({ onAction, onAddRecord, showActions = true, subject }: EventDetailStickyHeaderProps) {
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
      {showActions && <div className="grid min-w-[138px] gap-2">
        <HohoButton className="min-h-10" onClick={onAction}><Network size={18} strokeWidth={1.8} />行动</HohoButton>
        <HohoButton className="min-h-10" onClick={onAddRecord} variant="secondary">新增记录</HohoButton>
      </div>}
    </section>
  )
}
