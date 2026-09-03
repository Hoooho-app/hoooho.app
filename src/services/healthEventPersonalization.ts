import { differenceInMonths, differenceInYears, isValid, parseISO } from 'date-fns'
import type { HealthProfile, Member, ProfileGender, UserProfile } from '../types'
import { formatAgeFromBirthday } from '../utils/formatAgeFromBirthday'

export type LifeStage = 'infant' | 'child' | 'teen' | 'adult' | 'senior'
export interface HealthEventSubject {
  memberId: string
  name: string
  avatar?: string
  birthday: string
  gender: ProfileGender
  genderLabel: string
  ageYears: number
  ageMonths: number
  displayAge: string
  lifeStage: LifeStage
  healthTags: string[]
  healthProfile?: HealthProfile
}
const genderLabels: Record<ProfileGender, string> = {
  male: '男',
  female: '女',
  undisclosed: '不方便透露',
  '': '未填写'
}

function getLifeStage(ageYears: number, ageMonths: number): LifeStage {
  if (ageMonths <= 36) return 'infant'
  if (ageYears <= 12) return 'child'
  if (ageYears < 18) return 'teen'
  if (ageYears < 60) return 'adult'
  return 'senior'
}

function getHealthTags(profile?: HealthProfile) {
  if (!profile) return []
  return [
    ...profile.chronicDiseases,
    ...profile.medicalHistory,
    ...profile.medications,
    ...profile.allergies
  ].filter(Boolean)
}

export function createHealthEventSubject(member: Member, userProfile?: UserProfile | null, healthProfile?: HealthProfile): HealthEventSubject {
  const useAccountProfile = member.relation === '本人' && Boolean(userProfile)
  const birthday = useAccountProfile ? userProfile?.birthday || '' : member.birthday || ''
  const gender = useAccountProfile ? userProfile?.gender || '' : member.gender || ''
  const parsedBirthday = parseISO(birthday)
  const validBirthday = Boolean(birthday) && isValid(parsedBirthday) && parsedBirthday <= new Date()
  const ageYears = validBirthday ? Math.max(differenceInYears(new Date(), parsedBirthday), 0) : 0
  const ageMonths = validBirthday ? Math.max(differenceInMonths(new Date(), parsedBirthday), 0) : 0

  return {
    memberId: member.id,
    name: useAccountProfile ? userProfile?.nickname || member.name : member.name,
    avatar: useAccountProfile ? userProfile?.avatar || member.avatar : member.avatar,
    birthday,
    gender,
    genderLabel: genderLabels[gender],
    ageYears,
    ageMonths,
    displayAge: validBirthday ? formatAgeFromBirthday(birthday) : member.age || '未填写年龄',
    lifeStage: getLifeStage(ageYears, ageMonths),
    healthTags: getHealthTags(healthProfile),
    healthProfile
  }
}
