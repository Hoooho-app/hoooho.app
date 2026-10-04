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
  const { heightCm, weightKg } = resolveCurrentGrowthSnapshot(member, measurements, memberId)
  return { heightCm, weightKg }
}

// Dates come from the same selected measurement as each value, never from refresh time.
export function resolveCurrentGrowthSnapshot(
  member: GrowthSource,
  measurements: readonly GrowthMeasurementApiDto[],
  memberId: string
): CurrentGrowthMeasurements & { heightMeasuredAt: string | null; weightMeasuredAt: string | null } {
  const matching = measurements
    .filter((item) => item.memberId === memberId)
    .sort((left, right) => right.measuredAt.localeCompare(left.measuredAt) || right.createdAt.localeCompare(left.createdAt))
  const confirmed = matching.filter((item) => item.dataStatus === 'confirmed')
  const preferred = confirmed.length ? confirmed : matching
  const height = preferred.find(item => item.heightCm != null)
  const weight = preferred.find(item => item.weightKg != null)

  return {
    heightCm: height?.heightCm ?? member.heightCm ?? null,
    weightKg: weight?.weightKg ?? member.weightKg ?? null,
    heightMeasuredAt: height?.measuredAt ?? null,
    weightMeasuredAt: weight?.measuredAt ?? null,
  }
}

export function formatGrowthMeasurement(value: number | null) {
  return value == null ? '' : value.toFixed(1)
}
