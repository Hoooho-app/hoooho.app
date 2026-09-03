export const CHILD_CAREGIVER_VALUES = [
  'father', 'mother', 'paternal_grandfather', 'paternal_grandmother',
  'maternal_grandfather', 'maternal_grandmother', 'nanny'
]

const CHILD_CAREGIVER_SET = new Set(CHILD_CAREGIVER_VALUES)

function pad(value) {
  return String(value).padStart(2, '0')
}

export function parsePlainDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return null
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth ? { year, month, day } : null
}

function formatParts(parts) {
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}`
}

function dayAfter(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export function getChildBirthdayBounds(todayKey) {
  const today = parsePlainDateKey(todayKey)
  if (!today) return { min: '', max: '' }
  const boundaryYear = today.year - 8
  const boundaryDay = Math.min(today.day, new Date(Date.UTC(boundaryYear, today.month, 0)).getUTCDate())
  return {
    min: formatParts(dayAfter({ year: boundaryYear, month: today.month, day: boundaryDay })),
    max: formatParts(today)
  }
}

export function validateChildBirthdayKey(value, todayKey) {
  if (!value) return { error: null, valid: true }
  if (!parsePlainDateKey(value)) return { error: 'invalid', valid: false }
  const { min, max } = getChildBirthdayBounds(todayKey)
  if (value > max) return { error: 'future', valid: false }
  if (value < min) return { error: 'too-old', valid: false }
  return { error: null, valid: true }
}

export function formatChildAgeFromDateKeys(birthday, todayKey) {
  const birth = parsePlainDateKey(birthday)
  const today = parsePlainDateKey(todayKey)
  if (!birth || !today || birthday > todayKey) return ''
  const totalMonths = Math.max(
    (today.year - birth.year) * 12 + today.month - birth.month - (today.day < birth.day ? 1 : 0), 0
  )
  if (totalMonths < 1) return '未满1个月'
  if (totalMonths < 12) return `${totalMonths}个月`
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  return months ? `${years}岁${months}个月` : `${years}岁`
}

export function normalizeChildCaregivers(value) {
  if (!Array.isArray(value) || value.some((item) => !CHILD_CAREGIVER_SET.has(item))) return null
  return [...new Set(value)]
}
