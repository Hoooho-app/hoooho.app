export type ActionCategory = 'observation' | 'hospital' | 'consultation' | 'help'

export const actionCategoryOrder: readonly ActionCategory[] = [
  'consultation',
  'hospital',
  'observation',
  'help',
]

export const actionCategoryLabels: Record<ActionCategory, string> = {
  consultation: '问 AI',
  hospital: '去医院',
  observation: '重点观察',
  help: '求助',
}
