import type { FollowedCase } from '../../features/case-continuity/types'

export function activeSymptomFollowups(items: FollowedCase[], memberId: string) {
  return items.filter(item => item.event.memberId === memberId && !item.event.caseArchivedAt && !item.event.recoveredAt && item.event.status !== 'recovered' && item.followup.hasSymptom === true)
    .sort((a, b) => (b.followup.latestOccurredAt ?? '').localeCompare(a.followup.latestOccurredAt ?? '') || b.event.id.localeCompare(a.event.id))
}

export function followupDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).format(new Date(value))
}

// Use only saved facts; missing occurrence times never fall back to creation time.
export function symptomPreview(item: FollowedCase, timezone = 'Asia/Shanghai') {
  const title = item.followup.title.trim()
  const description = [item.followup.description, item.followup.supplement, item.latest?.content]
    .map(value => value?.trim()).find(value => value && value !== title) || null
  const occurredAt = item.followup.latestOccurredAt
  const latest = occurredAt && Number.isFinite(Date.parse(occurredAt))
    ? new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(occurredAt))
    : null
  return { description, latest }
}
