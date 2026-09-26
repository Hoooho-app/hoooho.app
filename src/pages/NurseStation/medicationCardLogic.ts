import type { MedicationReminderDto, MedicationReminderOccurrence } from '../../services/medicationReminders'

const addDays = (day: string, amount: number) => {
  const [year, month, date] = day.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, date + amount))
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

export const reminderDateKey = (date: Date, timeZone: string) => {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

const clockInZone = (iso: string, timeZone: string) => new Intl.DateTimeFormat('zh-CN', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

export function formatReminderOccurrence(occurrence: MedicationReminderOccurrence, timeZone: string, now: Date) {
  const today = reminderDateKey(now, timeZone)
  if (occurrence.day === today) return `今天 ${clockInZone(occurrence.scheduledAt, timeZone)}`
  const [year, month, day] = occurrence.day.split('-').map(Number)
  const yearPrefix = year === Number(today.slice(0, 4)) ? '' : `${year}年`
  return `${yearPrefix}${month}月${day}日 ${clockInZone(occurrence.scheduledAt, timeZone)}`
}

export function reminderCourseText(reminder: MedicationReminderDto, now: Date) {
  const today = reminderDateKey(now, reminder.plan.timezone)
  if (today < reminder.plan.startDate) return reminder.totalDays ? `共${reminder.totalDays}天 · 尚未开始` : '长期 · 尚未开始'
  const toUtc = (day: string) => { const [year, month, date] = day.split('-').map(Number); return Date.UTC(year, month - 1, date) }
  const day = Math.floor((toUtc(today) - toUtc(reminder.plan.startDate)) / 86_400_000) + 1
  if (reminder.totalDays && day > reminder.totalDays) return `共${reminder.totalDays}天 · 疗程已结束`
  return reminder.totalDays ? `共${reminder.totalDays}天 · 第${day}天` : `长期 · 第${day}天`
}

export function reminderCoursePlanText(reminder: MedicationReminderDto) {
  const duration = reminder.totalDays ? `共${reminder.totalDays}天` : '长期'
  const schedule = reminder.plan.mode === 'daily'
    ? `每天${reminder.plan.times.length}次`
    : reminder.plan.mode === 'interval'
      ? `每${reminder.plan.intervalHours}小时一次`
      : '仅一次'
  return `${duration}，${schedule}`
}

export function reminderProgressGroupLabel(reminder: MedicationReminderDto, now: Date, weekIndex: number) {
  if (!reminder.totalDays || reminder.totalDays >= 7) return `第${weekIndex + 1}周`
  const today = reminderDateKey(now, reminder.plan.timezone)
  if (today < reminder.plan.startDate) return '尚未开始'
  const toUtc = (day: string) => { const [year, month, date] = day.split('-').map(Number); return Date.UTC(year, month - 1, date) }
  const day = Math.floor((toUtc(today) - toUtc(reminder.plan.startDate)) / 86_400_000) + 1
  return day > reminder.totalDays ? '疗程已结束' : `第${day}天`
}

export function reminderActionState(reminder: MedicationReminderDto, now: Date) {
  const today = reminderDateKey(now, reminder.plan.timezone)
  const todayOccurrences = reminder.occurrences.filter((item) => item.day === today)
  const todayCompleted = todayOccurrences.filter((item) => item.completed).length
  const next = reminder.nextOccurrence
  const allComplete = reminder.occurrences.length > 0 && !next
  const todayDone = Boolean(next && next.day > today && todayOccurrences.length && todayCompleted === todayOccurrences.length)
  return {
    allComplete,
    due: Boolean(next && Date.parse(next.scheduledAt) <= now.getTime()),
    next,
    todayCompleted,
    todayDone,
    todayTotal: todayOccurrences.length,
    takeLabel: allComplete ? '疗程已完成' : todayDone ? '今日已完成' : '已服用'
  }
}

export function weekRows(reminder: MedicationReminderDto) {
  const lastWeek = reminder.totalDays ? Math.ceil(reminder.totalDays / 7) : Math.max(1, ...reminder.occurrences.map((item) => item.weekIndex + 1))
  const weeks = Array.from({ length: lastWeek }, (_, weekIndex) => {
    const remaining = reminder.totalDays === null ? 7 : Math.max(0, reminder.totalDays - weekIndex * 7)
    const dayCount = Math.min(7, remaining || 7)
    const days = Array.from({ length: dayCount }, (_, dayIndex) => {
      const day = addDays(reminder.plan.startDate, weekIndex * 7 + dayIndex)
      return { day, occurrences: reminder.occurrences.filter((item) => item.day === day).sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt)) }
    })
    const rows = Math.max(1, ...days.map((item) => item.occurrences.length))
    return { weekIndex, days, rows }
  })
  return Array.from({ length: Math.ceil(weeks.length / 4) }, (_, rowIndex) => weeks.slice(rowIndex * 4, rowIndex * 4 + 4))
}
