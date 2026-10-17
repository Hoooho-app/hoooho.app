// Date.parse normalizes dates such as February 30. Health facts must retain
// the date actually supplied, so validate calendar components before parsing.
export function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= days[month - 1]
}

export function parseStrictInstant(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/i.exec(text)
  if (!match || !validCalendarDate(match[1])) return null
  if (match[2] !== undefined && (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59)) return null
  const instant = new Date(text)
  return Number.isFinite(instant.getTime()) ? instant : null
}
