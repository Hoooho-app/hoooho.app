import type { ProfileGender } from '../../../types'
import {
  FEMALE_LENGTH_HEIGHT_FOR_AGE,
  FEMALE_WEIGHT_FOR_AGE,
  MALE_LENGTH_HEIGHT_FOR_AGE,
  MALE_WEIGHT_FOR_AGE,
  WHO_CHILD_GROWTH_STANDARD,
  type WhoLmsPoint
} from './whoGrowthReferenceData'

export { WHO_CHILD_GROWTH_STANDARD }

export type GrowthMeasure = 'height' | 'weight'

export interface GrowthPosition {
  ageInMonths: number
  percentile: number
  percentileLabel: string
  position: number
  referenceMessage: string
  zScore: number
}

function parseLocalDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function exactAgeInMonths(birthday: string | undefined, measuredAt: string | Date) {
  const birth = birthday ? parseLocalDate(birthday) : null
  const measurement = measuredAt instanceof Date ? measuredAt : parseLocalDate(measuredAt)
  if (!birth || !measurement || measurement < birth) return null

  let completedMonths = (measurement.getFullYear() - birth.getFullYear()) * 12 + measurement.getMonth() - birth.getMonth()
  const anniversary = new Date(birth.getFullYear(), birth.getMonth() + completedMonths, birth.getDate())
  if (anniversary > measurement) completedMonths -= 1
  const currentBoundary = new Date(birth.getFullYear(), birth.getMonth() + completedMonths, birth.getDate())
  const nextBoundary = new Date(birth.getFullYear(), birth.getMonth() + completedMonths + 1, birth.getDate())
  const fraction = (measurement.getTime() - currentBoundary.getTime()) / (nextBoundary.getTime() - currentBoundary.getTime())
  return Math.max(0, completedMonths + Math.max(0, Math.min(1, fraction)))
}

export function heightMeasureLabel(birthday: string | undefined, measuredAt: string | Date) {
  const months = exactAgeInMonths(birthday, measuredAt)
  return months != null && months < 24 ? '身长' : '身高'
}

export function interpolateGrowthLms(points: readonly WhoLmsPoint[], ageInMonths: number): WhoLmsPoint | null {
  if (ageInMonths < WHO_CHILD_GROWTH_STANDARD.minimumMonth || ageInMonths > WHO_CHILD_GROWTH_STANDARD.maximumMonth) return null
  const lowerMonth = Math.floor(ageInMonths)
  const upperMonth = Math.ceil(ageInMonths)
  const lower = points.find(([month]) => month === lowerMonth)
  const upper = points.find(([month]) => month === upperMonth)
  if (!lower || !upper) return null
  if (lowerMonth === upperMonth) return lower
  const ratio = ageInMonths - lowerMonth
  return [ageInMonths, lower[1] + (upper[1] - lower[1]) * ratio, lower[2] + (upper[2] - lower[2]) * ratio, lower[3] + (upper[3] - lower[3]) * ratio]
}

export function growthValueAtZScore(input: { ageInMonths: number; gender: ProfileGender; measure: GrowthMeasure; zScore: number }) {
  if (input.gender !== 'female' && input.gender !== 'male') return null
  const points = input.gender === 'female'
    ? input.measure === 'height' ? FEMALE_LENGTH_HEIGHT_FOR_AGE : FEMALE_WEIGHT_FOR_AGE
    : input.measure === 'height' ? MALE_LENGTH_HEIGHT_FOR_AGE : MALE_WEIGHT_FOR_AGE
  const lms = interpolateGrowthLms(points, input.ageInMonths)
  if (!lms) return null
  const [, l, median, coefficient] = lms
  return Math.abs(l) < 0.000001 ? median * Math.exp(coefficient * input.zScore) : median * ((1 + l * coefficient * input.zScore) ** (1 / l))
}

function normalCdf(value: number) {
  const sign = value < 0 ? -1 : 1
  const x = Math.abs(value) / Math.sqrt(2)
  const t = 1 / (1 + 0.3275911 * x)
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x))
  return (1 + erf) / 2
}

function percentileText(percentile: number) {
  if (percentile < 1) return '<P1'
  if (percentile > 99) return '>P99'
  return `P${Math.round(percentile)}`
}

export function growthReferenceMessage(zScore: number) {
  const absolute = Math.abs(zScore)
  if (absolute > 3) return '本次数值与参考区间差距较大，请先确认测量是否准确'
  if (zScore < -1.5) return '接近参考区间下沿'
  if (zScore > 1.5) return '接近参考区间上沿'
  return '位于常见成长区间'
}

export function calculateGrowthPosition(input: {
  birthday?: string
  gender?: ProfileGender
  measuredAt: string | Date
  measure: GrowthMeasure
  value: number
}): GrowthPosition | null {
  if ((input.gender !== 'female' && input.gender !== 'male') || !Number.isFinite(input.value) || input.value <= 0) return null
  const ageInMonths = exactAgeInMonths(input.birthday, input.measuredAt)
  if (ageInMonths == null) return null
  const points = input.gender === 'female'
    ? input.measure === 'height' ? FEMALE_LENGTH_HEIGHT_FOR_AGE : FEMALE_WEIGHT_FOR_AGE
    : input.measure === 'height' ? MALE_LENGTH_HEIGHT_FOR_AGE : MALE_WEIGHT_FOR_AGE
  const lms = interpolateGrowthLms(points, ageInMonths)
  if (!lms) return null
  const [, l, median, coefficient] = lms
  const zScore = Math.abs(l) < 0.000001
    ? Math.log(input.value / median) / coefficient
    : ((input.value / median) ** l - 1) / (l * coefficient)
  const percentile = normalCdf(zScore) * 100
  return {
    ageInMonths,
    percentile,
    percentileLabel: percentileText(percentile),
    position: Math.max(4, Math.min(96, percentile)),
    referenceMessage: growthReferenceMessage(zScore),
    zScore
  }
}
