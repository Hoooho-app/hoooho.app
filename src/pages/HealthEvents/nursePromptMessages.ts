export const nursePromptMessages = [
  '不舒服就记下来',
  '不用一次说完，有空了再补上',
  '症状加重还是减轻，我们帮你记清',
  '把重要信息整理清楚，去医院不慌',
  '让AI或医生一分钟看懂发生了什么'
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
