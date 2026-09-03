import type { HealthProfileSectionId } from './healthProfileSections'

export type HealthProfileType = 'infant' | 'child' | 'teen' | 'adult-female' | 'adult-male' | 'elder-female' | 'elder-male'

export const healthProfilePriorities: Record<HealthProfileType, HealthProfileSectionId[]> = {
  infant: ['birth','growth','allergy','medication','chronic','hospitalization','family-history'],
  child: ['birth','growth','allergy','medication','chronic','hospitalization','family-history'],
  teen: ['birth','growth','allergy','medication','chronic','hospitalization','family-history'],
  'adult-female': ['birth','growth','allergy','medication','chronic','hospitalization','family-history'],
  'adult-male': ['birth','growth','allergy','medication','chronic','hospitalization','family-history'],
  'elder-female': ['birth','growth','allergy','medication','chronic','hospitalization','family-history'],
  'elder-male': ['birth','growth','allergy','medication','chronic','hospitalization','family-history']
}
