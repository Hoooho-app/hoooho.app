import { formatChildAgeFromDateKeys } from '../../shared/child-profile-policy.mjs'
import { getLocalDateKey } from './localCalendarDate'

export function formatAgeFromBirthday(birthday: string, today = new Date(), timeZone?: string) {
  if (!birthday) return '未填写年龄'

  if (/^\d{4}$/.test(birthday)) {
    const todayKey = getLocalDateKey(today, timeZone)
    const currentYear = todayKey ? Number(todayKey.slice(0, 4)) : Number.NaN
    const birthYear = Number(birthday)
    return Number.isInteger(currentYear) && birthYear <= currentYear
      ? `${Math.max(currentYear - birthYear, 0)}岁`
      : '未填写年龄'
  }

  const age = formatChildAgeFromDateKeys(birthday, getLocalDateKey(today, timeZone) ?? '')
  if (!age) return '未填写年龄'
  const years = /^(\d+)岁/.exec(age)
  return years && Number(years[1]) >= 3 ? `${years[1]}岁` : age
}
