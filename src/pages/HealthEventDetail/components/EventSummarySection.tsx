import { HealthCard, HealthTag, Typography } from '../../../components/design-system'
import type { HealthEventSummaryApiDto } from '../../../types'
import { compactSummaryTags } from './eventSummaryPresentation'

interface EventSummarySectionProps {
  summary: HealthEventSummaryApiDto
}

export function EventSummarySection({ summary }: EventSummarySectionProps) {
  const displayed = summary.displayedResult
  const tags = compactSummaryTags(displayed)

  return (
    <section aria-labelledby="event-summary-title">
      <HealthCard className="event-summary-card">
        <Typography id="event-summary-title" variant="sectionTitle">事件摘要</Typography>
        {tags.length > 0 && <div aria-label="主要症状和状态" className="event-summary-tags">{tags.map((tag) => <HealthTag key={tag} tone="primary">{tag}</HealthTag>)}</div>}
        <Typography className="event-summary-description" variant="body">{displayed.summary}</Typography>
      </HealthCard>
    </section>
  )
}
