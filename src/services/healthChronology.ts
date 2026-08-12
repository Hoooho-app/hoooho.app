export interface HealthChronologyItem {
  id: string
  occurredAt: string
  createdAt: string
}

export function compareHealthChronologyDesc(left: HealthChronologyItem, right: HealthChronologyItem) {
  return right.occurredAt.localeCompare(left.occurredAt)
    || right.createdAt.localeCompare(left.createdAt)
    || right.id.localeCompare(left.id)
}

export function compareHealthChronologyAsc(left: HealthChronologyItem, right: HealthChronologyItem) {
  return left.occurredAt.localeCompare(right.occurredAt)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
}
