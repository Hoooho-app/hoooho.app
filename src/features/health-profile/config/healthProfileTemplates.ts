import type { HealthProfileSectionId } from './healthProfileSections'

export type HealthProfileType = 'infant' | 'child' | 'teen' | 'adult-female' | 'adult-male' | 'elder-female' | 'elder-male'

export const healthProfilePriorities: Record<HealthProfileType, HealthProfileSectionId[]> = {
  infant: ['basic','growth','feeding','allergy','vaccination','birth','examination','medication'],
  child: ['basic','growth','allergy','vaccination','examination','medication','sleep','diet'],
  teen: ['basic','allergy','chronic','examination','sleep','diet','exercise','menstrual'],
  'adult-female': ['basic','menstrual','medication','allergy','chronic','examination','surgery','family-history','pregnancy','sleep'],
  'adult-male': ['basic','medication','allergy','chronic','examination','surgery','family-history','sleep','diet','exercise'],
  'elder-female': ['basic','mobility','fall','medication','chronic','examination','surgery','allergy','sleep','family-history'],
  'elder-male': ['basic','mobility','fall','medication','chronic','examination','surgery','allergy','sleep','family-history']
}
