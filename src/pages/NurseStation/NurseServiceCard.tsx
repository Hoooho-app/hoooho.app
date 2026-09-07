import { ChevronRight, type LucideIcon } from 'lucide-react'

interface NurseServiceCardProps {
  accent?: boolean
  count: number
  icon: LucideIcon
  label: string
  onClick: () => void
  tone: 'cream' | 'mint' | 'blue'
}

export function NurseServiceCard({ accent = false, count, icon: Icon, label, onClick, tone }: NurseServiceCardProps) {
  return <button aria-label={`${label}${count ? `，${count > 9 ? '9+' : count}项待查看` : ''}`} className="nurse-service-card" data-accent={accent} data-tone={tone} onClick={onClick} type="button">
    <Icon aria-hidden="true" className="nurse-service-card__icon" strokeWidth={1.8} />
    <span>{label}</span>
    {count > 0 && <strong aria-label={`${count}项`}>{count > 9 ? '9+' : count}</strong>}
    <ChevronRight aria-hidden="true" className="nurse-service-card__arrow" />
  </button>
}
