export type HealthEventsViewMode = 'list' | 'triage'

export const DEFAULT_HEALTH_EVENTS_VIEW_MODE: HealthEventsViewMode = 'triage'

export const healthEventsViewLabels: Record<HealthEventsViewMode, string> = {
  triage: '前台视图',
  list: '时间视图'
}

export type NurseTriageState =
  | 'idle'
  | 'attention'
  | 'preparing'
  | 'listening'
  | 'speechPaused'
  | 'reviewing'
  | 'awaitingConfirmation'
  | 'saving'
  | 'saved'
  | 'handoff'
  | 'shifted'
  | 'error'

export type NurseTriageAction =
  | 'start'
  | 'attentionComplete'
  | 'microphoneReady'
  | 'speechPaused'
  | 'speechResumed'
  | 'finishSpeaking'
  | 'editTranscript'
  | 'continueSpeaking'
  | 'confirmSave'
  | 'saveSucceeded'
  | 'saveFailed'
  | 'handoffStarted'
  | 'handoffCompleted'
  | 'reset'
  | 'fail'

const transitions: Partial<Record<NurseTriageState, Partial<Record<NurseTriageAction, NurseTriageState>>>> = {
  idle: { start: 'attention', handoffStarted: 'handoff' },
  attention: { attentionComplete: 'preparing', fail: 'error', reset: 'idle' },
  preparing: { microphoneReady: 'listening', fail: 'error', reset: 'idle' },
  listening: { speechPaused: 'speechPaused', finishSpeaking: 'reviewing', fail: 'error', reset: 'idle' },
  speechPaused: { speechResumed: 'listening', finishSpeaking: 'reviewing', fail: 'error', reset: 'idle' },
  reviewing: { editTranscript: 'awaitingConfirmation', continueSpeaking: 'attention', confirmSave: 'saving', reset: 'idle' },
  awaitingConfirmation: { editTranscript: 'awaitingConfirmation', continueSpeaking: 'attention', confirmSave: 'saving', reset: 'idle' },
  saving: { saveSucceeded: 'saved', saveFailed: 'reviewing', reset: 'idle' },
  saved: { start: 'attention', handoffStarted: 'handoff', reset: 'idle' },
  handoff: { handoffCompleted: 'shifted', reset: 'idle' },
  shifted: { start: 'attention', reset: 'idle' },
  error: { start: 'attention', editTranscript: 'awaitingConfirmation', reset: 'idle' }
}

export function transitionNurseTriage(state: NurseTriageState, action: NurseTriageAction): NurseTriageState {
  return transitions[state]?.[action] ?? state
}

export function canStartNurseHandoff(state: NurseTriageState) {
  return state === 'idle' || state === 'saved'
}

export function shouldShowHealthEventFilters(view: HealthEventsViewMode) {
  return view === 'list'
}
