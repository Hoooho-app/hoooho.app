import { HealthEventCardSurface } from '../../../components/health/HealthEventCardSurface'
import { buildHealthEventQuickFacts, getHealthEventDefinitionTitle } from '../../../services/healthEventCardPresentation'
import type { HealthEventApiDto } from '../../../types'

interface EventSummarySectionProps {
  event: HealthEventApiDto
}

export function EventSummarySection({ event }: EventSummarySectionProps) {
  const displayed = event.eventSummary?.displayedResult
  if (!displayed) return null

  return (
    <section aria-label="健康事件概览">
      <HealthEventCardSurface
        definitionTitle={getHealthEventDefinitionTitle(displayed)}
        quickFacts={buildHealthEventQuickFacts({ startTime: event.startTime, summary: displayed })}
        status={event.status}
      />
    </section>
  )
}
