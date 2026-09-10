import { normalizeAllergyRecords } from '../../features/health-profile/utils/allergyProfile'
import type { HealthEventApiDto, Member } from '../../types'
type SectionRecords = ReadonlyMap<string, Array<Record<string, unknown>>>
const present = (value: unknown) => value !== null && value !== undefined && value !== '' && value !== false
const numberText = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? value.trim() : ''
export function buildBasicOverview(member: Member, records: SectionRecords) {
  const birth = records.get('birth')?.[0] ?? {}, growth = [...(records.get('growth') ?? [])].sort((a, b) => String(b.date ?? b._savedAt ?? '').localeCompare(String(a.date ?? a._savedAt ?? '')))[0] ?? {}, basic = records.get('basic')?.[0] ?? {}
  const weeks = Number(birth.gestationalWeeks), birthSummary = Number.isFinite(weeks) && weeks > 0 ? (weeks >= 37 ? '足月出生' : '早产出生') : ''
  const height = numberText(member.heightCm ?? growth.height ?? basic.height), weight = numberText(member.weightKg ?? growth.weight ?? basic.weight), head = numberText(member.headCircumferenceCm ?? growth.headCircumference ?? basic.headCircumference)
  const bloodType = String(member.bloodType ?? basic.aboBloodType ?? basic.bloodType ?? '').replace(/型$/, '')
  const missingCount = [height, weight, bloodType].filter((value) => !value).length
  return {
    bloodType, complete: missingCount === 0,
    filled: [member.heightCm, member.weightKg, member.headCircumferenceCm, ...Object.values(birth), ...Object.values(growth), ...Object.values(basic)].some(present),
    height, missingCount,
    summary: [birthSummary, height && `${height} cm`, weight && `${weight} kg`, head && `头围 ${head} cm`].filter(Boolean).join(' · '),
    updatedAt: String(basic._savedAt ?? ''), weight
  }
}

export function formatGrowthCardUpdatedAt(value: string, today = new Date()) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()) return '更新于今天'
  return `更新于${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
const formatChineseDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `${date.getMonth() + 1}月${date.getDate()}日` }
export function buildAllergyOverview(rawRecords: Array<Record<string, unknown>> | undefined, events: HealthEventApiDto[], memberId: string) {
  const records = normalizeAllergyRecords(rawRecords ?? []).filter((record) => [record.subject, record.type, record.reactionDetail, record.otherReaction, record.impact, record.handling, ...record.reactions].some(present))
  const latestEvent = events.filter((event) => event.memberId === memberId && event.category === 'allergy').sort((a, b) => b.startTime.localeCompare(a.startTime))[0]
  const latestText = latestEvent?.eventSummary?.displayedResult.summary?.trim() || latestEvent?.title?.trim() || ''
  return { total: records.length, investigating: records.filter((r) => r.certainty === '正在排查').length, suspected: records.filter((r) => r.certainty === '怀疑中' || r.certainty === '家长怀疑').length, doctorConfirmed: records.filter((r) => r.certainty === '医生已确认').length, latest: latestEvent && latestText ? `${formatChineseDate(latestEvent.startTime)} · ${latestText}` : '' }
}
