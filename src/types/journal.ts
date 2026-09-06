export type JournalCategory = 'diet' | 'sleep' | 'elimination' | 'activity' | 'emotion' | 'social' | 'symptom' | 'measurement' | 'growth' | 'injury' | 'medication' | 'care' | 'vaccination' | 'environment' | 'visit' | 'examination' | 'other'

export type DietRecordKind = 'feeding' | 'complementary' | 'meal' | 'snack' | 'supplement'

export interface JournalDietDetails {
  kind: DietRecordKind
  feedingMethod?: 'breast' | 'formula' | 'expressed' | 'mixed'
  breastSeconds?: { left: number; right: number; total: number }
  bottleMl?: number
  foods?: string[]
  foodForm?: 'puree' | 'minced' | 'small-pieces' | 'finger-food'
  amount?: string
  firstTryFoods?: string[]
  reactions?: string[]
  meal?: '早餐' | '午餐' | '晚餐' | '零食'
  appetite?: '比平时少' | '和平时差不多' | '比平时多'
  feedingStatuses?: string[]
  voiceTranscript?: string
  supplementNames?: string[]
  supplementAmount?: string
  supplementUnit?: '滴' | '毫升' | '粒' | '袋'
}

export interface JournalBowelDetails {
  shapes: string[]
  color?: string
  amount?: string
  durationRange?: string
  process?: string
  bloodObservation?: 'none-seen' | 'possibly-seen'
  observations: string[]
}

export interface JournalSleepDetails {
  sleepAt: string
  wakeAt: string
  durationMinutes: number
  kind: 'night' | 'nap'
  quality?: '睡得安稳' | '有些翻动' | '频繁醒来'
  observations?: string[]
  otherNote?: string
}

export interface JournalMetadata {
  categories?: JournalCategory[]
  timePrecision?: 'exact' | 'period' | 'day' | 'unknown'
  timeLabel?: string
  occurredAt?: string
  diet?: JournalDietDetails
  bowel?: JournalBowelDetails
  sleep?: JournalSleepDetails
}
