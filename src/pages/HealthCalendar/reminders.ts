import type { MedicationReminderDto } from '../../services/medicationReminders'
import { getLocalDateKey } from '../../utils/localCalendarDate'

// Scheduled items stay separate from JournalEntry: viewing them never creates a health fact.
export interface CalendarReminder {
  id: string
  sourceId: string
  kind: 'medication' | 'vaccination' | 'follow-up'
  group: 'medication' | 'materials'
  day: string
  scheduledAt: string
  title: string
  detail: string
  href: string
}
export function medicationCalendarReminders(plans: readonly MedicationReminderDto[], accountId: string, memberId: string, today: string): CalendarReminder[] {
  const result = new Map<string, CalendarReminder>()
  for (const reminder of plans) {
    if (reminder.accountId !== accountId || reminder.memberId !== memberId || reminder.status !== 'active') continue
    for (const occurrence of reminder.occurrences) {
      const day = getLocalDateKey(occurrence.scheduledAt)
      if (occurrence.completed || !day || day < today) continue
      const id = `${reminder.id}:${occurrence.id}`
      result.set(id, { id, sourceId: reminder.id, kind: 'medication', group: 'medication', day, scheduledAt: occurrence.scheduledAt, title: reminder.plan.medicationName, detail: `${reminder.plan.amount}${reminder.plan.unit}`, href: `/medication-reminders?reminderId=${encodeURIComponent(reminder.id)}` })
    }
  }
  return [...result.values()].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.id.localeCompare(b.id))
}
export function calendarReminderDays(reminders: readonly CalendarReminder[], category: string) {
  const days = new Map<string, CalendarReminder[]>()
  for (const reminder of reminders) {
    if (category && reminder.group !== category) continue
    const items = days.get(reminder.day) ?? []
    items.push(reminder); days.set(reminder.day, items)
  }
  return days
}
