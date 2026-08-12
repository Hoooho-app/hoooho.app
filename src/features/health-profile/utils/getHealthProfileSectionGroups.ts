import { healthProfileSections, type HealthProfileSectionConfig, type HealthProfileSectionId } from '../config/healthProfileSections'
import { healthProfilePriorities, healthProfileSecondaryOrder, type HealthProfileType } from '../config/healthProfileTemplates'

export type HealthProfileSectionState = 'priority' | 'secondary' | 'historical' | 'hidden'

export interface HealthProfileSectionGroups {
  priorities: HealthProfileSectionConfig[]
  secondary: HealthProfileSectionConfig[]
  historical: HealthProfileSectionConfig[]
}

export function getHealthProfileSectionState(
  type: HealthProfileType,
  section: HealthProfileSectionConfig,
  hasData: boolean
): HealthProfileSectionState {
  const active = section.activeFor.includes(type)
  if (active && healthProfilePriorities[type].includes(section.id)) return 'priority'
  if (active) return 'secondary'
  if (hasData && section.historicalFor?.includes(type)) return 'historical'
  return 'hidden'
}

export function getHealthProfileSectionGroups(
  type: HealthProfileType,
  sectionsWithData: ReadonlySet<HealthProfileSectionId>
): HealthProfileSectionGroups {
  const groups: HealthProfileSectionGroups = { priorities: [], secondary: [], historical: [] }
  for (const section of healthProfileSections) {
    const state = getHealthProfileSectionState(type, section, sectionsWithData.has(section.id))
    if (state === 'priority') groups.priorities.push(section)
    if (state === 'secondary') groups.secondary.push(section)
    if (state === 'historical') groups.historical.push(section)
  }
  const priorityOrder = new Map(healthProfilePriorities[type].map((id, index) => [id, index]))
  groups.priorities.sort((left, right) => (priorityOrder.get(left.id) ?? 99) - (priorityOrder.get(right.id) ?? 99))
  const secondaryOrder = new Map((healthProfileSecondaryOrder[type] ?? []).map((id, index) => [id, index]))
  groups.secondary.sort((left, right) => (secondaryOrder.get(left.id) ?? 99) - (secondaryOrder.get(right.id) ?? 99))
  return groups
}

export function getStoredHealthProfileSections(memberId: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  return new Set(healthProfileSections.flatMap((section) => {
    try {
      const records = JSON.parse(storage.getItem(`hoho-health-profile:${memberId}:${section.id}`) ?? '[]')
      return Array.isArray(records) && records.length > 0 ? [section.id] : []
    } catch {
      return []
    }
  })) as Set<HealthProfileSectionId>
}
