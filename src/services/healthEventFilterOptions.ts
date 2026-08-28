import type { HealthEventListItemViewModel } from '../types'

export function getHealthEventDefinitionTitleOptions(events: HealthEventListItemViewModel[]) {
  return [...new Set(events
    .map((event) => event.definitionTitle.trim())
    .filter(Boolean))]
}
