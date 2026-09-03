import {
  formatChildAgeFromDateKeys,
  getChildBirthdayBounds as getBounds,
  inferFamilyMemberRelationship as inferRelationship,
  isChildProfileMember as isChildMember,
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

export function inferFamilyMemberRelationship(birthday: string, today = new Date()) {
  return inferRelationship(birthday, getLocalDateKey(today) ?? '')
}

export function isChildProfileMember(
  member: { birthday?: string | null; isSelf?: boolean; relationship?: string } | null | undefined,
  today = new Date()
) {
  return isChildMember(member, getLocalDateKey(today) ?? '')
}
