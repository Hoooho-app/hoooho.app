export const FUTURE_OCCURRED_AT_MESSAGE = '发生时间不能晚于现在'

export function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function localDateTimeToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('记录时间格式无效')
  const [datePart, timePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  const local = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day || local.getHours() !== hour || local.getMinutes() !== minute) throw new Error('记录时间格式无效')
  return local.toISOString()
}

export function isFutureOccurredAt(value: string, now = new Date()) {
  const occurredAt = new Date(value)
  return Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > now.getTime()
}

export function clampOccurredAtToNow(value: string, now = new Date()) {
  return isFutureOccurredAt(value, now) ? localDateTimeValue(now) : value
}
