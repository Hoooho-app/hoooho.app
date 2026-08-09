import { useAppStore } from '../store/useAppStore'
import { formatAgeFromBirthday } from '../utils/formatAgeFromBirthday'

export function useCurrentMember() {
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const members = useAppStore((state) => state.members)
  const profile = useAppStore((state) => state.profile)
  const member = members.find((item) => item.id === currentMemberId) ?? members[0] ?? {
    id: currentMemberId,
    name: profile?.nickname ?? '家庭成员',
    age: profile ? formatAgeFromBirthday(profile.birthday) : '资料加载中',
    relation: '本人' as const,
    birthday: profile?.birthday,
    gender: profile?.gender,
    avatar: profile?.avatar
  }

  if (member.relation === '本人' && profile) {
    return {
      ...member,
      name: profile.nickname,
      birthday: profile.birthday,
      gender: profile.gender,
      avatar: profile.avatar,
      age: formatAgeFromBirthday(profile.birthday)
    }
  }

  return member
}
