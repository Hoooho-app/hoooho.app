import type { HealthEventListItemViewModel } from '../../types'

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
  items: NurseStationItem[]
}

const initialState: NurseStationState = { tutorialSeen: false, loginNoticeDismissed: false, suppressedTypes: [], items: [] }
const prefix = 'hoooho:nurse-station:v1:'

export function nurseStationStorageKey(identityId: string, memberId: string) {
  return `${prefix}${identityId}:${memberId}`
}

export function readNurseStationState(identityId: string, memberId: string): NurseStationState {
  try {
    const parsed = JSON.parse(localStorage.getItem(nurseStationStorageKey(identityId, memberId)) ?? '') as Partial<NurseStationState>
    return { ...initialState, ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [], suppressedTypes: Array.isArray(parsed.suppressedTypes) ? parsed.suppressedTypes : [] }
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

export function reconcileNurseStationItems(state: NurseStationState, events: readonly HealthEventListItemViewModel[], memberId: string): NurseStationState {
  const known = new Set(state.items.map((item) => item.sourceEventId))
  const additions = events.flatMap((event) => {
    const suggestion = suggestionFor(event)
    if (!suggestion || known.has(event.id) || state.suppressedTypes.includes(suggestion.type)) return []
    const now = event.updatedAt || event.createdAt
    return [{ id: `nurse-${event.id}`, memberId, sourceEventId: event.id, relatedEventIds: [event.id], status: 'pending_confirmation' as const, sourceLabel: `${event.displayTitle || event.title} · ${new Date(event.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, createdAt: now, updatedAt: now, ...suggestion }]
  })
  return additions.length ? { ...state, items: [...state.items, ...additions] } : state
}
