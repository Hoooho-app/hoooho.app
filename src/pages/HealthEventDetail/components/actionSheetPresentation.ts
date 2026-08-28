export type ActionCategory = 'observation' | 'hospital' | 'consultation' | 'online-consultation' | 'help'

export const actionCategoryOrder: readonly ActionCategory[] = [
  'consultation',
  'online-consultation',
  'hospital',
  'observation',
  'help',
]

export const actionCategoryLabels: Record<ActionCategory, string> = {
  consultation: '问 AI',
  'online-consultation': '在线问诊',
  hospital: '去医院',
  observation: '重点观察',
  help: '求助',
}
