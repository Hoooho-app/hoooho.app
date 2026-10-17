import { create } from 'zustand'

export type RecoveryStage = 'session' | 'members' | 'profile'
interface BrowserRecoveryState {
  phase: 'idle' | 'recovering' | 'failed' | 'restored'
  stage: RecoveryStage
  contextAccountId: string | null
  reauthenticationRequired: boolean
  blockingScreens: number
}

export const useBrowserRecoveryState = create<BrowserRecoveryState>(() => ({
  phase: 'idle', stage: 'session', contextAccountId: null, reauthenticationRequired: false, blockingScreens: 0
}))

export function resetBrowserRecoveryState() {
  useBrowserRecoveryState.setState({ phase: 'idle', stage: 'session', contextAccountId: null, reauthenticationRequired: false })
}
