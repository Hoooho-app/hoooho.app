import type { HealthEventListItemViewModel } from '../../types'

export function getNurseNextActionEventId(
  events: readonly HealthEventListItemViewModel[],
  currentMemberId: string
) {
  return [...events]
    .filter((event) => event.memberId === currentMemberId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.id ?? null
}
