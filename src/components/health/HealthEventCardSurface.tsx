import { ChevronRight } from 'lucide-react'
import type { HealthEventStage } from '../../types'
import { getHealthEventStatusPresentation } from '../../services/healthEventCardPresentation'
import { HealthCard, HealthTag, Typography } from '../design-system'

interface HealthEventCardSurfaceProps {
  className?: string
  definitionTitle: string
  quickFacts: string[]
  status: HealthEventStage
  interactive?: boolean
  memberName?: string
  showChevron?: boolean
}

export function HealthEventCardSurface({
  className = '',
  definitionTitle,
  quickFacts,
  status,
  interactive = false,
  memberName,
  showChevron = false
}: HealthEventCardSurfaceProps) {
  const statusPresentation = getHealthEventStatusPresentation(status)

  return (
    <HealthCard interactive={interactive} className={`${className} flex min-h-[96px] items-center gap-3`}>
      <div className="min-w-0 flex-1 space-y-2">
        {memberName && <Typography className="block truncate text-primary" variant="caption">{memberName}</Typography>}
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
