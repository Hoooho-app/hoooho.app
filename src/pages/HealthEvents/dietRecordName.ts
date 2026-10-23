import type { DietRecordKind, JournalDietDetails } from '../../types/journal'

export type DietRecordNameKey = 'meal' | 'snack' | 'formula' | 'expressed' | 'mixed'
export type DietRecordNames = Partial<Record<DietRecordNameKey, string>>

export function dietRecordNameKey(kind: DietRecordKind, method?: JournalDietDetails['feedingMethod']): DietRecordNameKey | undefined {
  if (kind === 'meal' || kind === 'snack') return kind
  if (kind === 'feeding' && (method === 'formula' || method === 'expressed' || method === 'mixed')) return method
  return undefined
}

/** Use the same local clock as the occurrence editor, including backfilled dates. */
export function suggestedDietRecordName(key: DietRecordNameKey, occurredAt: string): string {
  const hour = new Date(occurredAt).getHours()
  if (!Number.isFinite(hour)) return key === 'meal' ? '正餐' : key === 'snack' ? '零食' : '喂奶'
  if (key === 'meal') {
    if (hour < 5 || hour >= 22) return '夜宵'
    if (hour < 11) return '早餐'
    if (hour < 16) return '午餐'
    return '晚餐'
  }
  if (key === 'snack') {
    if (hour < 6 || hour >= 22) return '夜间加餐'
    if (hour < 11) return '上午加餐'
    if (hour < 14) return '午间加餐'
    if (hour < 18) return '下午加餐'
    return '晚间加餐'
  }
  if (hour < 6 || hour >= 22) return '夜奶'
  if (hour < 11) return '早奶'
  if (hour < 17) return '午奶'
  return '晚奶'
}

export function resolveDietRecordName(key: DietRecordNameKey, occurredAt: string, names: DietRecordNames): string {
  return names[key]?.trim() || suggestedDietRecordName(key, occurredAt)
}
