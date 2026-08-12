export const FUTURE_OCCURRED_AT_MESSAGE = '发生时间不能晚于现在'

export function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function isFutureOccurredAt(value: string, now = new Date()) {
  const occurredAt = new Date(value)
  return Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > now.getTime()
}

export function clampOccurredAtToNow(value: string, now = new Date()) {
  return isFutureOccurredAt(value, now) ? localDateTimeValue(now) : value
}
