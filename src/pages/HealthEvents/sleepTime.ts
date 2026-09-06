export const MINUTES_PER_DAY = 24 * 60

export function normalizeClockMinutes(value: number) {
  return ((Math.round(value) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

export function snapClockMinutes(value: number, step = 5) {
  return normalizeClockMinutes(Math.round(value / step) * step)
}

export function clockMinutesFromPoint(x: number, y: number, centerX: number, centerY: number) {
  const angle = Math.atan2(y - centerY, x - centerX) + Math.PI / 2
  return normalizeClockMinutes((angle / (Math.PI * 2)) * MINUTES_PER_DAY)
}

export function clockMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

export function dateAtClock(reference: Date, minutes: number) {
  const result = new Date(reference)
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  return result
}

export function sleepRangeFromClocks(startReference: Date, endReference: Date, startMinutes: number, endMinutes: number) {
  const start = dateAtClock(startReference, normalizeClockMinutes(startMinutes))
  let end = dateAtClock(endReference, normalizeClockMinutes(endMinutes))
  if (normalizeClockMinutes(startMinutes) === normalizeClockMinutes(endMinutes)) end = new Date(start)
  else if (end <= start) {
    end = new Date(start)
    end.setDate(end.getDate() + 1)
    end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0)
  }
  return { start, end }
}

export function durationMinutes(start: Date | string, end: Date | string) {
  const milliseconds = new Date(end).getTime() - new Date(start).getTime()
  return Number.isFinite(milliseconds) ? Math.round(milliseconds / 60_000) : 0
}

export function formatSleepDuration(minutes: number) {
  if (minutes <= 0) return '0分钟'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (!hours) return `${remainder}分钟`
  if (!remainder) return `${hours}小时`
  return `${hours}小时${remainder}分钟`
}

export function formatClock(value: Date | string) {
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function sleepTimelineSummary(kind: 'night' | 'nap', minutes: number) {
  return `${kind === 'night' ? '夜间睡眠' : '白天小睡'} · ${formatSleepDuration(minutes)}`
}

export function defaultSleepType(start: Date, end: Date): 'night' | 'nap' {
  const minutes = durationMinutes(start, end)
  const startClock = clockMinutes(start)
  return end.getDate() !== start.getDate() || startClock >= 18 * 60 || startClock < 6 * 60 || minutes > 4 * 60 ? 'night' : 'nap'
}
