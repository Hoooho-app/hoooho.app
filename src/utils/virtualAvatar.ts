import { differenceInYears, isValid, parseISO } from 'date-fns'
import type { ProfileGender } from '../types'

export type VirtualAvatarKind =
  | 'baby-boy'
  | 'baby-girl'
  | 'boy'
  | 'girl'
  | 'man'
  | 'woman'
  | 'grandfather'
  | 'grandmother'

const PREFIX = 'virtual:'

export function createVirtualAvatarId(birthday: string, gender: ProfileGender, today = new Date()) {
  const birthDate = parseISO(birthday)
  const age = isValid(birthDate) ? Math.max(differenceInYears(today, birthDate), 0) : 18
  const female = gender === 'female'

  if (age < 3) return `${PREFIX}${female ? 'baby-girl' : 'baby-boy'}`
  if (age < 18) return `${PREFIX}${female ? 'girl' : 'boy'}`
  if (age < 60) return `${PREFIX}${female ? 'woman' : 'man'}`
  return `${PREFIX}${female ? 'grandmother' : 'grandfather'}`
}

export function parseVirtualAvatarId(value?: string): VirtualAvatarKind | null {
  if (!value?.startsWith(PREFIX)) return null
  const kind = value.slice(PREFIX.length) as VirtualAvatarKind
  return ['baby-boy', 'baby-girl', 'boy', 'girl', 'man', 'woman', 'grandfather', 'grandmother'].includes(kind)
    ? kind
    : null
}
