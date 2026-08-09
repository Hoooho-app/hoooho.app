import { format, parseISO } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import type { HealthEventListItemViewModel } from '../../types'
import { HealthEventCard } from './HealthEventCard'

interface DateGroup {
  date: string
  events: HealthEventListItemViewModel[]
}

interface YearGroup {
  year: string
  dates: DateGroup[]
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

export function HealthEventTimeline({ events }: { events: HealthEventListItemViewModel[] }) {
  return (
    <div className="space-y-5">
      {groupEvents(events).map((yearGroup) => (
        <section key={yearGroup.year}>
          <h2 className="mb-3 text-lg font-semibold text-primary">{yearGroup.year}年</h2>
          <div className="space-y-5">
            {yearGroup.dates.map((dateGroup) => {
              const date = parseISO(dateGroup.date)
              return (
                <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-3" key={dateGroup.date}>
                  <div className="pt-1 text-right">
                    <strong className="block text-base text-primary">{format(date, 'M月d日')}</strong>
                    <span className="mt-1 block text-xs text-text-secondary">{format(date, 'EEE', { locale: zhCN })}</span>
                  </div>
                  <div className="relative space-y-3 border-l border-primary/20 pl-4">
                    <span className="absolute -left-[5px] top-4 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                    {dateGroup.events.map((event) => <HealthEventCard event={event} key={event.id} compact />)}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
      <p className="py-3 text-center text-sm text-text-secondary">没有更多事件了</p>
    </div>
  )
}
