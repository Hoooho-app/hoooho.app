import { formatAgeFromBirthday } from '../../utils/formatAgeFromBirthday'

export type BirthdayPrecision = 'year' | 'date'

export function getBirthdayAgeMessage(birthday: string, precision: BirthdayPrecision, today = new Date()) {
  const isComplete = precision === 'year'
    ? /^\d{4}$/.test(birthday)
    : /^\d{4}-\d{2}-\d{2}$/.test(birthday)

  if (!isComplete) return '填写后自动计算年龄'

  const age = formatAgeFromBirthday(birthday, today)
  if (age === '未填写年龄') return '填写后自动计算年龄'

  return `年龄：${precision === 'year' ? '约' : ''}${age}`
}
