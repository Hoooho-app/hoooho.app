import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { HealthEventListItemViewModel, HealthEventStage } from '../../types'
import { HealthEventCard } from './HealthEventCard'

interface DateGroup {
  date: string
  events: HealthEventListItemViewModel[]
}

interface YearGroup {
  year: string
  dates: DateGroup[]
}

interface HealthEventTimelineProps {
  events: HealthEventListItemViewModel[]
  onStatusChange?: (eventId: string, status: HealthEventStage) => Promise<void>
  onDelete?: (eventId: string) => Promise<void>
}

function groupEvents(events: HealthEventListItemViewModel[]): YearGroup[] {
  const years = new Map<string, Map<string, HealthEventListItemViewModel[]>>()
  for (const event of [...events].sort((left, right) => right.startTime.localeCompare(left.startTime))) {
    const date = event.startTime.slice(0, 10)
    const year = date.slice(0, 4)
    if (!years.has(year)) years.set(year, new Map())
    const dates = years.get(year)!
    dates.set(date, [...(dates.get(date) ?? []), event])
  }
  return [...years].map(([year, dates]) => ({ year, dates: [...dates].map(([date, groupedEvents]) => ({ date, events: groupedEvents })) }))
}

export function HealthEventTimeline({ events, onStatusChange, onDelete }: HealthEventTimelineProps) {
  return (
    <div className="space-y-5">
      {groupEvents(events).map((yearGroup) => (
        <section key={yearGroup.year}>
          <h2 className="mb-4 text-lg font-semibold text-primary">{yearGroup.year}年</h2>
          <div className="space-y-5">
            {yearGroup.dates.map((dateGroup) => {
              const date = parseISO(dateGroup.date)
              return (
                <section key={dateGroup.date}>
                  <div className="mb-2 grid grid-cols-[68px_minmax(0,1fr)] gap-3">
                    <div className="text-right">
                      <strong className="block text-base text-primary">{format(date, 'M月d日')}</strong>
                      <span className="mt-1 block text-xs text-text-secondary">{format(date, 'EEE', { locale: zhCN })}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {dateGroup.events.map((event, index) => (
                      <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-3" key={event.id}>
                        <time className="pt-3 text-right text-xs font-medium text-text-secondary">{format(parseISO(event.startTime), 'HH:mm')}</time>
                        <div className={`relative border-l border-primary/20 pl-4 ${index < dateGroup.events.length - 1 ? 'pb-1' : ''}`}>
                          <span className="absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                          <HealthEventCard event={event} onStatusChange={onStatusChange} onDelete={onDelete} />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </section>
      ))}
      <p className="py-3 text-center text-sm text-text-secondary">没有更多事件了</p>
    </div>
  )
}
