import { healthProfileSections, type HealthProfileSectionConfig, type HealthProfileSectionId } from '../config/healthProfileSections'
import { healthProfilePriorities, type HealthProfileType } from '../config/healthProfileTemplates'
import { buildHealthProfileHomeGroups, latestStoredSections, readStoredSectionSnapshots } from './healthProfileHomeLogic'

export interface StoredHealthProfileSection {
  id: HealthProfileSectionId
  updatedAt: string
}

export interface HealthProfileHomeGroups {
  recorded: HealthProfileSectionConfig[]
  suggested: HealthProfileSectionConfig[]
  all: HealthProfileSectionConfig[]
}

export function getStoredHealthProfileSectionDetails(memberId: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  return latestStoredSections(healthProfileSections.map(({ id }) => id), memberId, storage) as StoredHealthProfileSection[]
}

export function getStoredHealthProfileSectionSnapshots(memberId: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  return readStoredSectionSnapshots(healthProfileSections.map(({ id }) => id), memberId, storage)
}

export function getStoredHealthProfileSections(memberId: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  return new Set(getStoredHealthProfileSectionDetails(memberId, storage).map(({ id }) => id))
}

export function getHealthProfileHomeGroups(
  type: HealthProfileType,
  stored: readonly StoredHealthProfileSection[],
  suggestedLimit = 8
): HealthProfileHomeGroups {
  return buildHealthProfileHomeGroups(healthProfileSections, healthProfilePriorities[type], stored, suggestedLimit)
}

export function getHealthProfileSectionGroups(type: HealthProfileType, sectionsWithData: ReadonlySet<HealthProfileSectionId>) {
  const stored = [...sectionsWithData].map((id) => ({ id, updatedAt: '' }))
  const { recorded, suggested, all } = getHealthProfileHomeGroups(type, stored)
  return { priorities: suggested, secondary: all.filter((section) => !sectionsWithData.has(section.id) && !suggested.includes(section)), historical: recorded }
}
