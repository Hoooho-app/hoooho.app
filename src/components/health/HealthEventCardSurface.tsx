import type { HealthEventCardIconPresentation, HealthEventStage } from '../../types'
import { getHealthEventStatusPresentation } from '../../services/healthEventCardPresentation'
import { HealthCard, HealthTag, Typography } from '../design-system'
import { HealthEventCardChevron, HealthEventCardIcon } from './HealthEventCardIcon'

interface HealthEventCardSurfaceProps {
  className?: string
  dateLabel?: string
  ageAtOccurrenceLabel?: string | null
  displayTitle: string
  durationLabel?: string | null
  icon?: HealthEventCardIconPresentation
  summaryFragments: string[]
  status: HealthEventStage
  interactive?: boolean
  memberName?: string
  showChevron?: boolean
}

export function HealthEventCardSurface({
  className = '',
  dateLabel,
  ageAtOccurrenceLabel,
  displayTitle,
  durationLabel,
  icon,
  summaryFragments,
  status,
  interactive = false,
  memberName,
  showChevron = false
}: HealthEventCardSurfaceProps) {
  const statusPresentation = getHealthEventStatusPresentation(status)

  return (
    <HealthCard interactive={interactive} className={`${className} flex ${dateLabel ? 'min-h-[104px]' : 'min-h-[96px]'} items-center gap-3`}>
      <div className={`min-w-0 flex-1 ${dateLabel ? 'health-event-list-card__content' : 'space-y-2'}`}>
        {memberName && <Typography className="block truncate text-primary" variant="caption">{memberName}</Typography>}
        {dateLabel && (
          <div className="health-event-list-card__date text-[rgb(var(--hoho-color-text-weak))]">
            <Typography className="shrink-0 whitespace-nowrap tabular-nums" variant="caption">{dateLabel}</Typography>
            {durationLabel && <span aria-hidden="true" className="health-event-list-card__time-divider" />}
            {durationLabel && <Typography className="shrink-0 whitespace-nowrap tabular-nums" variant="caption">{durationLabel}</Typography>}
            {ageAtOccurrenceLabel && <Typography className="shrink-0 whitespace-nowrap tabular-nums" variant="caption">{ageAtOccurrenceLabel}</Typography>}
          </div>
        )}
        {dateLabel ? (
          <div className="health-event-list-card__subject">
            {icon && <HealthEventCardIcon presentation={icon} />}
            <div className="health-event-list-card__subject-copy">
              <Typography className="min-w-0 truncate" title={displayTitle} variant="cardTitle">{displayTitle}</Typography>
              <HealthTag className="shrink-0" tone={statusPresentation.tone}>{statusPresentation.label}</HealthTag>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            <Typography className="min-w-0 truncate" variant="cardTitle">{displayTitle}</Typography>
            <HealthTag className="shrink-0" tone={statusPresentation.tone}>{statusPresentation.label}</HealthTag>
          </div>
        )}
        {!dateLabel && summaryFragments.length > 0 && (
          <Typography className="block truncate" title={summaryFragments.join(' · ')} variant="caption">
            {summaryFragments.join(' · ')}
          </Typography>
        )}
      </div>
      {showChevron && <HealthEventCardChevron aria-hidden="true" className="health-event-list-card__chevron" size={18} strokeWidth={1.8} />}
    </HealthCard>
  )
}
