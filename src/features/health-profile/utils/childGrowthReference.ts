import type { ProfileGender } from '../../../types'
import {
  FEMALE_LENGTH_HEIGHT_FOR_AGE,
  FEMALE_WEIGHT_FOR_AGE,
  MALE_LENGTH_HEIGHT_FOR_AGE,
  MALE_WEIGHT_FOR_AGE,
  WHO_CHILD_GROWTH_STANDARD,
  type WhoLmsPoint
} from './whoGrowthReferenceData'
import { CDC_CHILD_GROWTH_REFERENCE, CDC_FEMALE_STATURE_FOR_AGE, CDC_FEMALE_WEIGHT_FOR_AGE, CDC_MALE_STATURE_FOR_AGE, CDC_MALE_WEIGHT_FOR_AGE } from './cdcGrowthReferenceData'

export { WHO_CHILD_GROWTH_STANDARD, CDC_CHILD_GROWTH_REFERENCE }

export type GrowthMeasure = 'height' | 'weight'
export type GrowthReferenceId = 'who-2006' | 'cdc-2000'

export const GROWTH_REFERENCE_COMPARISON_VERSION = 'who-cdc-v1'
export const GROWTH_REFERENCE_COMPARISON_PATH = '/health-profile/basic'

export function growthReferenceRange(referenceId: GrowthReferenceId = 'who-2006') {
  return referenceId === 'cdc-2000' ? CDC_CHILD_GROWTH_REFERENCE : WHO_CHILD_GROWTH_STANDARD
}

function referencePoints(gender: ProfileGender, measure: GrowthMeasure, referenceId: GrowthReferenceId) {
  if (referenceId === 'cdc-2000') return gender === 'female'
    ? measure === 'height' ? CDC_FEMALE_STATURE_FOR_AGE : CDC_FEMALE_WEIGHT_FOR_AGE
    : measure === 'height' ? CDC_MALE_STATURE_FOR_AGE : CDC_MALE_WEIGHT_FOR_AGE
  return gender === 'female'
    ? measure === 'height' ? FEMALE_LENGTH_HEIGHT_FOR_AGE : FEMALE_WEIGHT_FOR_AGE
    : measure === 'height' ? MALE_LENGTH_HEIGHT_FOR_AGE : MALE_WEIGHT_FOR_AGE
}

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
  if (!Number.isFinite(ageInMonths) || !points.length || ageInMonths < points[0][0] || ageInMonths > points[points.length - 1][0]) return null
  const upperIndex = points.findIndex(([month]) => month >= ageInMonths)
  const upper = points[upperIndex]
  const lower = upper?.[0] === ageInMonths ? upper : points[upperIndex - 1]
  if (!lower || !upper) return null
  if (lower[0] === upper[0]) return lower
  const ratio = (ageInMonths - lower[0]) / (upper[0] - lower[0])
  return [ageInMonths, lower[1] + (upper[1] - lower[1]) * ratio, lower[2] + (upper[2] - lower[2]) * ratio, lower[3] + (upper[3] - lower[3]) * ratio]
}

export function growthValueAtZScore(input: { ageInMonths: number; gender: ProfileGender; measure: GrowthMeasure; zScore: number; referenceId?: GrowthReferenceId }) {
  if ((input.gender !== 'female' && input.gender !== 'male') || !Number.isFinite(input.zScore)) return null
  const points = referencePoints(input.gender, input.measure, input.referenceId ?? 'who-2006')
  const lms = interpolateGrowthLms(points, input.ageInMonths)
  if (!lms) return null
  const [, l, median, coefficient] = lms
  const value = Math.abs(l) < 0.000001 ? median * Math.exp(coefficient * input.zScore) : median * ((1 + l * coefficient * input.zScore) ** (1 / l))
  return Number.isFinite(value) && value > 0 ? value : null
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
  if (zScore < -1.8808 || zScore > 1.8808) return '超出主要参考区间，请先确认测量是否准确'
  if (zScore < -1.0364) return '参考区间中下部'
  if (zScore > 1.0364) return '参考区间中上部'
  return '参考区间中部'
}

export function calculateGrowthPosition(input: {
  birthday?: string
  gender?: ProfileGender
  measuredAt: string | Date
  measure: GrowthMeasure
  value: number
  referenceId?: GrowthReferenceId
}): GrowthPosition | null {
  if ((input.gender !== 'female' && input.gender !== 'male') || !Number.isFinite(input.value) || input.value <= 0) return null
  const ageInMonths = exactAgeInMonths(input.birthday, input.measuredAt)
  if (ageInMonths == null) return null
  const points = referencePoints(input.gender, input.measure, input.referenceId ?? 'who-2006')
  const lms = interpolateGrowthLms(points, ageInMonths)
  if (!lms) return null
  const [, l, median, coefficient] = lms
  const zScore = Math.abs(l) < 0.000001
    ? Math.log(input.value / median) / coefficient
    : ((input.value / median) ** l - 1) / (l * coefficient)
  const percentile = normalCdf(zScore) * 100
  if (!Number.isFinite(zScore) || !Number.isFinite(percentile)) return null
  return {
    ageInMonths,
    percentile,
    percentileLabel: percentileText(percentile),
    position: Math.max(4, Math.min(96, percentile)),
    referenceMessage: growthReferenceMessage(zScore),
    zScore
  }
}
