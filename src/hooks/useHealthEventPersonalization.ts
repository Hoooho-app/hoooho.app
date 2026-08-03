import { healthProfiles } from '../mock/healthProfiles'
import { members } from '../mock/members'
import { createHealthEventSubject, getRecommendedHealthModules } from '../services/healthEventPersonalization'
import { useAppStore } from '../store/useAppStore'
import type { HealthEventStage } from '../types'

export function useHealthEventPersonalization(memberId: string | undefined, stage: HealthEventStage) {
  const userProfile = useAppStore((state) => state.profile)
  const member = members.find((item) => item.id === memberId) ?? members[0]
  const healthProfile = healthProfiles.find((item) => item.memberId === member.id)
  const subject = createHealthEventSubject(member, userProfile, healthProfile)

  return { subject, recommendedModules: getRecommendedHealthModules(subject, stage) }
}
