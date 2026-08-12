export type ActionCategory = 'observation' | 'hospital' | 'consultation' | 'help'

export const actionCategoryOrder: readonly ActionCategory[] = [
  'consultation',
  'hospital',
  'observation',
  'help',
]

export const actionCategoryLabels: Record<ActionCategory, string> = {
  consultation: 'AI问诊',
  hospital: '去医院',
  observation: '重点观察',
  help: '求助',
}
