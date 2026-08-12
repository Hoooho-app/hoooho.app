import { differenceInYears, isValid, parseISO } from 'date-fns'
import type { ProfileGender } from '../../../types'
import type { HealthProfileType } from '../config/healthProfileTemplates'

export function getHealthProfileType(birthday?: string, gender?: ProfileGender, today = new Date()): HealthProfileType {
  const birthDate = birthday ? parseISO(birthday) : null
  const age = birthDate && isValid(birthDate) ? Math.max(differenceInYears(today, birthDate), 0) : 18
  if (age <= 2) return 'infant'
  if (age <= 12) return 'child'
  if (age <= 17) return 'teen'
  if (age >= 60) return gender === 'female' ? 'elder-female' : 'elder-male'
  return gender === 'female' ? 'adult-female' : 'adult-male'
}
