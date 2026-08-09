import type { FamilyMemberApiDto, HealthEventApiDto, HealthEventListItemViewModel } from '../types'

export function adaptHealthEventList(
  events: HealthEventApiDto[],
  members: FamilyMemberApiDto[]
): HealthEventListItemViewModel[] {
  const memberNames = new Map(members.map((member) => [member.id, member.name]))
  return events.map((event) => ({
    id: event.id,
    memberId: event.memberId,
    memberName: memberNames.get(event.memberId) ?? '未知成员',
    title: event.title,
    category: event.category,
    status: event.status,
    startTime: event.startTime,
    updatedAt: event.updatedAt
  }))
}
