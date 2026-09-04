import type { ProfileGender } from '../types'
import { childAvatarAssetPaths } from '../generated/childAvatarAssets'
import { getLocalDateKey, parsePlainDate } from './localCalendarDate'

export type ChildAvatarGender = 'girl' | 'boy'
export type ChildAvatarVariant = 'east-asian' | 'european' | 'african'
export type ChildAvatarAge = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface ChildAvatarSelection {
  gender: ChildAvatarGender
  age: ChildAvatarAge
  variant: ChildAvatarVariant
}

export const childAvatarVariants = ['east-asian', 'european', 'african'] as const satisfies readonly ChildAvatarVariant[]
export const childAvatarAges = [0, 1, 2, 3, 4, 5, 6, 7] as const satisfies readonly ChildAvatarAge[]

export function getChildAvatarAge(birthDate: string, today: Date | string = new Date(), timeZone?: string): ChildAvatarAge {
  const birth = parsePlainDate(birthDate)
  const todayKey = typeof today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(today)
    ? today
    : getLocalDateKey(today, timeZone)
  const current = todayKey ? parsePlainDate(todayKey) : null
  if (!birth || !current) return 0

  const birthdayPassed = current.month > birth.month || (current.month === birth.month && current.day >= birth.day)
  const years = Math.max(current.year - birth.year - (birthdayPassed ? 0 : 1), 0)
  return Math.min(years, 7) as ChildAvatarAge
}

export function getChildAvatarGender(gender: Extract<ProfileGender, 'male' | 'female'>): ChildAvatarGender {
  return gender === 'female' ? 'girl' : 'boy'
}

export function getDefaultAvatarVariant(): ChildAvatarVariant {
  return 'east-asian'
}

export function getNextAvatarVariant(current: ChildAvatarVariant): ChildAvatarVariant {
  const index = childAvatarVariants.indexOf(current)
  return childAvatarVariants[(index + 1) % childAvatarVariants.length]
}

export function createChildAvatarSelection(
  birthDate: string,
  gender: Extract<ProfileGender, 'male' | 'female'>,
  today: Date | string = new Date(),
  timeZone?: string
): ChildAvatarSelection {
  return { gender: getChildAvatarGender(gender), age: getChildAvatarAge(birthDate, today, timeZone), variant: getDefaultAvatarVariant() }
}

export function remapChildAvatarSelection(
  current: ChildAvatarSelection,
  birthDate: string,
  gender: Extract<ProfileGender, 'male' | 'female'>,
  today: Date | string = new Date(),
  timeZone?: string
): ChildAvatarSelection {
  return { gender: getChildAvatarGender(gender), age: getChildAvatarAge(birthDate, today, timeZone), variant: current.variant }
}

export function cycleChildAvatar(current: ChildAvatarSelection): ChildAvatarSelection {
  return { ...current, variant: getNextAvatarVariant(current.variant) }
}

export function resolveChildAvatar(selection: ChildAvatarSelection) {
  const id = `${selection.gender}-age${selection.age}-${selection.variant}` as keyof typeof childAvatarAssetPaths
  return childAvatarAssetPaths[id]
}

export function serializeChildAvatar(selection: ChildAvatarSelection) {
  return `${selection.gender}-age${selection.age}-${selection.variant}`
}

function legacyVariant(value: string): ChildAvatarVariant {
  const candidate = value.split(':')[3]
  return childAvatarVariants.includes(candidate as ChildAvatarVariant) ? candidate as ChildAvatarVariant : getDefaultAvatarVariant()
}

function legacyVirtualVariant(value: string): ChildAvatarVariant {
  const raw = Number.parseInt(value.split(':')[2] ?? '0', 10)
  return childAvatarVariants[Math.abs(Number.isFinite(raw) ? raw : 0) % childAvatarVariants.length]
}

export function parseStoredChildAvatar(
  value: string | null | undefined,
  birthDate?: string,
  gender?: Extract<ProfileGender, 'male' | 'female'>
): ChildAvatarSelection | null {
  if (!value) return null
  const current = /^(girl|boy)-age([0-7])-(east-asian|european|african)$/.exec(value)
  if (current) return { gender: current[1] as ChildAvatarGender, age: Number(current[2]) as ChildAvatarAge, variant: current[3] as ChildAvatarVariant }
  if (!birthDate || !gender) return null

  if (/^clay:v1:(?:baby-|toddler-)?(?:boy|girl):/.test(value)) {
    return { ...createChildAvatarSelection(birthDate, gender), variant: legacyVariant(value) }
  }
  if (/^virtual:(?:baby-)?(?:boy|girl)(?::\d+)?$/.test(value)) {
    return { ...createChildAvatarSelection(birthDate, gender), variant: legacyVirtualVariant(value) }
  }
  return null
}

export function isChildAvatarSelection(value: unknown): value is ChildAvatarSelection {
  if (!value || typeof value !== 'object') return false
  const selection = value as Partial<ChildAvatarSelection>
  return (selection.gender === 'girl' || selection.gender === 'boy')
    && childAvatarAges.includes(selection.age as ChildAvatarAge)
    && childAvatarVariants.includes(selection.variant as ChildAvatarVariant)
}
