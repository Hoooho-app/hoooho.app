import type { HealthEventListItemViewModel } from '../../types'
import type { JournalEntry } from '../../pages/HealthEvents/timeViewModel'

export type NurseStationItemStatus = 'pending_confirmation' | 'active' | 'due' | 'snoozed' | 'skipped_current' | 'paused' | 'completed' | 'ended' | 'notification_disabled' | 'dismissed' | 'deleted'
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
  medicationPlan?: MedicationReminderPlan
}

export type MedicationReminderMode = 'daily' | 'interval' | 'once'
export interface MedicationReminderPlan {
  medicationName: string
  medicationType: 'drops' | 'syrup' | 'tablet' | 'spray' | 'ointment' | 'other'
  amount: number
  unit: string
  route: string
  mode: MedicationReminderMode
  times: string[]
  intervalHours?: number
  startDate: string
  endDate?: string
  durationDays?: number
  longTerm?: boolean
  reminderTargets: string[]
  timezone: string
  nextOccurrenceAt: string
  originalOccurrenceAt?: string
  snoozedUntil?: string
  skippedAt?: string
  skipReason?: string
  lastTakenAt?: string
  occurrenceKey: string
  confirmedOccurrenceKeys: string[]
  updatedNoticeAt?: string
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

const medicationTypeForUnit = (unit: string): MedicationReminderPlan['medicationType'] => unit === '滴' ? 'drops' : unit === 'mL' || unit === '毫升' ? 'syrup' : unit === '片' ? 'tablet' : unit === '喷' ? 'spray' : unit === '次' ? 'ointment' : 'other'
const routeForJournal = (route: string) => route === 'nebulized' ? 'inhaled' : route
function journalMedicationPlan(entry: JournalEntry, medicine: NonNullable<NonNullable<JournalEntry['medication']>['medications']>[number]): MedicationReminderPlan | null {
  const reminder = medicine.reminder
  if (!reminder?.enabled) return null
  const startDate = entry.occurredAt.slice(0, 10)
  const mode: MedicationReminderMode = reminder.frequency === 'interval_hours' ? 'interval' : reminder.frequency === 'custom' && reminder.selectedDates?.length === 1 ? 'once' : 'daily'
  const times = reminder.times.filter(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
  const firstTime = times[0] || reminder.firstReminderAt?.slice(11, 16) || ''
  if (!firstTime) return null
  const nextOccurrenceAt = reminder.firstReminderAt || `${mode === 'once' && reminder.selectedDates?.[0] ? reminder.selectedDates[0] : startDate}T${firstTime}:00`
  return { medicationName: medicine.medicationName, medicationType: medicationTypeForUnit(medicine.amountUnit), amount: medicine.amountValue, unit: medicine.amountUnit, route: routeForJournal(entry.medication?.administrationRoute ?? 'other'), mode, times: times.length ? times : [firstTime], intervalHours: mode === 'interval' ? reminder.intervalHours : undefined, startDate: mode === 'once' && reminder.selectedDates?.[0] ? reminder.selectedDates[0] : startDate, endDate: reminder.endDate, durationDays: reminder.durationDays || undefined, longTerm: !reminder.durationDays && !reminder.endDate, reminderTargets: ['我'], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, nextOccurrenceAt, occurrenceKey: nextOccurrenceAt, confirmedOccurrenceKeys: [] }
}

export function reconcileNurseStationItems(state: NurseStationState, events: readonly HealthEventListItemViewModel[], memberId: string, journal: readonly JournalEntry[] = []): NurseStationState {
  const known = new Set(state.items.map((item) => item.sourceEventId))
  const configured = journal.flatMap((entry) => (entry.medication?.medications ?? []).flatMap((medicine) => medicine.reminder?.enabled ? [{ entry, medicine }] : []))
  const configuredEventIds = new Set(configured.map(({ entry }) => entry.eventId))
  const reminderAdditions = configured.flatMap(({ entry, medicine }) => {
    const id = `nurse-${entry.eventId}-${medicine.id}`
    if (state.items.some((item) => item.id === id)) return []
    const medicationPlan = journalMedicationPlan(entry, medicine)
    if (!medicationPlan) return []
    return [{ id, memberId, sourceEventId: entry.eventId, relatedEventIds: [entry.eventId], type: 'medication_reminder' as const, status: 'active' as const, title: `${medicine.medicationName}用药提醒`, sourceLabel: `${medicine.medicationName} · ${medicine.amountValue} ${medicine.amountUnit}`, createdAt: entry.createdAt, updatedAt: entry.createdAt, medicationPlan, reminder: { at: medicationPlan.nextOccurrenceAt, paused: false } }]
  })
  const additions = events.flatMap((event) => {
    const suggestion = suggestionFor(event)
    if (!suggestion || known.has(event.id) || configuredEventIds.has(event.id) || state.suppressedTypes.includes(suggestion.type)) return []
    const now = event.updatedAt || event.createdAt
    return [{ id: `nurse-${event.id}`, memberId, sourceEventId: event.id, relatedEventIds: [event.id], status: 'pending_confirmation' as const, sourceLabel: `${event.displayTitle || event.title} · ${new Date(event.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, createdAt: now, updatedAt: now, ...suggestion }]
  })
  const upgraded = state.items.map(item => {
    if (item.type !== 'medication_reminder' || item.medicationPlan) return item
    const configuredItem = configured.find(({ entry, medicine }) => `nurse-${entry.eventId}-${medicine.id}` === item.id)
    if (!configuredItem) return item
    const medicationPlan = journalMedicationPlan(configuredItem.entry, configuredItem.medicine)
    return medicationPlan ? { ...item, medicationPlan, reminder: { at: medicationPlan.nextOccurrenceAt, paused: false } } : item
  })
  const changed = upgraded.some((item,index) => item !== state.items[index])
  return reminderAdditions.length || additions.length || changed ? { ...state, items: [...upgraded, ...reminderAdditions, ...additions] } : state
}
