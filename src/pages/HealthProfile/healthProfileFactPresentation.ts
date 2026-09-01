import type { HealthProfileFactCategory, HealthProfileFactStatus } from '../../types'

export const healthProfileFactCategoryLabels: Record<HealthProfileFactCategory, string> = {
  important: '重要健康事实',
  allergy: '过敏与不良反应',
  medication: '长期用药',
  chronic: '慢性病与长期健康问题',
  surgery: '手术史',
  other: '其他健康档案'
}

export const healthProfileFactStatusLabels: Record<HealthProfileFactStatus, string> = {
  pending: '待确认',
  confirmed: '已确认',
  removed: '已移除'
}

export function formatHealthFactDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

export function toDateInputValue(value: string) {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}
