import type { HealthProfileSectionId } from './healthProfileSections'

export type HealthProfileType = 'infant' | 'child' | 'teen' | 'adult-female' | 'adult-male' | 'elder-female' | 'elder-male'

export const healthProfilePriorities: Record<HealthProfileType, HealthProfileSectionId[]> = {
  infant: ['growth', 'feeding', 'allergy', 'vaccination', 'birth'],
  child: ['growth', 'allergy', 'vaccination', 'sleep', 'examination'],
  teen: ['basic', 'allergy', 'examination', 'sleep', 'indicators'],
  'adult-female': ['basic', 'history', 'medication', 'examination', 'menstrual'],
  'adult-male': ['basic', 'history', 'medication', 'examination', 'indicators'],
  'elder-female': ['history', 'medication', 'indicators', 'examination', 'care'],
  'elder-male': ['history', 'medication', 'indicators', 'examination', 'care'],
}
