import { exactAgeInMonths, type GrowthPosition } from '../../features/health-profile/utils/childGrowthReference'
import type { GrowthMeasurementApiDto, Member } from '../../types'

export type GrowthMeasure = 'height' | 'weight'

const daysBetween = (earlier: string, later: string) => Math.max(0, Math.round((Date.parse(later) - Date.parse(earlier)) / 86400000))
const ageLabel = (birthday: string | undefined, measuredAt: string) => {
  const months = exactAgeInMonths(birthday, measuredAt)
  if (months == null) return ''
  const wholeMonths = Math.floor(months)
  return `${Math.floor(wholeMonths / 12)}岁${wholeMonths % 12}个月`
}
const metricValue = (record: GrowthMeasurementApiDto, measure: GrowthMeasure) => measure === 'height' ? record.heightCm : record.weightKg

export function metricRecords(records: readonly GrowthMeasurementApiDto[], measure: GrowthMeasure) {
  return [...records]
    .filter((record) => metricValue(record, measure) != null)
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

export function growthMetricLabel(measure: GrowthMeasure, birthday?: string, measuredAt?: string) {
  if (measure === 'weight') return '体重'
  const ageMonths = birthday && measuredAt ? exactAgeInMonths(birthday, measuredAt) : null
  return ageMonths != null && ageMonths < 24 ? '身长' : '身高'
}

export function metricDisplayValue(measure: GrowthMeasure, value: number) {
  return measure === 'height' ? `${value.toFixed(1)} cm` : `${value.toFixed(1)} kg`
}

export function buildGrowthInterpretation(input: {
  member: Member
  measure: GrowthMeasure
  records: readonly GrowthMeasurementApiDto[]
  position: GrowthPosition | null
}) {
  const records = metricRecords(input.records, input.measure)
  const latest = records.at(-1)
  const previous = records.at(-2)
  const label = growthMetricLabel(input.measure, input.member.birthday, latest?.measuredAt)
  if (!latest) return {
    latest: `还没有可用于解读的${label}记录。`,
    comparison: '保存第一次测量后，这里会显示与记录直接对应的变化。',
    observation: '当前没有数据，不能判断位置或趋势。',
    next: `先记录测量日期和${label}数值；另一项可以暂时留空。`
  }
  const latestValue = metricValue(latest, input.measure)!
  const age = ageLabel(input.member.birthday, latest.measuredAt)
  const position = input.position?.percentileLabel ? `，参考位置 ${input.position.percentileLabel}` : ''
  const latestText = `${latest.measuredAt}${age ? `（${age}）` : ''}记录的${label}为 ${metricDisplayValue(input.measure, latestValue)}${position}。`
  if (!previous) return {
    latest: latestText,
    comparison: `这是第一条有效${label}记录，暂无上一条数据可比较。`,
    observation: `一条记录只能说明这次${label}数值，不能判断长期变化。`,
    next: '保持相近的测量方法和条件，继续记录后再看连续变化。'
  }
  const previousValue = metricValue(previous, input.measure)!
  const days = daysBetween(previous.measuredAt, latest.measuredAt)
  const delta = Math.round((latestValue - previousValue) * 10) / 10
  const direction = delta > 0 ? '增加' : delta < 0 ? '减少' : '没有变化'
  const amount = delta === 0 ? '' : ` ${Math.abs(delta).toFixed(1)} ${input.measure === 'height' ? 'cm' : 'kg'}`
  const comparison = `与 ${days} 天前的上一条${label}记录相比，${direction}${amount}。`
  const spanDays = daysBetween(records[0].measuredAt, latest.measuredAt)
  const observation = records.length === 2
    ? `目前只有 2 条${label}记录，可以描述两次之间的差值，但不足以判断长期趋势。`
    : `现有 ${records.length} 条${label}记录覆盖 ${spanDays} 天，可用于观察连续变化；仍需结合更长时间和一致的测量条件。`
  const next = input.measure === 'weight' && delta < 0
    ? '先核对单位、秤和称重条件；继续记录。若复测仍持续下降，或伴有不适、进食等问题，带记录咨询儿科医生。'
    : '保持相近的测量方法和条件，继续记录；百分位是参考位置，不是成长得分。'
  return { latest: latestText, comparison, observation, next }
}
