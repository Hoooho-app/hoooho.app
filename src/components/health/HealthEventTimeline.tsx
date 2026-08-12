import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { HealthTimeline } from '../design-system'
import type { HealthEventListItemViewModel, HealthEventStage } from '../../types'
import { HealthEventCard } from './HealthEventCard'

interface DateGroup {
  date: string
  events: HealthEventListItemViewModel[]
}

interface HealthEventTimelineProps {
  events: HealthEventListItemViewModel[]
  onStatusChange?: (eventId: string, status: HealthEventStage) => Promise<void>
  onDelete?: (eventId: string) => Promise<void>
}

function groupEvents(events: HealthEventListItemViewModel[]): DateGroup[] {
  const dates = new Map<string, HealthEventListItemViewModel[]>()
  for (const event of [...events].sort((left, right) => (
    right.occurredAt.localeCompare(left.occurredAt)
      || right.createdAt.localeCompare(left.createdAt)
      || right.id.localeCompare(left.id)
  ))) {
    const date = event.occurredAt.slice(0, 10)
    dates.set(date, [...(dates.get(date) ?? []), event])
  }
  return [...dates].map(([date, groupedEvents]) => ({ date, events: groupedEvents }))
}

export function HealthEventTimeline({ events, onStatusChange, onDelete }: HealthEventTimelineProps) {
  const items = groupEvents(events).map((dateGroup) => {
    const date = parseISO(dateGroup.date)

    return {
      id: dateGroup.date,
      label: (
        <>
          <strong className="block whitespace-nowrap">{format(date, 'M月d日')}</strong>
          <span className="mt-1 block font-normal text-[rgb(var(--hoho-color-text-weak))]">
            {format(date, 'EEE', { locale: zhCN })}
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
    }
  })

  return (
    <div>
      <HealthTimeline ariaLabel="按日期分组的健康事件" items={items} level="list" />
      <p className="hoho-text-caption py-5 text-center">没有更多事件了</p>
    </div>
  )
}
