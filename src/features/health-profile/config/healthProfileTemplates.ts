import type { HealthProfileSectionId } from './healthProfileSections'

export type HealthProfileType = 'infant' | 'child' | 'teen' | 'adult-female' | 'adult-male' | 'elder-female' | 'elder-male'

export const healthProfilePriorities: Record<HealthProfileType, HealthProfileSectionId[]> = {
  infant: ['basic','growth','feeding','allergy','vaccination','birth','medication'],
  child: ['basic','growth','allergy','vaccination','medication','sleep','diet'],
  teen: ['basic','allergy','chronic','sleep','diet','exercise'],
  'adult-female': ['basic','medication','allergy','chronic','surgery','family-history'],
  'adult-male': ['basic','medication','allergy','chronic','surgery','family-history'],
  'elder-female': ['basic','mobility','fall','medication','chronic','surgery','allergy','sleep','family-history'],
  'elder-male': ['basic','mobility','fall','medication','chronic','surgery','allergy','sleep','family-history']
}
