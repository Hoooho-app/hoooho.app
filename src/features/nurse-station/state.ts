import type { HealthEventListItemViewModel } from '../../types'
import type { JournalEntry } from '../../pages/HealthEvents/timeViewModel'

export type NurseStationItemStatus = 'pending_confirmation' | 'active' | 'paused' | 'completed' | 'dismissed' | 'deleted'
export type NurseStationItemType = 'symptom_observation' | 'medication_reminder' | 'record_connection' | 'family_sync' | 'reassurance_message' | 'missing_information' | 'follow_up' | 'other'

export interface NurseStationItem {
  id: string
  memberId: string
  sourceEventId: string
  relatedEventIds: string[]
  type: NurseStationItemType
  status: NurseStationItemStatus
  title: string
  sourceLabel: string
  createdAt: string
  updatedAt: string
  confirmedAt?: string
  completedAt?: string
  completionResult?: string
  reminder?: { at: string; paused: boolean }
}

export interface NurseStationState {
  tutorialSeen: boolean
  loginNoticeDismissed: boolean
  suppressedTypes: NurseStationItemType[]
  handledBubbleKeys: string[]
  animatedBubbleKeys: string[]
  items: NurseStationItem[]
}

const initialState: NurseStationState = { tutorialSeen: false, loginNoticeDismissed: false, suppressedTypes: [], handledBubbleKeys: [], animatedBubbleKeys: [], items: [] }
const prefix = 'hoooho:nurse-station:v1:'

export function nurseStationStorageKey(identityId: string, memberId: string) {
  return `${prefix}${identityId}:${memberId}`
}

export function readNurseStationState(identityId: string, memberId: string): NurseStationState {
  try {
    const parsed = JSON.parse(localStorage.getItem(nurseStationStorageKey(identityId, memberId)) ?? '') as Partial<NurseStationState>
    return { ...initialState, ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [], suppressedTypes: Array.isArray(parsed.suppressedTypes) ? parsed.suppressedTypes : [], handledBubbleKeys: Array.isArray(parsed.handledBubbleKeys) ? parsed.handledBubbleKeys : [], animatedBubbleKeys: Array.isArray(parsed.animatedBubbleKeys) ? parsed.animatedBubbleKeys : [] }
  } catch { return { ...initialState } }
}

export function writeNurseStationState(identityId: string, memberId: string, state: NurseStationState) {
  localStorage.setItem(nurseStationStorageKey(identityId, memberId), JSON.stringify(state))
}

function suggestionFor(event: HealthEventListItemViewModel): Pick<NurseStationItem, 'type' | 'title'> | null {
  if (event.category === 'fever' || /发热|体温|高烧/.test(`${event.title} ${event.displayTitle}`)) return { type: 'symptom_observation', title: '要开启体温观察吗？' }
  if (/用药|服药|药物/.test(`${event.title} ${event.displayTitle}`)) return { type: 'medication_reminder', title: '需要设置下一次用药提醒吗？' }
  return null
}

export function reconcileNurseStationItems(state: NurseStationState, events: readonly HealthEventListItemViewModel[], memberId: string, journal: readonly JournalEntry[] = []): NurseStationState {
  const known = new Set(state.items.map((item) => item.sourceEventId))
  const configured = journal.flatMap((entry) => (entry.medication?.medications ?? []).flatMap((medicine) => medicine.reminder?.enabled ? [{ entry, medicine }] : []))
  const configuredEventIds = new Set(configured.map(({ entry }) => entry.eventId))
  const reminderAdditions = configured.flatMap(({ entry, medicine }) => {
    const id = `nurse-${entry.eventId}-${medicine.id}`
    if (state.items.some((item) => item.id === id)) return []
    const firstTime = medicine.reminder!.times[0]
    return [{ id, memberId, sourceEventId: entry.eventId, relatedEventIds: [entry.eventId], type: 'medication_reminder' as const, status: 'active' as const, title: `${medicine.medicationName}用药提醒`, sourceLabel: `${medicine.medicationName} · ${medicine.amountValue} ${medicine.amountUnit}`, createdAt: entry.createdAt, updatedAt: entry.createdAt, reminder: { at: `${entry.occurredAt.slice(0, 10)}T${firstTime}:00`, paused: false } }]
  })
  const additions = events.flatMap((event) => {
    const suggestion = suggestionFor(event)
    if (!suggestion || known.has(event.id) || configuredEventIds.has(event.id) || state.suppressedTypes.includes(suggestion.type)) return []
    const now = event.updatedAt || event.createdAt
    return [{ id: `nurse-${event.id}`, memberId, sourceEventId: event.id, relatedEventIds: [event.id], status: 'pending_confirmation' as const, sourceLabel: `${event.displayTitle || event.title} · ${new Date(event.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, createdAt: now, updatedAt: now, ...suggestion }]
  })
  return reminderAdditions.length || additions.length ? { ...state, items: [...state.items, ...reminderAdditions, ...additions] } : state
}
