import { members } from '../mock/members'
import { useAppStore } from '../store/useAppStore'

export function useCurrentMember() {
  const currentMemberId = useAppStore((state) => state.currentMemberId)
  return members.find((member) => member.id === currentMemberId) ?? members[0]
}
