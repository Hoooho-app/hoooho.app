import type { HealthEventListItemViewModel, HealthEventStage } from '../../types'
import { HealthEventCard } from './HealthEventCard'
import { groupHealthEventsByLocalDate } from '../../services/healthEventDateGrouping'
import { formatHealthEventDate } from '../../services/healthEventCardPresentation'
import { formatPlainMonthDay, formatPlainWeekday } from '../../utils/localCalendarDate'
import { HealthTrace } from '../design-system'

interface HealthEventTimelineProps {
  events: HealthEventListItemViewModel[]
  onStatusChange?: (eventId: string, status: HealthEventStage) => Promise<void>
  onDelete?: (eventId: string) => Promise<void>
}

export function HealthEventTimeline({ events, onStatusChange, onDelete }: HealthEventTimelineProps) {
  const dateGroups = groupHealthEventsByLocalDate(events)

  return (
    <div className="health-event-story">
      <HealthTrace className="health-event-story__rail" variant="rail" />
      <div aria-label="按日期排序的健康随记" className="health-event-list">
        {dateGroups.flatMap((dateGroup) => dateGroup.events.map((event) => (
          <HealthEventCard
            dateLabel={formatHealthEventDate(event.startTime) ?? `开始于 ${formatPlainMonthDay(dateGroup.date)} ${formatPlainWeekday(dateGroup.date)}`}
            event={event}
            key={event.id}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
          />
        )))}
      </div>
      <p className="care-optional-detail hoho-text-caption py-5 text-center">没有更多健康随记了</p>
    </div>
  )
}
