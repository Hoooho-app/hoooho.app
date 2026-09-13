import type { MedicationReminderPlan, NurseStationItemStatus } from '../../features/nurse-station/state'

export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const clock = (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
export const atLocal = (day: string, time: string) => new Date(`${day}T${time}:00`)
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(atLocal(value, '00:00').getTime())

export function nextOccurrences(plan: Pick<MedicationReminderPlan, 'mode' | 'times' | 'intervalHours' | 'startDate' | 'endDate' | 'durationDays' | 'longTerm'>, from = new Date(), count = 3) {
  if (!validDate(plan.startDate)) return []
  const times = [...new Set(plan.times.filter(validTime))].sort()
  if (!times.length || (plan.mode === 'interval' && !(Number(plan.intervalHours) > 0))) return []
  const end = plan.longTerm ? Infinity : plan.endDate && validDate(plan.endDate) ? atLocal(plan.endDate, '23:59').getTime() : plan.durationDays ? atLocal(plan.startDate, '23:59').getTime() + (Math.max(1, plan.durationDays) - 1) * 86_400_000 : Infinity
  const values: Date[] = []
  if (plan.mode === 'interval') {
    let next = atLocal(plan.startDate, times[0])
    const step = Number(plan.intervalHours) * 3_600_000
    while (next.getTime() < from.getTime()) next = new Date(next.getTime() + step)
    while (values.length < count && next.getTime() <= end) { values.push(next); next = new Date(next.getTime() + step) }
  } else {
    for (let offset = 0; values.length < count && offset < 370; offset++) {
      const day = new Date(atLocal(plan.startDate, '00:00').getTime() + offset * 86_400_000)
      const key = localDate(day)
      for (const time of times) {
        const value = atLocal(key, time)
        if (value.getTime() >= from.getTime() && value.getTime() <= end) values.push(value)
        if (plan.mode === 'once' || values.length >= count) break
      }
      if (plan.mode === 'once') break
    }
  }
  return values.slice(0, count)
}

export function effectiveStatus(status: NurseStationItemStatus, plan: MedicationReminderPlan, notification: NotificationPermission | 'unsupported', now = Date.now()): NurseStationItemStatus {
  if (['paused', 'completed', 'ended'].includes(status)) return status
  if (notification !== 'granted') return 'notification_disabled'
  if (status === 'snoozed' && plan.snoozedUntil && Date.parse(plan.snoozedUntil) <= now) return 'due'
  if (status === 'skipped_current' && Date.parse(plan.nextOccurrenceAt) <= now) return 'due'
  if (Date.parse(plan.nextOccurrenceAt) <= now) return 'due'
  return status === 'pending_confirmation' ? 'active' : status
}

export const planLabel = (plan: MedicationReminderPlan) => plan.mode === 'daily' ? `每日${plan.times.length}次` : plan.mode === 'interval' ? `每${plan.intervalHours}小时` : '仅一次'
export const routeLabel = (route: string) => ({ oral: '口服', topical: '外用', inhaled: '吸入', nasal: '鼻用', ophthalmic: '眼用', other: '其他' }[route] ?? route)
export const formatOccurrence = (iso: string) => { const date = new Date(iso); const today = localDate(); const prefix = localDate(date) === today ? '今天' : `${date.getMonth() + 1}月${date.getDate()}日`; return `${prefix}${clock(date)}` }
