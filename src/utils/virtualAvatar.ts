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

export interface VirtualAvatarProfile {
  kind: VirtualAvatarKind
  variant: number
}

export function createVirtualAvatarId(birthday: string, gender: ProfileGender, today = new Date()) {
  const birthDate = parseISO(birthday)
  const age = isValid(birthDate) ? Math.max(differenceInYears(today, birthDate), 0) : 18
  const female = gender === 'female'

  if (age < 3) return `${PREFIX}${female ? 'baby-girl' : 'baby-boy'}`
  if (age < 18) return `${PREFIX}${female ? 'girl' : 'boy'}`
  if (age < 60) return `${PREFIX}${female ? 'woman' : 'man'}`
  return `${PREFIX}${female ? 'grandmother' : 'grandfather'}`
}

export function cycleVirtualAvatarId(value: string | undefined, birthday: string, gender: ProfileGender) {
  const current = parseVirtualAvatarId(value)
  const base = createVirtualAvatarId(birthday, gender)
  const kind = base.slice(PREFIX.length)
  return `${PREFIX}${kind}:${((current?.variant ?? 0) + 1) % 3}`
}

export function parseVirtualAvatarId(value?: string): VirtualAvatarProfile | null {
  if (!value?.startsWith(PREFIX)) return null
  const [rawKind, rawVariant] = value.slice(PREFIX.length).split(':')
  const kind = rawKind as VirtualAvatarKind
  const variant = Number.parseInt(rawVariant ?? '0', 10)
  return ['baby-boy', 'baby-girl', 'boy', 'girl', 'man', 'woman', 'grandfather', 'grandmother'].includes(kind)
    ? { kind, variant: Number.isFinite(variant) ? Math.abs(variant) % 3 : 0 }
    : null
}
