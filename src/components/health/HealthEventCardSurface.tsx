import { ChevronRight } from 'lucide-react'
import type { HealthEventStage } from '../../types'
import { getHealthEventStatusPresentation } from '../../services/healthEventCardPresentation'
import { HealthCard, HealthTag, Typography } from '../design-system'

interface HealthEventCardSurfaceProps {
  className?: string
  dateLabel?: string
  displayTitle: string
  durationLabel?: string | null
  summaryFragments: string[]
  status: HealthEventStage
  interactive?: boolean
  memberName?: string
  showChevron?: boolean
}

export function HealthEventCardSurface({
  className = '',
  dateLabel,
  displayTitle,
  durationLabel,
  summaryFragments,
  status,
  interactive = false,
  memberName,
  showChevron = false
}: HealthEventCardSurfaceProps) {
  const statusPresentation = getHealthEventStatusPresentation(status)

  return (
    <HealthCard interactive={interactive} className={`${className} flex ${dateLabel ? 'min-h-[104px]' : 'min-h-[96px]'} items-center gap-3`}>
      <div className={`min-w-0 flex-1 ${dateLabel ? 'space-y-1.5' : 'space-y-2'}`}>
        {memberName && <Typography className="block truncate text-primary" variant="caption">{memberName}</Typography>}
        {dateLabel && (
          <div className="health-event-list-card__date flex min-w-0 items-baseline justify-between gap-3 text-[rgb(var(--hoho-color-text-weak))]">
            <Typography className="min-w-0 truncate tabular-nums" variant="caption">{dateLabel}</Typography>
            {durationLabel && <Typography className="shrink-0 tabular-nums" variant="caption">{durationLabel}</Typography>}
          </div>
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          <Typography className="min-w-0 truncate" variant="cardTitle">{displayTitle}</Typography>
          <HealthTag className="shrink-0" tone={statusPresentation.tone}>{statusPresentation.label}</HealthTag>
        </div>
        {summaryFragments.length > 0 && (
          <Typography className="block truncate" title={summaryFragments.join(' · ')} variant="caption">
            {summaryFragments.join(' · ')}
          </Typography>
        )}
      </div>
      {showChevron && <ChevronRight className="shrink-0 text-[rgb(var(--hoho-color-text-weak))]" size={18} />}
    </HealthCard>
  )
}
