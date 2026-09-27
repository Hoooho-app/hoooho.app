import type { GrowthMeasurementApiDto, Member } from '../../../types'

type GrowthSource = Pick<Member, 'heightCm' | 'weightKg'>

export interface CurrentGrowthMeasurements {
  heightCm: number | null
  weightKg: number | null
}

export function resolveCurrentGrowthMeasurements(
  member: GrowthSource,
  measurements: readonly GrowthMeasurementApiDto[],
  memberId: string
): CurrentGrowthMeasurements {
  const matching = measurements
    .filter((item) => item.memberId === memberId)
    .sort((left, right) => right.measuredAt.localeCompare(left.measuredAt) || right.createdAt.localeCompare(left.createdAt))
  const confirmed = matching.filter((item) => item.dataStatus === 'confirmed')
  const preferred = confirmed.length ? confirmed : matching

  return {
    heightCm: preferred.find((item) => item.heightCm != null)?.heightCm ?? member.heightCm ?? null,
    weightKg: preferred.find((item) => item.weightKg != null)?.weightKg ?? member.weightKg ?? null,
  }
}

export function formatGrowthMeasurement(value: number | null) {
  return value == null ? '' : value.toFixed(1)
}
