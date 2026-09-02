import { HealthEventCardSurface } from '../../../components/health/HealthEventCardSurface'
import { getHealthEventDisplayTitle, getHealthEventSummaryFragments } from '../../../services/healthEventCardPresentation'
import type { HealthEventApiDto } from '../../../types'

interface EventSummarySectionProps {
  event: HealthEventApiDto
}

export function EventSummarySection({ event }: EventSummarySectionProps) {
  const displayed = event.eventSummary?.displayedResult
  if (!displayed) return null

  return (
    <section aria-label="健康随记概览">
      <HealthEventCardSurface
        displayTitle={getHealthEventDisplayTitle(event.title, displayed)}
        summaryFragments={getHealthEventSummaryFragments({ status: event.status, summary: displayed }).map(({ label }) => label)}
        status={event.status}
      />
    </section>
  )
}
