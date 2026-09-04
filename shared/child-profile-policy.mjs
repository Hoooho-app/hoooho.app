export const CHILD_CAREGIVER_VALUES = [
  'father', 'mother', 'paternal_grandfather', 'paternal_grandmother',
  'maternal_grandfather', 'maternal_grandmother', 'nanny'
]

export const CHILD_RECORDER_RELATIONSHIP_VALUES = [...CHILD_CAREGIVER_VALUES, 'other']

const CHILD_CAREGIVER_SET = new Set(CHILD_CAREGIVER_VALUES)
const CHILD_RECORDER_RELATIONSHIP_SET = new Set(CHILD_RECORDER_RELATIONSHIP_VALUES)

function pad(value) {
  return String(value).padStart(2, '0')
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function parsePlainDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return null
  return day <= daysInMonth(year, month) ? { year, month, day } : null
}

function formatParts(parts) {
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}`
}

function dayAfter(parts) {
  if (parts.day < daysInMonth(parts.year, parts.month)) return { ...parts, day: parts.day + 1 }
  if (parts.month < 12) return { year: parts.year, month: parts.month + 1, day: 1 }
  return { year: parts.year + 1, month: 1, day: 1 }
}

export function getChildBirthdayBounds(todayKey) {
  const today = parsePlainDateKey(todayKey)
  if (!today) return { min: '', max: '' }
  const boundaryYear = today.year - 8
  const boundaryDay = Math.min(today.day, daysInMonth(boundaryYear, today.month))
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

export function isChildBirthdayKey(birthday, todayKey) {
  return Boolean(birthday) && validateChildBirthdayKey(birthday, todayKey).valid
}

export function inferFamilyMemberRelationship(birthday, todayKey) {
  return isChildBirthdayKey(birthday, todayKey) ? 'child' : 'other'
}

export function isChildProfileMember(member, todayKey) {
  if (!member || member.isSelf) return false
  if (member.relationship === 'child') return true
  return member.relationship === 'other' && isChildBirthdayKey(member.birthday ?? '', todayKey)
}

export function normalizeChildCaregivers(value) {
  if (!Array.isArray(value) || value.some((item) => !CHILD_CAREGIVER_SET.has(item))) return null
  return [...new Set(value)]
}

export function normalizeChildRecorderRelationship(value) {
  if (value === undefined || value === null || value === '') return null
  return CHILD_RECORDER_RELATIONSHIP_SET.has(value) ? value : undefined
}
