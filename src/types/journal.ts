export type JournalCategory = 'diet' | 'sleep' | 'elimination' | 'activity' | 'emotion' | 'social' | 'symptom' | 'measurement' | 'growth' | 'injury' | 'medication' | 'care' | 'vaccination' | 'environment' | 'visit' | 'examination' | 'other'
export interface JournalMetadata {
  categories?: JournalCategory[]
  timePrecision?: 'exact' | 'period' | 'day' | 'unknown'
  timeLabel?: string
  occurredAt?: string
}
