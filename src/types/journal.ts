export type JournalCategory = 'diet' | 'sleep' | 'elimination' | 'activity' | 'emotion' | 'social' | 'symptom' | 'measurement' | 'growth' | 'injury' | 'medication' | 'care' | 'vaccination' | 'environment' | 'visit' | 'examination' | 'other'

export type DietRecordKind = 'feeding' | 'complementary' | 'meal' | 'snack'

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
}

export interface JournalMetadata {
  categories?: JournalCategory[]
  timePrecision?: 'exact' | 'period' | 'day' | 'unknown'
  timeLabel?: string
  occurredAt?: string
  diet?: JournalDietDetails
}
