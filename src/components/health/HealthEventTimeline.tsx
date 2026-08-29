import { HealthTimeline } from '../design-system'
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
  const items = groupHealthEventsByLocalDate(events).map((dateGroup) => ({
    id: dateGroup.date,
    label: (
      <>
        <strong className="block whitespace-nowrap">{formatPlainMonthDay(dateGroup.date)}</strong>
        <span className="mt-1 block font-normal text-[rgb(var(--hoho-color-text-weak))]">
          {formatPlainWeekday(dateGroup.date)}
        </span>
      </>
    ),
    content: (
      <div className="space-y-3">
        {dateGroup.events.map((event) => (
          <HealthEventCard
            event={event}
            key={event.id}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
          />
        ))}
      </div>
    )
  }))

  return (
    <div>
      <HealthTimeline ariaLabel="按日期分组的健康事件" items={items} level="list" />
      <p className="care-optional-detail hoho-text-caption py-5 text-center">没有更多事件了</p>
    </div>
  )
}
