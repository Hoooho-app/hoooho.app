import type { HealthEventListItemViewModel, HealthEventStage } from '../../types'
import { HealthEventCard } from './HealthEventCard'
import { groupHealthEventsByLocalDate } from '../../services/healthEventDateGrouping'
import { formatPlainMonthDay, formatPlainWeekday } from '../../utils/localCalendarDate'

interface HealthEventTimelineProps {
  events: HealthEventListItemViewModel[]
  onStatusChange?: (eventId: string, status: HealthEventStage) => Promise<void>
  onDelete?: (eventId: string) => Promise<void>
}

export function HealthEventTimeline({ events, onStatusChange, onDelete }: HealthEventTimelineProps) {
  const dateGroups = groupHealthEventsByLocalDate(events)

  return (
    <div>
      <div aria-label="按日期排序的健康事件" className="health-event-list space-y-3">
        {dateGroups.flatMap((dateGroup) => dateGroup.events.map((event) => (
          <HealthEventCard
            dateLabel={formatPlainMonthDay(dateGroup.date)}
            event={event}
            key={event.id}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
            weekdayLabel={formatPlainWeekday(dateGroup.date)}
          />
        )))}
      </div>
      <p className="care-optional-detail hoho-text-caption py-5 text-center">没有更多事件了</p>
    </div>
  )
}
