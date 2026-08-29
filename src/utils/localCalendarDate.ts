export interface LocalCalendarParts {
  year: number
  month: number
  day: number
}

function asValidDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getLocalCalendarParts(value: Date | string, timeZone?: string): LocalCalendarParts | null {
  const date = asValidDate(value)
  if (!date) return null
  if (!timeZone) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() }
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const values = new Map(parts.map((part) => [part.type, Number(part.value)]))
  const year = values.get('year')
  const month = values.get('month')
  const day = values.get('day')
  return year && month && day ? { year, month, day } : null
}

export function getLocalDateKey(value: Date | string, timeZone?: string) {
  const parts = getLocalCalendarParts(value, timeZone)
  if (!parts) return null
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function getLocalCalendarDaySerial(value: Date | string, timeZone?: string) {
  const parts = getLocalCalendarParts(value, timeZone)
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : null
}

export function formatLocalMonthDay(value: Date | string, timeZone?: string) {
  const parts = getLocalCalendarParts(value, timeZone)
  return parts ? `${parts.month}月${parts.day}日` : '日期未知'
}

export function formatLocalWeekday(value: Date | string, timeZone?: string) {
  const date = asValidDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short', ...(timeZone ? { timeZone } : {}) }).format(date)
}

export function parsePlainDate(value: string): LocalCalendarParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, rawYear, rawMonth, rawDay] = match
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const day = Number(rawDay)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() + 1 === month
    && candidate.getUTCDate() === day
    ? { year, month, day }
    : null
}

export function formatPlainMonthDay(value: string) {
  const parts = parsePlainDate(value)
  return parts ? `${parts.month}月${parts.day}日` : '日期未知'
}

export function formatPlainWeekday(value: string) {
  const parts = parsePlainDate(value)
  if (!parts) return ''
  return new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)))
}
