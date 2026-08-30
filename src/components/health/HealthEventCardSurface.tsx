import { ChevronRight } from 'lucide-react'
import type { HealthEventStage } from '../../types'
import { getHealthEventStatusPresentation } from '../../services/healthEventCardPresentation'
import { HealthCard, HealthTag, Typography } from '../design-system'

interface HealthEventCardSurfaceProps {
  className?: string
  dateLabel?: string
  definitionTitle: string
  quickFacts: string[]
  status: HealthEventStage
  interactive?: boolean
  memberName?: string
  showChevron?: boolean
  weekdayLabel?: string
}

export function HealthEventCardSurface({
  className = '',
  dateLabel,
  definitionTitle,
  quickFacts,
  status,
  interactive = false,
  memberName,
  showChevron = false,
  weekdayLabel
}: HealthEventCardSurfaceProps) {
  const statusPresentation = getHealthEventStatusPresentation(status)

  return (
    <HealthCard interactive={interactive} className={`${className} flex ${dateLabel ? 'min-h-[104px]' : 'min-h-[96px]'} items-center gap-3`}>
      <div className={`min-w-0 flex-1 ${dateLabel ? 'space-y-1.5' : 'space-y-2'}`}>
        {memberName && <Typography className="block truncate text-primary" variant="caption">{memberName}</Typography>}
        {dateLabel && (
          <div className="health-event-list-card__date flex items-baseline gap-2 text-[rgb(var(--hoho-color-text-weak))]">
            <Typography className="font-medium tabular-nums" variant="caption">{dateLabel}</Typography>
            {weekdayLabel && <Typography variant="caption">{weekdayLabel}</Typography>}
          </div>
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          <Typography className="min-w-0 truncate" variant="cardTitle">{definitionTitle}</Typography>
          <HealthTag className="shrink-0" tone={statusPresentation.tone}>{statusPresentation.label}</HealthTag>
        </div>
        {quickFacts.length > 0 && (
          <Typography className="block truncate" title={quickFacts.join(' · ')} variant="caption">
            {quickFacts.join(' · ')}
          </Typography>
        )}
      </div>
      {showChevron && <ChevronRight className="shrink-0 text-[rgb(var(--hoho-color-text-weak))]" size={18} />}
    </HealthCard>
  )
}
