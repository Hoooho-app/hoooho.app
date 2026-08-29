export function validTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
    return value
  } catch {
    return undefined
  }
}

export function localDateKey(value = new Date(), timeZone) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value)
  const values = new Map(parts.map((part) => [part.type, part.value]))
  const year = values.get('year')
  const month = values.get('month')
  const day = values.get('day')
  return year && month && day ? `${year}-${month}-${day}` : null
}
