import { healthProfileSections, type HealthProfileSectionConfig } from '../config/healthProfileSections'
import { healthProfilePriorities, type HealthProfileType } from '../config/healthProfileTemplates'

export function getPrioritizedSections(type: HealthProfileType): { priorities: HealthProfileSectionConfig[]; remaining: HealthProfileSectionConfig[] } {
  const priorityIds = healthProfilePriorities[type]
  return {
    priorities: priorityIds.map((id) => healthProfileSections.find((section) => section.id === id)!),
    remaining: healthProfileSections.filter((section) => !priorityIds.includes(section.id)),
  }
}
