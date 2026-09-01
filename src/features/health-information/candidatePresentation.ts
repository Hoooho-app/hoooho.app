import type { HealthInformationCandidateApiDto, HealthInformationCandidateCategory, HealthProfileDestination } from '../../types'

export const candidateCategoryLabel: Record<HealthInformationCandidateCategory, string> = {
  adverse_reaction: '用药相关反应',
  chronic_condition: '长期健康问题',
  long_term_medication: '长期用药',
  important_health_fact: '重要健康事实'
}

export const destinationOptions: Record<HealthInformationCandidateCategory, Array<{ value: HealthProfileDestination; label: string }>> = {
  adverse_reaction: [{ value: 'allergy_adverse_reaction', label: '过敏与不良反应' }, { value: 'important_health_fact', label: '重要健康事实' }],
  chronic_condition: [{ value: 'chronic_condition', label: '慢性病与长期健康问题' }, { value: 'important_health_fact', label: '重要健康事实' }],
  long_term_medication: [{ value: 'long_term_medication', label: '长期用药' }, { value: 'important_health_fact', label: '重要健康事实' }],
  important_health_fact: [{ value: 'important_health_fact', label: '重要健康事实' }]
}

export function discoveryCardCopy(items: HealthInformationCandidateApiDto[]) {
  const pending = items.filter((item) => item.status === 'pending').length
  const confirmed = items.filter((item) => item.status === 'confirmed').length
  if (pending > 0) return { title: '发现新的健康信息', description: `${pending}条信息可能值得长期保存`, visible: true }
  if (confirmed > 0) return { title: '已加入健康档案', description: `${confirmed}条信息已由你确认`, visible: true }
  return { title: '', description: '', visible: false }
}

export function sourceRecordPath(candidate: HealthInformationCandidateApiDto, recordId = candidate.sourceRecordIds[0]) {
  return `/health-events/${encodeURIComponent(candidate.sourceEventId)}#record-${encodeURIComponent(recordId)}`
}
