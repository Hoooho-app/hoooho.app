import { ChevronRight, Pill, Syringe, CalendarClock } from 'lucide-react'
import type { CalendarReminder } from './reminders'

export function CalendarReminderRows({ reminders, onOpen }: { reminders: readonly CalendarReminder[]; onOpen: (reminder: CalendarReminder) => void }) {
  return <div className="calendar-reminder-rows">{reminders.map(reminder => {
    const Icon = reminder.kind === 'medication' ? Pill : reminder.kind === 'vaccination' ? Syringe : CalendarClock
    const at = new Date(reminder.scheduledAt)
    const clock = at.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    return <button className="calendar-reminder-row" type="button" key={reminder.id} data-reminder-id={reminder.sourceId} data-tone={reminder.group} onClick={() => onOpen(reminder)}><Icon size={20} strokeWidth={1.7} aria-hidden="true"/><span><strong>{reminder.title}</strong><small><time dateTime={reminder.scheduledAt}>{clock}</time> · {reminder.detail}</small></span><span className="calendar-reminder-status">待执行</span><ChevronRight size={16} aria-hidden="true"/></button>
  })}</div>
}
