export const nursePromptMessages = [
  '孩子今天哪里不舒服？',
  '吃了什么以后出现了反应？',
  '最近身高体重有新的测量吗？',
  '用了什么药，有没有缓解？',
  '不用一次说完，有变化再补充。'
] as const

export const nursePromptHoldDuration = 2000
export const nursePromptTransitionDuration = 320
export const nursePromptReducedTransitionDuration = 120

export function nextNursePromptIndex(current: number) {
  return (current + 1) % nursePromptMessages.length
}

export function canScheduleNursePromptAdvance(paused: boolean, pageVisible: boolean, transitioning: boolean) {
  return !paused && pageVisible && !transitioning
}
