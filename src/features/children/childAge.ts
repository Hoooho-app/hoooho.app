import { differenceInCalendarMonths, isValid, parseISO } from 'date-fns'

export function childAgeInMonths(birthday?: string | null, at = new Date()) {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null
  const birth = parseISO(birthday)
  if (!isValid(birth) || birth > at) return null
  let months = differenceInCalendarMonths(at, birth)
  if (at.getDate() < birth.getDate()) months -= 1
  return Math.max(months, 0)
}

export function formatChildAge(birthday?: string | null, at = new Date()) {
  if (birthday && /^\d{4}$/.test(birthday)) {
    const years = at.getFullYear() - Number(birthday)
    return years >= 0 ? `${years}岁` : '年龄未填写'
  }
  const months = childAgeInMonths(birthday, at)
  if (months === null) return '年龄未填写'
  if (months < 1) return '未满1个月'
  if (months < 12) return `${months}个月`
  if (months < 36) return `${Math.floor(months / 12)}岁${months % 12}个月`
  return `${Math.floor(months / 12)}岁`
}

export function canChildCreateRecords(birthday?: string | null, at = new Date()) {
  const months = childAgeInMonths(birthday, at)
  return months !== null && months < 84
}
