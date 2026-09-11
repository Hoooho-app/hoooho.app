import type { GrowthMeasurementApiDto, Member } from '../../../types'
import { calculateGrowthPosition, type GrowthPosition } from './childGrowthReference'

export const GROWTH_STANDARDS = [{ id: 'who-2006' as const, name: '世界卫生组织儿童生长标准', version: '2006', ageRange: '0–5岁', source: 'WHO Child Growth Standards' }]

export function growthPositionBand(...positions: Array<GrowthPosition | null>) {
  const available = positions.filter((value): value is GrowthPosition => value != null)
  if (!available.length) return '缺少适用的参考数据，仅保存原始记录'
  if (available.some((value) => value.percentile < 3 || value.percentile > 97)) return '接近或超出参考区间边缘，请先确认测量'
  if (available.some((value) => value.percentile < 15)) return '目前位于参考区间中下部'
  if (available.some((value) => value.percentile > 85)) return '目前位于参考区间中上部'
  return '目前位于参考区间中部'
}

export function requiresMeasurementConfirmation(previous: GrowthMeasurementApiDto | undefined, next: { measuredAt: string; heightCm: number | null; weightKg: number | null }) {
  if (!previous || next.measuredAt <= previous.measuredAt) return false
  const days = Math.max(1, Math.round((Date.parse(next.measuredAt) - Date.parse(previous.measuredAt)) / 86400000))
  return (previous.heightCm != null && next.heightCm != null && Math.abs(next.heightCm - previous.heightCm) > Math.max(5, days / 20))
    || (previous.weightKg != null && next.weightKg != null && Math.abs(next.weightKg - previous.weightKg) > Math.max(3, days / 30))
}

export function decorateGrowthRecords(records: readonly GrowthMeasurementApiDto[], member: Member) {
  return [...records].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt)).map((record) => ({
    ...record,
    heightPosition: record.heightCm == null ? null : calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: record.measuredAt, measure: 'height', value: record.heightCm }),
    weightPosition: record.weightKg == null ? null : calculateGrowthPosition({ birthday: member.birthday, gender: member.gender, measuredAt: record.measuredAt, measure: 'weight', value: record.weightKg })
  }))
}

export function growthTrend(records: ReturnType<typeof decorateGrowthRecords>) {
  const confirmed = records.filter((item) => item.dataStatus === 'confirmed')
  const latest = confirmed.at(-1), previous = confirmed.at(-2)
  if (!latest) return { kind: 'insufficient' as const, label: '需要更多记录才能判断', triggerReassurance: false }
  if (!previous) return { kind: 'insufficient' as const, label: '需要更多记录才能判断', triggerReassurance: (latest.heightPosition?.percentile ?? 50) < 15 || (latest.weightPosition?.percentile ?? 50) < 15 }
  const heightShift = (latest.heightPosition?.zScore ?? 0) - (previous.heightPosition?.zScore ?? 0)
  const weightShift = (latest.weightPosition?.zScore ?? 0) - (previous.weightPosition?.zScore ?? 0)
  const days = Math.max(1, Math.round((Date.parse(latest.measuredAt) - Date.parse(previous.measuredAt)) / 86400000))
  const largeDifference = Math.abs((latest.heightCm ?? 0) - (previous.heightCm ?? 0)) > Math.max(5, days / 20) || Math.abs((latest.weightKg ?? 0) - (previous.weightKg ?? 0)) > Math.max(3, days / 30)
  const falling = heightShift < -0.67 || weightShift < -0.67
  return {
    kind: largeDifference ? 'confirm' as const : falling ? 'attention' as const : 'stable' as const,
    label: largeDifference ? '最新数据待确认' : falling ? '近期增长速度有所变化' : '轨迹稳定',
    triggerReassurance: largeDifference || falling || (latest.heightPosition?.percentile ?? 50) < 15 || (latest.weightPosition?.percentile ?? 50) < 15,
    days,
    heightDelta: latest.heightCm != null && previous.heightCm != null ? Math.round((latest.heightCm - previous.heightCm) * 10) / 10 : null,
    weightDelta: latest.weightKg != null && previous.weightKg != null ? Math.round((latest.weightKg - previous.weightKg) * 10) / 10 : null
  }
}
