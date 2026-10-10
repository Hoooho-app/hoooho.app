import type { JournalCategory } from '../../types/journal'

// Calendar-only choices. Legacy categories remain readable in “全部类型”.
export const calendarCategories = ['symptom', 'medication', 'sleep', 'diet', 'elimination', 'care', 'vaccination', 'visit', 'examination', 'growth', 'injury', 'activity', 'emotion', 'other'] as const
export const calendarCategoryLabels: Record<JournalCategory, string> = {
  symptom: '症状', medication: '用药', sleep: '睡眠', diet: '喂养', elimination: '排便', care: '涂抹',
  vaccination: '疫苗', visit: '就医', examination: '检查', growth: '成长', injury: '受伤', activity: '活动',
  emotion: '情绪', other: '其他', measurement: '测量', environment: '环境', social: '社交',
}
export function calendarRecordTone(categories: readonly JournalCategory[] = [], selected = '') {
  const shown = selected && categories.includes(selected as JournalCategory) ? [selected] : categories
  if (shown.includes('symptom') || shown.includes('injury')) return 'red'
  if (shown.includes('vaccination')) return 'orange'
  if (shown.some(c => ['medication', 'visit', 'examination'].includes(c))) return 'teal'
  return 'blue'
}
