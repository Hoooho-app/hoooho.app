export type ChildCaregiver =
  | 'father'
  | 'mother'
  | 'paternal_grandfather'
  | 'paternal_grandmother'
  | 'maternal_grandfather'
  | 'maternal_grandmother'
  | 'nanny'

export type ChildBirthdayError = 'invalid' | 'future' | 'too-old'

export const CHILD_CAREGIVER_VALUES: readonly ChildCaregiver[]
export function parsePlainDateKey(value: string): { year: number; month: number; day: number } | null
export function getChildBirthdayBounds(todayKey: string): { min: string; max: string }
export function validateChildBirthdayKey(value: string, todayKey: string): { error: ChildBirthdayError | null; valid: boolean }
export function formatChildAgeFromDateKeys(birthday: string, todayKey: string): string
export function normalizeChildCaregivers(value: unknown): ChildCaregiver[] | null
