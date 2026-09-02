export type NurseSaveInputChannel = 'voice' | 'text'

export function shouldTriggerNurseSaveSuccess(
  inputChannel: NurseSaveInputChannel,
  currentSession: number,
  lastAnimatedSession: number
) {
  return inputChannel === 'voice' && currentSession !== lastAnimatedSession
}
