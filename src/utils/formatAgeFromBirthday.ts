import { differenceInMonths, differenceInYears, isValid, parseISO } from 'date-fns'

export function formatAgeFromBirthday(birthday: string, today = new Date()) {
  if (!birthday) return '未填写年龄'

  const birthDate = parseISO(birthday)
  if (!isValid(birthDate) || birthDate > today) return '未填写年龄'
  const years = differenceInYears(today, birthDate)
  const totalMonths = differenceInMonths(today, birthDate)

  if (totalMonths < 1) return '未满1个月'
  if (years < 18) return `${Math.max(years, 0)}岁${Math.max(totalMonths - years * 12, 0)}个月`
  return `${Math.max(years, 0)}岁`
}
