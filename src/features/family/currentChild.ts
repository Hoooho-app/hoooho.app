import type { Member } from '../../types'

export function getChildMembers(members: Member[]) {
  return members.filter((member) => member.relation === '子女')
}

export function resolveCurrentChildId(members: Member[], currentMemberId: string) {
  const children = getChildMembers(members)
  return children.some((member) => member.id === currentMemberId)
    ? currentMemberId
    : children[0]?.id ?? 'self'
}
