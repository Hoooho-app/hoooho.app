import {
  formatChildAgeFromDateKeys,
  getChildBirthdayBounds as getBounds,
  validateChildBirthdayKey,
  type ChildBirthdayError
} from '../../shared/child-profile-policy.mjs'
import { getLocalDateKey } from './localCalendarDate'

export type { ChildBirthdayError }

export function getChildBirthdayBounds(today = new Date()) {
  return getBounds(getLocalDateKey(today) ?? '')
}

export function validateChildBirthday(value: string, today = new Date()) {
  return validateChildBirthdayKey(value, getLocalDateKey(today) ?? '')
}

export function childBirthdayErrorMessage(error: ChildBirthdayError | null) {
  if (error === 'future') return '出生日期不能晚于今天'
  if (error === 'too-old') return '孩子应尚未满8周岁'
  if (error === 'invalid') return '请输入有效的出生日期'
  return ''
}

export function formatChildProfileAge(birthday: string, today = new Date()) {
  return formatChildAgeFromDateKeys(birthday, getLocalDateKey(today) ?? '')
}
