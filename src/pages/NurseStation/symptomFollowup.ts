import type { FollowedCase } from '../../features/case-continuity/types'

export function activeSymptomFollowups(items: FollowedCase[], memberId: string) {
  return items.filter(item => item.event.memberId === memberId && !item.event.caseArchivedAt && !item.event.recoveredAt && item.event.status !== 'recovered' && item.followup.hasSymptom === true)
    .sort((a, b) => (b.followup.latestOccurredAt ?? '').localeCompare(a.followup.latestOccurredAt ?? '') || b.event.id.localeCompare(a.event.id))
}

export function followupDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit' }).format(new Date(value))
}
