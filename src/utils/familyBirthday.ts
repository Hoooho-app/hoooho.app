import { getLocalDateKey, parsePlainDate } from './localCalendarDate'

export type FamilyBirthdayError = 'invalid' | 'future' | 'too-old'

export interface FamilyBirthdayValidation {
  error: FamilyBirthdayError | null
  valid: boolean
}

export function getFamilyBirthdayBounds(today = new Date()) {
  const max = getLocalDateKey(today) ?? ''
  const maxParts = parsePlainDate(max)
  if (!maxParts) return { min: '', max }
  const minYear = maxParts.year - 120
  const minDay = maxParts.month === 2 && maxParts.day === 29 ? 28 : maxParts.day
  return {
    min: `${String(minYear).padStart(4, '0')}-${String(maxParts.month).padStart(2, '0')}-${String(minDay).padStart(2, '0')}`,
    max
  }
}

export function validateFamilyBirthday(value: string, today = new Date()): FamilyBirthdayValidation {
  if (!value) return { error: null, valid: true }
  if (!parsePlainDate(value)) return { error: 'invalid', valid: false }
  const { min, max } = getFamilyBirthdayBounds(today)
  if (value > max) return { error: 'future', valid: false }
  if (value < min) return { error: 'too-old', valid: false }
  return { error: null, valid: true }
}

export function familyBirthdayErrorMessage(error: FamilyBirthdayError | null) {
  if (error === 'future') return '出生日期不能晚于今天'
  if (error === 'too-old') return '出生日期不能早于 120 年前'
  if (error === 'invalid') return '请输入有效的出生日期'
  return ''
}
