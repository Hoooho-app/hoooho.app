import { normalizeAllergyRecords } from '../../features/health-profile/utils/allergyProfile'
import type { HealthEventApiDto, Member } from '../../types'
type SectionRecords = ReadonlyMap<string, Array<Record<string, unknown>>>
const present = (value: unknown) => value !== null && value !== undefined && value !== '' && value !== false
const numberText = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? value.trim() : ''
export function buildBasicOverview(member: Member, records: SectionRecords) {
  const birth = records.get('birth')?.[0] ?? {}, growth = [...(records.get('growth') ?? [])].sort((a, b) => String(b.date ?? b._savedAt ?? '').localeCompare(String(a.date ?? a._savedAt ?? '')))[0] ?? {}, basic = records.get('basic')?.[0] ?? {}
  const weeks = Number(birth.gestationalWeeks), birthSummary = Number.isFinite(weeks) && weeks > 0 ? (weeks >= 37 ? '足月出生' : '早产出生') : ''
  const height = numberText(member.heightCm ?? growth.height ?? basic.height), weight = numberText(member.weightKg ?? growth.weight ?? basic.weight), head = numberText(member.headCircumferenceCm ?? growth.headCircumference ?? basic.headCircumference)
  return { filled: [member.heightCm, member.weightKg, member.headCircumferenceCm, ...Object.values(birth), ...Object.values(growth), ...Object.values(basic)].some(present), summary: [birthSummary, height && `${height} cm`, weight && `${weight} kg`, head && `头围 ${head} cm`].filter(Boolean).join(' · ') }
}
const formatChineseDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `${date.getMonth() + 1}月${date.getDate()}日` }
export function buildAllergyOverview(rawRecords: Array<Record<string, unknown>> | undefined, events: HealthEventApiDto[], memberId: string) {
  const records = normalizeAllergyRecords(rawRecords ?? []).filter((record) => [record.subject, record.type, record.reactionDetail, record.otherReaction, record.impact, record.handling, ...record.reactions].some(present))
  const latestEvent = events.filter((event) => event.memberId === memberId && event.category === 'allergy').sort((a, b) => b.startTime.localeCompare(a.startTime))[0]
  const latestText = latestEvent?.eventSummary?.displayedResult.summary?.trim() || latestEvent?.title?.trim() || ''
  return { total: records.length, investigating: records.filter((r) => r.certainty === '正在排查').length, suspected: records.filter((r) => r.certainty === '怀疑中' || r.certainty === '家长怀疑').length, doctorConfirmed: records.filter((r) => r.certainty === '医生已确认').length, latest: latestEvent && latestText ? `${formatChineseDate(latestEvent.startTime)} · ${latestText}` : '' }
}
