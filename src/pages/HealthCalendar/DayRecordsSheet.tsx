import { ChevronRight } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { BottomSheetSurface, HohoButton, StatusNotice } from '../../components/design-system'
import { JournalCategoryIcon } from '../HealthEvents/JournalCategoryIcon'
import type { JournalEntry } from '../HealthEvents/timeViewModel'
import { journalOccurrenceAt } from '../../../shared/journal-occurrence.mjs'
import { presentCalendarRecord,compactCalendarSummary } from './presentation'
import type { CalendarReminder } from './reminders'
import { CalendarReminderRows } from './CalendarReminderRows'

export function DayRecordsSheet({ day, entries, reminders = [], suspended, loading, error, onRetry, onClose, onOpen, onReminder }: { day: string; entries: readonly JournalEntry[]; reminders?: readonly CalendarReminder[]; suspended: boolean; loading: boolean; error: string; onRetry: () => void; onClose: () => void; onOpen: (entry: JournalEntry) => void; onReminder?: (reminder: CalendarReminder) => void }) {
  const root = useRef<HTMLDivElement>(null), lastRecord = useRef(''), scroll = useRef(0), titleId = useId()
  useLayoutEffect(() => {
    if (suspended) return
    const section = root.current?.closest('section'), heading = section?.querySelector('h2'), body = root.current?.parentElement
    if (heading && section) { heading.id = titleId; section.setAttribute('aria-labelledby', titleId) }
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !section) return
      const targets = Array.from(section.querySelectorAll<HTMLElement>('button:not([disabled]), summary')).filter(el => el.getClientRects().length)
      if (!targets.length) return
      event.preventDefault(); event.stopImmediatePropagation()
      const index = targets.indexOf(document.activeElement as HTMLElement)
      targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus()
    }
    section?.addEventListener('keydown', trap, true)
    if (body) body.scrollTop = scroll.current
    return () => { section?.removeEventListener('keydown', trap, true) }
  }, [suspended, titleId])
  useEffect(() => {
    if (suspended || !lastRecord.current) return
    const frame = requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-day-record="${CSS.escape(lastRecord.current)}"]`)?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [suspended])
  const reminderTitle = `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日 ${new Date(`${day}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'long' })}`
  return <BottomSheetSurface open={!suspended} viewportAware label="当天记录" title={reminders.length ? reminderTitle : `${Number(day.slice(5,7))}月${Number(day.slice(8))}日 · ${entries.length}条记录`} className="calendar-day-sheet" onClose={onClose}>
    <div ref={root}>
      {reminders.length > 0 && <p className="calendar-day-reminder-count">{reminders.length}项待办{entries.length ? ` · ${entries.length}条记录` : ''}</p>}
      {loading && <StatusNotice title="正在读取当天记录"/>}
      {error && <StatusNotice tone="error" title={error} action={<HohoButton variant="secondary" onClick={onRetry}>重新加载</HohoButton>}/>}
      {!loading && !error && !entries.length && !reminders.length && <p>当天暂无此类记录</p>}
      {reminders.length > 0 && onReminder && <CalendarReminderRows reminders={reminders} onOpen={onReminder}/>}
      <div className="calendar-day-records">{entries.map(entry => {
        const presented = presentCalendarRecord(entry), at = new Date(journalOccurrenceAt(entry, entry.occurredAt))
        const clock = at.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
        return <article key={entry.id} data-tone={presented.group ?? 'neutral'}>
          <button type="button" data-day-record={entry.id} onClick={() => { lastRecord.current = entry.id; scroll.current = root.current?.parentElement?.scrollTop ?? 0; onOpen(entry) }}>
            <span className="calendar-day-icon"><JournalCategoryIcon category={entry.categories?.[0] ?? 'other'} dietKind={entry.diet?.kind} size={22} strokeWidth={1.75}/></span>{entry.timePrecision==='exact'?<time dateTime={at.toISOString()}>{clock}</time>:<span className="calendar-day-clock" aria-label="具体时间未记录">—</span>}
            <span className="calendar-day-summary"><strong title={entry.content}>{compactCalendarSummary(entry)}</strong></span><ChevronRight aria-hidden="true" size={16}/>
          </button>
        </article>
      })}</div>
    </div>
  </BottomSheetSurface>
}
