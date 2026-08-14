import type { ProfileExperienceField, ProfileValues, ProfileValue } from '../config/profileSectionExperiences'

export function calculateSleepDuration(bedtime: unknown, wakeTime: unknown) {
  if (typeof bedtime !== 'string' || typeof wakeTime !== 'string' || !/^\d{2}:\d{2}$/.test(bedtime) || !/^\d{2}:\d{2}$/.test(wakeTime)) return ''
  const toMinutes = (value: string) => { const [hours, minutes] = value.split(':').map(Number); return hours * 60 + minutes }
  const start = toMinutes(bedtime)
  let end = toMinutes(wakeTime)
  if (end <= start) end += 24 * 60
  const duration = (end - start) / 60
  return Number.isInteger(duration) ? String(duration) : duration.toFixed(1)
}

export function shouldShowProfileField(field: ProfileExperienceField, values: ProfileValues) {
  if (!field.visibleWhen) return true
  const current = values[field.visibleWhen.field]
  if (Array.isArray(current)) return current.some((value) => field.visibleWhen?.values.includes(value))
  return field.visibleWhen.values.includes(String(current ?? ''))
}

export function normalizeProfileValues(input: unknown): ProfileValues {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return Object.fromEntries(Object.entries(input).map(([key, value]) => {
    if (Array.isArray(value)) return [key, value.filter((item): item is string => typeof item === 'string')]
    if (typeof value === 'boolean' || typeof value === 'string') return [key, value]
    if (typeof value === 'number') return [key, String(value)]
    return [key, '']
  }))
}

export function getCurrentProfileValue(records: unknown[]) {
  return normalizeProfileValues(records[0])
}

export function saveCurrentProfile(values: ProfileValues, records: unknown[], savedAt = new Date().toISOString()) {
  const previous = normalizeProfileValues(records[0])
  return [{ ...previous, ...values, _savedAt: savedAt }, ...records.slice(1).map(normalizeProfileValues)]
}

export function sortProfileRecords(records: ProfileValues[], dateField = 'date', direction: 'asc' | 'desc' = 'desc') {
  return [...records].sort((left, right) => {
    const byDate = String(left[dateField] ?? '').localeCompare(String(right[dateField] ?? ''))
    if (byDate !== 0) return direction === 'desc' ? -byDate : byDate
    const bySavedAt = String(left._savedAt ?? '').localeCompare(String(right._savedAt ?? ''))
    return direction === 'desc' ? -bySavedAt : bySavedAt
  })
}

export function profileValueIsFilled(value: ProfileValue | undefined) {
  return Array.isArray(value) ? value.length > 0 : value !== '' && value !== false && value != null
}

export function normalizeLegacyProfile(sectionId: string, record: ProfileValues): ProfileValues {
  const next = { ...record }
  if (sectionId === 'sleep') {
    if (profileValueIsFilled(record.wakeEasy)) next.problems = [...new Set([...(Array.isArray(record.problems) ? record.problems : []), String(record.wakeEasy) === '是' ? '容易醒' : ''])].filter(Boolean)
    if (profileValueIsFilled(record.snore)) next.problems = [...new Set([...(Array.isArray(next.problems) ? next.problems : []), String(record.snore) === '是' ? '打鼾' : ''])].filter(Boolean)
  }
  if (sectionId === 'smoking') {
    if (record.status === '从不') next.status = '从不吸烟'
    if (record.status === '当前吸烟') next.status = '目前吸烟'
  }
  if (sectionId === 'transfusion' && record.reaction) next.reactionStatus = record.reaction === '是' ? '出现过反应' : '没有明显反应'
  if (sectionId === 'menstrual' && record.regular) next.regularity = record.regular === '是' ? '规律' : '不规律'
  if (sectionId === 'family-history' && record.disease && !record.conditions) next.conditions = [String(record.disease)]
  return next
}

export function deriveProfileSummary(sectionId: string, values: ProfileValues) {
  if (sectionId === 'sleep') {
    const duration = calculateSleepDuration(values.bedtime, values.wakeTime)
    return duration ? `约 ${duration} 小时 / 晚` : '填写入睡和起床时间后自动计算'
  }
  if (sectionId === 'menstrual' && values.cycle && values.duration) return `${values.cycle} 天周期 · 经期约 ${values.duration} 天`
  if (sectionId === 'birth' && Number(values.gestationalWeeks) > 0) return Number(values.gestationalWeeks) < 37 ? '孕周提示：早产' : '孕周已记录'
  if (sectionId === 'smoking') return String(values.status || '尚未填写吸烟情况')
  return ''
}
