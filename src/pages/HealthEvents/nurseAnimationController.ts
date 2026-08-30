import type { IdleNurseAction } from './idleNurseAnimation'

export type NurseAnimationKind = 'idle' | 'special' | 'listening' | 'processing' | 'success' | 'error'

export interface NurseAnimationControllerState {
  action: IdleNurseAction | null
  kind: NurseAnimationKind
  requestId: number
}

export type NurseAnimationControllerEvent =
  | { type: 'PLAY'; action: IdleNurseAction; kind: 'special'; requestId: number }
  | { type: 'PLAY'; kind: Exclude<NurseAnimationKind, 'idle' | 'special'>; requestId: number }
  | { type: 'RETURN_TO_IDLE'; requestId: number }
  | { type: 'FORCE_IDLE'; requestId: number }

const animationKinds = new Set<NurseAnimationKind>(['idle', 'special', 'listening', 'processing', 'success', 'error'])
const specialActions = new Set<IdleNurseAction>(['stretch', 'chairSpin', 'waterPlant'])

export function createIdleNurseAnimationState(requestId = 0): NurseAnimationControllerState {
  return { action: null, kind: 'idle', requestId }
}

export function normalizeNurseAnimationState(value: unknown): NurseAnimationControllerState {
  if (!value || typeof value !== 'object') return createIdleNurseAnimationState()
  const candidate = value as Partial<NurseAnimationControllerState>
  if (!candidate.kind || !animationKinds.has(candidate.kind)) return createIdleNurseAnimationState()
  if (typeof candidate.requestId !== 'number') return createIdleNurseAnimationState()
  if (candidate.kind === 'special' && (!candidate.action || !specialActions.has(candidate.action))) {
    return createIdleNurseAnimationState(candidate.requestId)
  }
  return {
    action: candidate.kind === 'special' ? candidate.action ?? null : null,
    kind: candidate.kind,
    requestId: candidate.requestId
  }
}

export function transitionNurseAnimation(
  currentValue: NurseAnimationControllerState,
  event: NurseAnimationControllerEvent
): NurseAnimationControllerState {
  const current = normalizeNurseAnimationState(currentValue)
  if (event.requestId < current.requestId) return current

  if (event.type === 'FORCE_IDLE') return createIdleNurseAnimationState(event.requestId)
  if (event.type === 'RETURN_TO_IDLE') {
    return event.requestId === current.requestId ? createIdleNurseAnimationState(event.requestId) : current
  }

  return {
    action: event.kind === 'special' ? event.action : null,
    kind: event.kind,
    requestId: event.requestId
  }
}

export function resolveNurseAnimationKind(
  businessKind: Exclude<NurseAnimationKind, 'idle' | 'special'> | null,
  userSpecial: boolean,
  ambientSpecial: boolean
): NurseAnimationKind {
  if (businessKind) return businessKind
  if (userSpecial || ambientSpecial) return 'special'
  return 'idle'
}
