import { useAppStore } from '../store/useAppStore'
import { formatAgeFromBirthday } from '../utils/formatAgeFromBirthday'

export function useCurrentMember() {
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  const members = useAppStore((state) => state.members)
  const profile = useAppStore((state) => state.profile)
  const member = members.find((item) => item.id === currentMemberId) ?? members[0]

  if (member.id === 'self' && profile) {
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
