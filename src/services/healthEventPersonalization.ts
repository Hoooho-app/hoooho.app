import { differenceInMonths, differenceInYears, isValid, parseISO } from 'date-fns'
import type { HealthEventStage, HealthProfile, Member, ProfileGender, UserProfile } from '../types'
import { formatAgeFromBirthday } from '../utils/formatAgeFromBirthday'

export type LifeStage = 'infant' | 'child' | 'teen' | 'adult' | 'senior'
export type PersonalizedModuleSource = 'age-stage' | 'gender' | 'health-background' | 'lifecycle'

export type PersonalizedModuleId =
  | 'feeding'
  | 'sleep'
  | 'growth'
  | 'exercise'
  | 'emotion'
  | 'female-health'
  | 'lifestyle'
  | 'medication-change'
  | 'mobility'
  | 'blood-glucose'

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

export interface PersonalizedHealthModule {
  id: PersonalizedModuleId
  title: string
  description: string
  source: PersonalizedModuleSource
  status: 'placeholder'
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

const moduleCatalog: Record<PersonalizedModuleId, Omit<PersonalizedHealthModule, 'id' | 'source' | 'status'>> = {
  feeding: { title: '喂养记录', description: '记录饮食和喂养变化' },
  sleep: { title: '睡眠情况', description: '记录近期睡眠规律变化' },
  growth: { title: '成长变化', description: '记录身高体重变化' },
  exercise: { title: '运动情况', description: '记录近期运动习惯变化' },
  emotion: { title: '情绪状态', description: '记录近期情绪变化' },
  'female-health': { title: '女性健康', description: '补充这条健康随记相关的女性健康信息' },
  lifestyle: { title: '生活方式', description: '记录饮酒、吸烟和作息变化' },
  'medication-change': { title: '用药变化', description: '记录长期药物和近期用药变化' },
  mobility: { title: '活动情况', description: '记录近期活动能力变化' },
  'blood-glucose': { title: '血糖变化', description: '记录血糖、饮食和用药变化' }
}

function createModule(id: PersonalizedModuleId, source: PersonalizedModuleSource): PersonalizedHealthModule {
  return { id, ...moduleCatalog[id], source, status: 'placeholder' }
}

export function getRecommendedHealthModules(subject: HealthEventSubject, _stage: HealthEventStage): PersonalizedHealthModule[] {
  const modules: PersonalizedHealthModule[] = []
  const add = (id: PersonalizedModuleId, source: PersonalizedModuleSource) => {
    if (!modules.some((module) => module.id === id)) modules.push(createModule(id, source))
  }

  // Long-term health background has the highest priority.
  const background = subject.healthTags.join('、')
  if (/糖尿病|血糖/.test(background)) add('blood-glucose', 'health-background')
  if (subject.healthProfile?.medications.length || /高血压|慢性病|心血管/.test(background)) add('medication-change', 'health-background')

  switch (subject.lifeStage) {
    case 'infant':
      add('feeding', 'age-stage')
      add('sleep', 'age-stage')
      add('growth', 'age-stage')
      break
    case 'child':
      add('sleep', 'age-stage')
      add('exercise', 'age-stage')
      add('growth', 'age-stage')
      break
    case 'teen':
      add('sleep', 'age-stage')
      add('exercise', 'age-stage')
      add('emotion', 'age-stage')
      if (subject.gender === 'female') add('female-health', 'gender')
      break
    case 'adult':
      if (subject.gender === 'female') add('female-health', 'gender')
      add('exercise', 'age-stage')
      if (subject.gender === 'male') add('lifestyle', 'gender')
      break
    case 'senior':
      add('medication-change', 'age-stage')
      add('mobility', 'age-stage')
      add('sleep', 'age-stage')
      break
  }

  return modules
}
