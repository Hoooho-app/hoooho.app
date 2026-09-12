import { getLocalDateKey } from '../../utils/localCalendarDate'
import type { JournalEntry } from './timeViewModel'
import type { TriggerCardConfig } from './triggerOpportunityConfig'
import { triggerCardConfigs } from './triggerOpportunityConfig'

export type SelectedTriggerCard = { config: TriggerCardConfig; cycle: string; prerequisiteEntry?: JournalEntry }

function matchingPrerequisite(config: TriggerCardConfig, entries: readonly JournalEntry[], now: Date) {
  const prerequisite = config.prerequisite
  if (!prerequisite) return undefined
  return entries.filter((entry) => entry.categories?.includes(prerequisite.recordType)).filter((entry) => {
    const age = (now.getTime() - Date.parse(entry.occurredAt)) / 60_000
    if (age < (prerequisite.minDelayMinutes ?? 0) || age > (prerequisite.maxDelayMinutes ?? Infinity)) return false
    if (prerequisite.predicate === 'new-food') return Boolean(entry.diet?.firstTryFoods?.length)
    if (prerequisite.predicate === 'contact') return entry.categories?.includes('environment') || Boolean(entry.outdoorActivity?.contacts?.some((item) => item !== 'none_observed'))
    if (prerequisite.predicate === 'incomplete-visit') return entry.attachmentCount === 0 || !entry.content.trim()
    return true
  }).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0]
}

function alreadyRecorded(config: TriggerCardConfig, entries: readonly JournalEntry[], selectedDay: string) {
  return entries.some((entry) => entry.categories?.includes(config.category) && getLocalDateKey(entry.occurredAt) === selectedDay)
}

export function selectTriggerOpportunity(now: Date, selectedDay: string, today: string, entries: readonly JournalEntry[], hidden: (cardId: string, cycle: string) => boolean): SelectedTriggerCard | null {
  const hour = now.getHours()
  const candidates = triggerCardConfigs.flatMap((config): SelectedTriggerCard[] => {
    if (config.triggerType === 'event') {
      const prerequisiteEntry = matchingPrerequisite(config, entries, now)
      if (!prerequisiteEntry) return []
      const cycle = prerequisiteEntry.id
      return hidden(config.id, cycle) ? [] : [{ config, cycle, prerequisiteEntry }]
    }
    if (selectedDay !== today) return []
    if (config.timeWindow && (hour < config.timeWindow.start || hour >= config.timeWindow.end)) return []
    if (alreadyRecorded(config, entries, selectedDay)) return []
    if (config.id === 'new-food' && entries.some((entry) => entry.diet?.firstTryFoods?.length && getLocalDateKey(entry.occurredAt) === selectedDay)) return []
    if (config.id === 'hydration' || config.id === 'body-change') {
      const last = entries.reduce((latest, entry) => Math.max(latest, Date.parse(entry.occurredAt)), 0)
      if (last && now.getTime() - last < 3 * 60 * 60 * 1000) return []
    }
    const cycle = `${selectedDay}:${config.timeWindow?.start ?? 'gap'}`
    return hidden(config.id, cycle) ? [] : [{ config, cycle }]
  })
  return candidates.sort((left, right) => right.config.priority - left.config.priority || left.config.id.localeCompare(right.config.id))[0] ?? null
}
