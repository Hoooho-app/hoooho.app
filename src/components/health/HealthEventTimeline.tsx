import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
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
  for (const event of [...events].sort((left, right) => right.startTime.localeCompare(left.startTime))) {
    const date = event.startTime.slice(0, 10)
    dates.set(date, [...(dates.get(date) ?? []), event])
  }
  return [...dates].map(([date, groupedEvents]) => ({ date, events: groupedEvents }))
}

export function HealthEventTimeline({ events, onStatusChange, onDelete }: HealthEventTimelineProps) {
  return (
    <div className="space-y-5">
      {groupEvents(events).map((dateGroup) => {
        const date = parseISO(dateGroup.date)
        return (
          <section className="grid grid-cols-[72px_minmax(0,1fr)] gap-3" key={dateGroup.date}>
            <div className="pt-1 text-right">
              <strong className="block whitespace-nowrap text-base font-semibold text-primary">{format(date, 'M月d日')}</strong>
              <span className="mt-1 block text-xs text-text-secondary">{format(date, 'EEE', { locale: zhCN })}</span>
            </div>
            <div className="space-y-3 border-l border-primary/20 pl-4">
              {dateGroup.events.map((event) => (
                <div className="relative" key={event.id}>
                  <span className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                  <HealthEventCard event={event} onStatusChange={onStatusChange} onDelete={onDelete} />
                </div>
              ))}
            </div>
          </section>
        )
      })}
      <p className="py-3 text-center text-sm text-text-secondary">没有更多事件了</p>
    </div>
  )
}
